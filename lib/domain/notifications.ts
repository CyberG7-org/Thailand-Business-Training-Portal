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
  result: 'pass' | 'retest' | 'fail';
  passing_mark_percent: number;
  /** Attempts judged by the rule of D71: the score that passes, and how many key facts were wrong. */
  pass_score?: number;
  critical_wrong?: number;
  submitted_on: ISODate;
};

const RESULT_TH = { pass: 'ผ่าน', retest: 'ทำใหม่อีกครั้ง', fail: 'ไม่ผ่าน' } as const;
const RESULT_EN = { pass: 'PASS', retest: 'RETEST', fail: 'FAIL' } as const;

export function examResultMessage(p: ExamResultPayload): { subject: string; text: string } {
  const pct = p.max_score > 0 ? Math.round((p.score / p.max_score) * 100) : 0;
  const who = p.display_name ? `${p.display_name} (${p.login_id})` : p.login_id;
  const resultTh = RESULT_TH[p.result];
  const resultEn = RESULT_EN[p.result];
  const ruled = p.pass_score !== undefined;
  const markTh = ruled
    ? `เกณฑ์ผ่าน ${p.pass_score}/${p.max_score} ข้อสำคัญที่ตอบผิด ${p.critical_wrong ?? 0} ข้อ`
    : `เกณฑ์ผ่าน ${p.passing_mark_percent}%`;
  const markEn = ruled
    ? `pass at ${p.pass_score}/${p.max_score}, key facts wrong: ${p.critical_wrong ?? 0}`
    : `passing mark ${p.passing_mark_percent}%`;
  return {
    subject: `[Business Knowledge Quiz ${resultEn}] ${who} — ${p.score}/${p.max_score} (${pct}%)`,
    text: [
      `ผลแบบทดสอบความรู้ธุรกิจ: ${resultTh} — ${who}`,
      `บริษัท: ${p.company_name_th ?? '-'}`,
      `คะแนน: ${p.score}/${p.max_score} (${pct}%) ${markTh} ครั้งที่ ${p.attempt_no}`,
      `วันที่ส่ง: ${formatDate(p.submitted_on, 'th')}`,
      '',
      `Business Knowledge Quiz result: ${resultEn} — ${who}`,
      `Company: ${p.company_name_th ?? '-'}`,
      `Score: ${p.score}/${p.max_score} (${pct}%), ${markEn}, attempt ${p.attempt_no}`,
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
