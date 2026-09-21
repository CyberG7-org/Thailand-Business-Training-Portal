/** Index jobs give up after this many failed attempts (decision D41). */
export const MAX_INDEX_ATTEMPTS = 5;

/** Minutes to wait after failed attempt n: 1, 2, 4, 8, 16. */
export function retryDelayMinutes(attempt: number): number {
  return Math.min(2 ** Math.max(0, attempt - 1), 16);
}
