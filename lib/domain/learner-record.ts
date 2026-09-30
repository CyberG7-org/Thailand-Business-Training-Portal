import { bangkokDateOf, bangkokTimeLabel } from './appointments/slots';
import { formatDate, type Locale } from './thai-date';

/**
 * The Learner Record's two results (D82). Until P17's evaluations ship, "MCQ" is the exam and
 * "Chatbot" is the readiness interview; the columns and pages switch to P17's evaluations then.
 */
export type McqResult = 'pass' | 'fail';
export type ChatbotResult = 'pass' | 'fail' | 'in_progress';
export type ChatbotSessionResult = 'pass' | 'fail' | 'in_progress' | 'abandoned';

type ExamAttempt = { result: string | null; submitted_at: string | null };
type InterviewSession = { status: string; verdict: string | null };

/**
 * Pass or fail by the exam rule in Policy settings (`exam_pass_rule`): `latest` — the most
 * recent submitted attempt decides; `any` — one pass is enough. Null when nothing was submitted.
 */
export function mcqResult(attempts: ExamAttempt[], rule: 'any' | 'latest'): McqResult | null {
  const submitted = attempts
    .filter((a) => a.submitted_at !== null)
    .sort((a, b) => b.submitted_at!.localeCompare(a.submitted_at!));
  if (submitted.length === 0) return null;
  const passed =
    rule === 'latest' ? submitted[0].result === 'pass' : submitted.some((a) => a.result === 'pass');
  return passed ? 'pass' : 'fail';
}

/** One session as the Chatbot history lists it: ready is a pass, not ready a fail. */
export function chatbotSessionResult(session: InterviewSession): ChatbotSessionResult {
  if (session.verdict === 'ready') return 'pass';
  if (session.verdict === 'not_ready') return 'fail';
  return session.status === 'in_progress' ? 'in_progress' : 'abandoned';
}

/**
 * A learner's Chatbot result: pass once any session ended ready — readiness never goes back
 * (D64) — fail when sessions ended and none was ready, in progress when one is still open and
 * none has ended yet. Null when there is nothing to show.
 */
export function chatbotResult(sessions: InterviewSession[]): ChatbotResult | null {
  const results = sessions.map(chatbotSessionResult);
  if (results.includes('pass')) return 'pass';
  if (results.includes('fail')) return 'fail';
  if (results.includes('in_progress')) return 'in_progress';
  return null;
}

/** A timestamp as the staff lists show it: the Bangkok date, printed per locale, and the time. */
export function dateTimeLabel(timestamp: string, locale: Locale): string {
  return `${formatDate(bangkokDateOf(timestamp), locale)} ${bangkokTimeLabel(timestamp)}`;
}
