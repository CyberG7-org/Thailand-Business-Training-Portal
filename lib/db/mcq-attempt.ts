import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppLocale } from '@/i18n/routing';
import { getPolicy } from '@/lib/config/policy';
import { assignmentFacts } from '@/lib/domain/facts/snapshot';
import { buildAttemptQuestions, type LocalizedQuestion } from '@/lib/domain/mcq/attempt';
import type { ConceptCheck } from '@/lib/domain/mcq/preflight';
import { mcqRule } from '@/lib/domain/mcq/result';
import { OPTION_KEYS, type VariantOptionKey } from '@/lib/domain/mcq/variant';
import { createSupabaseAdminClient } from './admin';
import { getActiveAssignmentForUser } from './assignments';
import type { Database, Json } from './database.types';
import { listVariants } from './mcq-bank';
import { loadRenderContext } from './mcq-context';
import { pinnedFactsFor } from './pinning';

type Db = SupabaseClient<Database>;
type AttemptRow = Database['public']['Tables']['assessment_attempts']['Row'];

/** The quiz cannot be started; `not_ready` names the concepts the bank cannot ask this company. */
export class McqStartError extends Error {
  constructor(
    public readonly code: 'no_assignment' | 'no_version' | 'not_ready',
    public readonly concepts: string[] = [],
  ) {
    super(code);
    this.name = 'McqStartError';
  }
}

/** The bank variants a learner's earlier attempts already asked. */
async function seenVariantIds(admin: Db, userId: string): Promise<Set<string>> {
  const { data, error } = await admin
    .from('assessment_attempts')
    .select('question_ids')
    .eq('user_id', userId)
    .eq('kind', 'exam');
  if (error) throw error;
  return new Set(data.flatMap((a) => a.question_ids));
}

/**
 * The record's staff are told which concepts the quiz could not ask (kind `render_failure`, one
 * open row per concept); a quiz that then starts closes them.
 */
async function reportRenderFailures(
  admin: Db,
  recordId: string,
  missing: readonly ConceptCheck[],
): Promise<void> {
  for (const check of missing) {
    const skipped = check.skipped.map((s) => `${s.key}:${s.code}`);
    const { error } = await admin.from('training_fact_exceptions').insert({
      dbd_record_id: recordId,
      kind: 'render_failure',
      field: check.conceptKey,
      blocks: 'none',
      detail: {
        rule: 'render_failure',
        signature: skipped.join('|') || 'no_variant',
        skipped,
      } as unknown as Json,
    });
    // 23505: this concept is already reported and still open.
    if (error && error.code !== '23505') throw error;
  }
}

async function closeRenderFailures(admin: Db, recordId: string): Promise<void> {
  const { error } = await admin
    .from('training_fact_exceptions')
    .update({ status: 'resolved', resolution: 'fixed', resolved_at: new Date().toISOString() })
    .eq('dbd_record_id', recordId)
    .eq('kind', 'render_failure')
    .eq('status', 'open');
  if (error) throw error;
}

/**
 * Starts the Business Knowledge Quiz for a learner (D99): thirty questions from the Owner's bank,
 * rendered from the facts the learner is pinned to, frozen on the attempt. The rule the attempt
 * will be judged by is frozen with it. The caller has already checked there is no attempt in
 * progress and that the retry policy allows a new one.
 */
export async function startMcqAttempt(args: {
  userId: string;
  language: AppLocale;
}): Promise<AttemptRow> {
  const admin = createSupabaseAdminClient();
  const assignment = await getActiveAssignmentForUser(admin, args.userId);
  if (!assignment) throw new McqStartError('no_assignment');
  // Rendered from the pinned version (D75), never from the live row.
  const pinned = await pinnedFactsFor(admin, assignment);
  if (!pinned) throw new McqStartError('no_version');

  const [ctx, variants, seen, passScore, retestScore] = await Promise.all([
    loadRenderContext(admin, assignmentFacts(pinned.snapshot, pinned.role)),
    listVariants(admin),
    seenVariantIds(admin, args.userId),
    getPolicy('mcq_pass_score'),
    getPolicy('mcq_retest_score'),
  ]);
  const seed = `${args.userId}:mcq:${Date.now()}`;
  const { questions, missing } = buildAttemptQuestions(variants, ctx, seed, seen);
  if (missing.length > 0) {
    await reportRenderFailures(admin, assignment.dbd_record_id, missing);
    throw new McqStartError(
      'not_ready',
      missing.map((m) => m.conceptKey),
    );
  }
  await closeRenderFailures(admin, assignment.dbd_record_id);

  const { data: last } = await admin
    .from('assessment_attempts')
    .select('attempt_no')
    .eq('user_id', args.userId)
    .eq('kind', 'exam')
    .order('attempt_no', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: attempt, error } = await admin
    .from('assessment_attempts')
    .insert({
      user_id: args.userId,
      dbd_record_id: assignment.dbd_record_id,
      kind: 'exam',
      language: args.language,
      attempt_no: (last?.attempt_no ?? 0) + 1,
      question_ids: questions.map((q) => q.variantId),
      shuffle_seed: seed,
      rule_snapshot: mcqRule(passScore, retestScore) as unknown as Json,
      training_version_id: pinned.version.id,
      role_snapshot: pinned.role as unknown as Json,
    })
    .select()
    .single();
  if (error) throw error;

  try {
    const { data: answers, error: answersError } = await admin
      .from('assessment_answers')
      .insert(
        questions.map((q, position) => {
          const shown = q.localized[args.language] ?? q.localized.th;
          return {
            attempt_id: attempt.id,
            question_id: q.variantId,
            concept_key: q.conceptKey,
            position,
            presented_option_order: [...OPTION_KEYS],
            rendered_prompt: shown.prompt,
            rendered_options: shown.options as unknown as Json,
          };
        }),
      )
      .select('id, question_id');
    if (answersError) throw answersError;
    const answerIds = new Map(answers.map((a) => [a.question_id, a.id]));
    const { error: keysError } = await admin.from('assessment_answer_keys').insert(
      questions.map((q) => ({
        answer_id: answerIds.get(q.variantId)!,
        correct_key: q.correctKey,
        localized: q.localized as unknown as Json,
      })),
    );
    if (keysError) throw keysError;
  } catch (e) {
    await admin.from('assessment_attempts').delete().eq('id', attempt.id);
    throw e;
  }
  return attempt;
}

export type AnswerKey = { correctKey: VariantOptionKey; localized: LocalizedQuestion };

/** The server's own copy of each bank question in an attempt, by answer row. Service role only. */
export async function answerKeysFor(
  admin: Db,
  answerIds: readonly string[],
): Promise<Map<string, AnswerKey>> {
  if (answerIds.length === 0) return new Map();
  const { data, error } = await admin
    .from('assessment_answer_keys')
    .select('answer_id, correct_key, localized')
    .in('answer_id', [...answerIds]);
  if (error) throw error;
  return new Map(
    data.map((row) => [
      row.answer_id,
      {
        correctKey: row.correct_key as VariantOptionKey,
        localized: row.localized as unknown as LocalizedQuestion,
      },
    ]),
  );
}
