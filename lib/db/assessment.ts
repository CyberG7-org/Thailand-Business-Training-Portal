import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppLocale } from '@/i18n/routing';
import {
  evaluateResult,
  renderQuestion,
  scoreAnswers,
  selectQuestions,
  type OptionKey,
  type QuestionOption,
  type QuestionText,
  type SelectableQuestion,
} from '@/lib/domain/assessment/engine';
import { MissingFieldError, type TemplateRecord } from '@/lib/domain/assessment/template';
import { EMPTY_BUSINESS_PROFILE, readStructuredData } from '@/lib/domain/dbd-profile';
import type { Director } from '@/lib/domain/dbd-record';
import { createSupabaseAdminClient } from './admin';
import { getActiveAssignmentForUser } from './assignments';
import type { Database, Json } from './database.types';
import type { DbdRecordRow } from './dbd-records';

type Db = SupabaseClient<Database>;
export type AttemptKind = 'quiz' | 'exam';
export type AttemptRow = Database['public']['Tables']['assessment_attempts']['Row'];
export type AnswerRow = Database['public']['Tables']['assessment_answers']['Row'];
export type AttemptWithAnswers = AttemptRow & { assessment_answers: AnswerRow[] };

export class AssessmentError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'no_assignment'
      | 'no_questions'
      | 'not_found'
      | 'not_in_progress'
      | 'already_answered'
      | 'unanswered'
      | 'invalid_key',
  ) {
    super(message);
    this.name = 'AssessmentError';
  }
}

type BankQuestion = SelectableQuestion & { text: QuestionText };

function toTemplateRecord(record: DbdRecordRow): TemplateRecord {
  const business = readStructuredData(record.structured_data).business ?? EMPTY_BUSINESS_PROFILE;
  return {
    company_name_th: record.company_name_th,
    company_name_en: record.company_name_en,
    juristic_id: record.juristic_id,
    certificate_no: record.certificate_no,
    registered_capital: record.registered_capital,
    head_office_address: record.head_office_address,
    registered_on: record.registered_on,
    issued_on: record.issued_on,
    directors: (record.directors as unknown as Director[] | null) ?? null,
    objectives_count: record.objectives_count,
    signing_authority: record.signing_authority,
    province: record.province,
    objectives: business.objectives.length ? business.objectives : null,
    business_categories: business.business_categories.length ? business.business_categories : null,
    shareholders: business.shareholders.length ? business.shareholders : null,
    promoters: business.promoters.length ? business.promoters : null,
    total_shares: business.share_structure.total_shares,
    par_value: business.share_structure.par_value,
  };
}

/** Approved questions with the localization for `language` (service role: correct keys included). */
export async function loadQuestionBank(
  admin: Db,
  pool: AttemptKind,
  language: AppLocale,
): Promise<BankQuestion[]> {
  const { data, error } = await admin
    .from('questions')
    .select(
      'id, kind, approval_status, active, pools, dbd_field_dependencies, question_localizations!inner(language, prompt, options, correct_key, explanation)',
    )
    .eq('approval_status', 'approved')
    .eq('active', true)
    .contains('pools', [pool])
    .eq('question_localizations.language', language);
  if (error) throw error;
  return data.map((q) => {
    const loc = (q.question_localizations as unknown as QuestionText[])[0];
    return {
      id: q.id,
      kind: q.kind as SelectableQuestion['kind'],
      approval_status: q.approval_status as SelectableQuestion['approval_status'],
      active: q.active,
      pools: q.pools,
      dbd_field_dependencies:
        q.dbd_field_dependencies as SelectableQuestion['dbd_field_dependencies'],
      text: {
        prompt: loc.prompt,
        options: loc.options as QuestionOption[],
        correct_key: loc.correct_key,
        explanation: loc.explanation,
      },
    };
  });
}

export async function getInProgressAttempt(
  admin: Db,
  userId: string,
  kind: AttemptKind,
): Promise<AttemptRow | null> {
  const { data, error } = await admin
    .from('assessment_attempts')
    .select('*')
    .eq('user_id', userId)
    .eq('kind', kind)
    .eq('status', 'in_progress')
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Resumes the learner's in-progress attempt or starts a new one: picks approved questions the
 * record can satisfy, renders and shuffles them, and snapshots everything in answer rows.
 */
export async function getOrStartAttempt(args: {
  userId: string;
  kind: AttemptKind;
  language: AppLocale;
  count: number;
  passingMarkPercent?: number;
}): Promise<AttemptRow> {
  const admin = createSupabaseAdminClient();
  const existing = await getInProgressAttempt(admin, args.userId, args.kind);
  if (existing) return existing;

  const assignment = await getActiveAssignmentForUser(admin, args.userId);
  if (!assignment) throw new AssessmentError('No active assignment', 'no_assignment');
  const record = toTemplateRecord(assignment.dbd_records);

  const seed = `${args.userId}:${args.kind}:${Date.now()}`;
  const bank = await loadQuestionBank(admin, args.kind, args.language);
  const selected = selectQuestions({
    pool: args.kind,
    count: args.count,
    seed,
    questions: bank,
    record,
  });
  if (selected.length === 0) throw new AssessmentError('No questions available', 'no_questions');

  const rendered = selected.flatMap((q) => {
    try {
      return [renderQuestion(q.id, q.text, record, seed, args.language)];
    } catch (e) {
      if (e instanceof MissingFieldError) return [];
      throw e;
    }
  });
  if (rendered.length === 0) throw new AssessmentError('No questions available', 'no_questions');

  const { data: last } = await admin
    .from('assessment_attempts')
    .select('attempt_no')
    .eq('user_id', args.userId)
    .eq('kind', args.kind)
    .order('attempt_no', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: attempt, error } = await admin
    .from('assessment_attempts')
    .insert({
      user_id: args.userId,
      dbd_record_id: assignment.dbd_record_id,
      kind: args.kind,
      language: args.language,
      attempt_no: (last?.attempt_no ?? 0) + 1,
      question_ids: rendered.map((r) => r.questionId),
      shuffle_seed: seed,
      passing_mark_snapshot: args.passingMarkPercent ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  const { error: answersError } = await admin.from('assessment_answers').insert(
    rendered.map((r, position) => ({
      attempt_id: attempt.id,
      question_id: r.questionId,
      position,
      presented_option_order: r.presentedOrder,
      rendered_prompt: r.prompt,
      rendered_options: r.options as unknown as Json,
    })),
  );
  if (answersError) {
    await admin.from('assessment_attempts').delete().eq('id', attempt.id);
    throw answersError;
  }
  return attempt;
}

/** Learner-scoped read (RLS): the attempt with its answers in presentation order. */
export async function getAttemptWithAnswers(
  db: Db,
  attemptId: string,
): Promise<AttemptWithAnswers | null> {
  const { data, error } = await db
    .from('assessment_attempts')
    .select('*, assessment_answers(*)')
    .eq('id', attemptId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const attempt = data as AttemptWithAnswers;
  attempt.assessment_answers.sort((a, b) => a.position - b.position);
  return attempt;
}

export async function listMyAttempts(
  db: Db,
  userId: string,
  kind: AttemptKind,
): Promise<AttemptRow[]> {
  const { data, error } = await db
    .from('assessment_attempts')
    .select('*')
    .eq('user_id', userId)
    .eq('kind', kind)
    .order('started_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function requireOwnedInProgress(
  admin: Db,
  userId: string,
  attemptId: string,
): Promise<AttemptRow> {
  const { data } = await admin
    .from('assessment_attempts')
    .select('*')
    .eq('id', attemptId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) throw new AssessmentError('Attempt not found', 'not_found');
  if (data.status !== 'in_progress')
    throw new AssessmentError('Attempt is closed', 'not_in_progress');
  return data;
}

export type AnswerFeedback = {
  isCorrect: boolean;
  correctKey: OptionKey;
  explanation: string | null;
};

/**
 * Records an answer; correctness is computed server-side from the stored key.
 * Returns feedback for the caller to reveal (quiz) or withhold (exam).
 */
export async function answerQuestion(args: {
  userId: string;
  attemptId: string;
  questionId: string;
  selectedKey: string;
}): Promise<AnswerFeedback> {
  const admin = createSupabaseAdminClient();
  const attempt = await requireOwnedInProgress(admin, args.userId, args.attemptId);

  const { data: answer } = await admin
    .from('assessment_answers')
    .select('id, selected_key, presented_option_order')
    .eq('attempt_id', attempt.id)
    .eq('question_id', args.questionId)
    .maybeSingle();
  if (!answer) throw new AssessmentError('Question is not part of this attempt', 'not_found');
  if (answer.selected_key !== null)
    throw new AssessmentError('Already answered', 'already_answered');
  if (!answer.presented_option_order.includes(args.selectedKey)) {
    throw new AssessmentError('Unknown option', 'invalid_key');
  }

  const { data: loc } = await admin
    .from('question_localizations')
    .select('correct_key, explanation')
    .eq('question_id', args.questionId)
    .eq('language', attempt.language)
    .single();
  if (!loc) throw new AssessmentError('Question text missing', 'not_found');

  const isCorrect = loc.correct_key === args.selectedKey;
  const { error } = await admin
    .from('assessment_answers')
    .update({
      selected_key: args.selectedKey,
      is_correct: isCorrect,
      answered_at: new Date().toISOString(),
    })
    .eq('id', answer.id);
  if (error) throw error;
  return { isCorrect, correctKey: loc.correct_key as OptionKey, explanation: loc.explanation };
}

/** Scores and closes the attempt; every question must be answered. */
export async function submitAttempt(args: {
  userId: string;
  attemptId: string;
}): Promise<AttemptRow> {
  const admin = createSupabaseAdminClient();
  const attempt = await requireOwnedInProgress(admin, args.userId, args.attemptId);
  const { data: answers, error } = await admin
    .from('assessment_answers')
    .select('is_correct, selected_key')
    .eq('attempt_id', attempt.id);
  if (error) throw error;
  if (answers.some((a) => a.selected_key === null)) {
    throw new AssessmentError('Answer every question first', 'unanswered');
  }
  const { score, maxScore } = scoreAnswers(answers);
  const result =
    attempt.kind === 'exam' && attempt.passing_mark_snapshot !== null
      ? evaluateResult(score, maxScore, Number(attempt.passing_mark_snapshot))
      : null;
  const { data, error: updateError } = await admin
    .from('assessment_attempts')
    .update({
      status: 'submitted',
      score,
      max_score: maxScore,
      result,
      submitted_at: new Date().toISOString(),
    })
    .eq('id', attempt.id)
    .select()
    .single();
  if (updateError) throw updateError;
  return data;
}

/** Correct keys and explanations for a closed attempt's review (never for in-progress exams). */
export async function getReviewKeys(
  attempt: AttemptRow,
): Promise<Map<string, { correctKey: OptionKey; explanation: string | null }>> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('question_localizations')
    .select('question_id, correct_key, explanation')
    .in('question_id', attempt.question_ids)
    .eq('language', attempt.language);
  if (error) throw error;
  return new Map(
    data.map((r) => [
      r.question_id,
      { correctKey: r.correct_key as OptionKey, explanation: r.explanation },
    ]),
  );
}
