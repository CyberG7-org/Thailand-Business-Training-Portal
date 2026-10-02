import 'server-only';
import type { AppLocale } from '@/i18n/routing';
import { getPolicy } from '@/lib/config/policy';
import { evaluateResult, scoreAnswers } from '@/lib/domain/assessment/engine';
import { mcqResult, readMcqRule } from '@/lib/domain/mcq/result';
import { canStartExam, type ExamResultPayload } from '@/lib/domain/notifications';
import { todayInBangkok } from '@/lib/domain/thai-date';
import { createSupabaseAdminClient } from './admin';
import { AssessmentError, getInProgressAttempt, type AttemptRow } from './assessment';
import type { Json } from './database.types';
import { McqStartError, startMcqAttempt } from './mcq-attempt';

export class ExamPolicyError extends Error {
  constructor(
    public readonly reason: 'max_attempts' | 'retry_wait',
    public readonly retryAt?: string,
  ) {
    super(reason);
    this.name = 'ExamPolicyError';
  }
}

/**
 * Starts (or resumes) the Business Knowledge Quiz after enforcing the configured retry policy.
 * A new attempt asks the Owner's bank, one question for each of the 30 concepts (D100); the
 * earlier question pool is the practice round's alone.
 */
export async function startExam(userId: string, language: AppLocale): Promise<AttemptRow> {
  const admin = createSupabaseAdminClient();
  const open = await getInProgressAttempt(admin, userId, 'exam');
  if (open) return open;
  const { data: submitted } = await admin
    .from('assessment_attempts')
    .select('submitted_at')
    .eq('user_id', userId)
    .eq('kind', 'exam')
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false });
  const [maxAttempts, retryWaitHours] = await Promise.all([
    getPolicy('exam_max_attempts'),
    getPolicy('exam_retry_wait_hours'),
  ]);
  const verdict = canStartExam({
    submittedCount: submitted?.length ?? 0,
    lastSubmittedAt: submitted?.[0]?.submitted_at ?? null,
    maxAttempts,
    retryWaitHours,
    now: new Date(),
  });
  if (!verdict.ok) throw new ExamPolicyError(verdict.reason, verdict.retryAt);
  try {
    return await startMcqAttempt({ userId, language });
  } catch (e) {
    if (e instanceof McqStartError) throw new AssessmentError(e.message, e.code);
    throw e;
  }
}

/**
 * Scores the exam and closes it through `finalize_attempt`, which also enqueues the
 * Telegram + Email notification rows atomically (AC-007/008).
 */
export async function finalizeExam(userId: string, attemptId: string): Promise<AttemptRow> {
  const admin = createSupabaseAdminClient();
  const { data: attempt } = await admin
    .from('assessment_attempts')
    .select('*, profiles!inner(login_id, display_name), dbd_records(company_name_th)')
    .eq('id', attemptId)
    .eq('user_id', userId)
    .eq('kind', 'exam')
    .maybeSingle();
  if (!attempt) throw new AssessmentError('Attempt not found', 'not_found');
  if (attempt.status !== 'in_progress') return attempt as AttemptRow;

  const { data: answers, error } = await admin
    .from('assessment_answers')
    .select('is_correct, selected_key, concept_key')
    .eq('attempt_id', attemptId);
  if (error) throw error;
  if (answers.some((a) => a.selected_key === null)) {
    throw new AssessmentError('Answer every question first', 'unanswered');
  }

  const { score, maxScore } = scoreAnswers(answers);
  // An attempt from the Owner's bank is judged by the rule frozen on it (D71); an earlier one by
  // its passing mark.
  const rule = readMcqRule(attempt.rule_snapshot);
  const passingMark = rule
    ? Math.round((rule.passScore / Math.max(1, maxScore)) * 100)
    : Number(attempt.passing_mark_snapshot ?? (await getPolicy('exam_passing_mark_percent')));
  const judged = rule
    ? mcqResult(
        answers.map((a) => ({ conceptKey: a.concept_key ?? '', isCorrect: a.is_correct === true })),
        rule,
      )
    : null;
  const result = judged ? judged.result : evaluateResult(score, maxScore, passingMark);

  const profile = attempt.profiles as unknown as { login_id: string; display_name: string | null };
  const record = attempt.dbd_records as unknown as { company_name_th: string | null } | null;
  const payload: ExamResultPayload = {
    login_id: profile.login_id,
    display_name: profile.display_name,
    company_name_th: record?.company_name_th ?? null,
    attempt_no: attempt.attempt_no,
    score,
    max_score: maxScore,
    result,
    passing_mark_percent: passingMark,
    ...(rule && judged
      ? { pass_score: rule.passScore, critical_wrong: judged.criticalWrong.length }
      : {}),
    submitted_on: todayInBangkok(),
  };

  const [chatIds, recipients] = await Promise.all([
    getPolicy('telegram_admin_chat_ids'),
    getPolicy('email_admin_recipients'),
  ]);
  const notifications = [
    ...chatIds.map((chatId) => ({
      event_type: 'exam_result',
      channel: 'telegram',
      destination_ref: chatId,
      payload,
      idempotency_key: `exam_result:${attemptId}:telegram:${chatId}`,
    })),
    ...recipients.map((email) => ({
      event_type: 'exam_result',
      channel: 'email',
      destination_ref: email,
      payload,
      idempotency_key: `exam_result:${attemptId}:email:${email}`,
    })),
  ];

  const { data, error: rpcError } = await admin.rpc('finalize_attempt', {
    p_attempt_id: attemptId,
    p_score: score,
    p_max_score: maxScore,
    p_result: result,
    p_notifications: notifications as unknown as Json,
  });
  if (rpcError) throw rpcError;
  return data as AttemptRow;
}

/** Exam pass per policy: 'any' submitted pass, or only the 'latest' submitted attempt. */
export async function examPassedFor(
  userId: string,
): Promise<{ submitted: number; passed: boolean }> {
  const admin = createSupabaseAdminClient();
  const [{ data }, rule] = await Promise.all([
    admin
      .from('assessment_attempts')
      .select('result, submitted_at')
      .eq('user_id', userId)
      .eq('kind', 'exam')
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false }),
    getPolicy('exam_pass_rule'),
  ]);
  const rows = data ?? [];
  const passed =
    rule === 'latest' ? rows[0]?.result === 'pass' : rows.some((r) => r.result === 'pass');
  return { submitted: rows.length, passed };
}
