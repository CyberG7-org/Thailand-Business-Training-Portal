/** Index jobs give up after this many failed attempts (decision D41). */
export const MAX_INDEX_ATTEMPTS = 5;

/** Minutes to wait after failed attempt n: 1, 2, 4, 8, 16. */
export function retryDelayMinutes(attempt: number): number {
  return Math.min(2 ** Math.max(0, attempt - 1), 16);
}

/** Documents up to this many pages may be attached whole to a model call (spec §5.1, D42). */
export const DEFAULT_DIRECT_READ_MAX_PAGES = 20;

export function directReadMaxPages(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.DIRECT_READ_MAX_PAGES);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_DIRECT_READ_MAX_PAGES;
}
