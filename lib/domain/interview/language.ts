import type { AppLocale } from '@/i18n/routing';
import type { Turn } from './types';

/** The officer speaks Thai even when the page UI or learner message uses another language. */
export const OFFICER_CONVERSATION_LANGUAGE: AppLocale = 'th';

/** Use the learner's latest written language; numbers and names inherit the page language. */
export function interviewReplyLanguage(
  message: string,
  transcript: readonly Turn[],
  pageLocale: AppLocale,
): AppLocale {
  const classify = (text: string): AppLocale | null => {
    const latin = (text.match(/[a-z]/gi) ?? []).length;
    const thai = (text.match(/[\u0e00-\u0e7f]/g) ?? []).length;
    const han = (text.match(/\p{Script=Han}/gu) ?? []).length;
    if (han > 0 && han >= latin && han >= thai) return 'zh';
    if (latin >= 3 && latin >= thai) return 'en';
    if (thai >= 3) return 'th';
    return null;
  };
  const current = classify(message);
  if (current) return current;
  for (const turn of [...transcript].reverse()) {
    if (turn.role !== 'learner') continue;
    const prior = classify(turn.content);
    if (prior) return prior;
  }
  return pageLocale;
}
