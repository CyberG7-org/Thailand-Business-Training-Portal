import { formatDate, type ISODate } from './thai-date';

export const MAX_NOTIFICATION_ATTEMPTS = 5;

/** Exponential backoff in minutes after a failed attempt: 1, 2, 4, 8, 16. */
export function backoffMinutes(attempt: number): number {
  return Math.min(2 ** Math.max(0, attempt - 1), 16);
}

export type ExamResultPayload = {
  login_id: string;
  display_name: string | null;
  company_name_th: string | null;
  attempt_no: number;
  score: number;
  max_score: number;
  result: 'pass' | 'fail';
  passing_mark_percent: number;
  submitted_on: ISODate;
};

export function examResultMessage(p: ExamResultPayload): { subject: string; text: string } {
  const pct = p.max_score > 0 ? Math.round((p.score / p.max_score) * 100) : 0;
  const who = p.display_name ? `${p.display_name} (${p.login_id})` : p.login_id;
  const resultTh = p.result === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน';
  const resultEn = p.result === 'pass' ? 'PASS' : 'FAIL';
  return {
    subject: `[Exam ${resultEn}] ${who} — ${p.score}/${p.max_score} (${pct}%)`,
    text: [
      `ผลสอบ: ${resultTh} — ${who}`,
      `บริษัท: ${p.company_name_th ?? '-'}`,
      `คะแนน: ${p.score}/${p.max_score} (${pct}%) เกณฑ์ผ่าน ${p.passing_mark_percent}% ครั้งที่ ${p.attempt_no}`,
      `วันที่ส่ง: ${formatDate(p.submitted_on, 'th')}`,
      '',
      `Exam result: ${resultEn} — ${who}`,
      `Company: ${p.company_name_th ?? '-'}`,
      `Score: ${p.score}/${p.max_score} (${pct}%), passing mark ${p.passing_mark_percent}%, attempt ${p.attempt_no}`,
      `Submitted: ${formatDate(p.submitted_on, 'en')}`,
    ].join('\n'),
  };
}

/** Learners may retry when under the attempt cap and past the waiting period. */
export function canStartExam(args: {
  submittedCount: number;
  lastSubmittedAt: string | null;
  maxAttempts: number | null;
  retryWaitHours: number;
  now: Date;
}): { ok: true } | { ok: false; reason: 'max_attempts' | 'retry_wait'; retryAt?: string } {
  if (args.maxAttempts !== null && args.submittedCount >= args.maxAttempts) {
    return { ok: false, reason: 'max_attempts' };
  }
  if (args.lastSubmittedAt && args.retryWaitHours > 0) {
    const retryAt = new Date(
      new Date(args.lastSubmittedAt).getTime() + args.retryWaitHours * 3_600_000,
    );
    if (args.now < retryAt)
      return { ok: false, reason: 'retry_wait', retryAt: retryAt.toISOString() };
  }
  return { ok: true };
}
