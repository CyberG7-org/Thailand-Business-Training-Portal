/**
 * Questions per generation batch. One batch is a single Opus call that writes every question in
 * three languages, and it must finish inside the 300 s a Vercel function may take (D49): ten
 * questions is about 2–3 minutes. Run another batch for more.
 */
export const MAX_GENERATION_COUNT = 10;
/** Client timeouts that fit the same window, with room for the rest of the request. */
export const GENERATION_TIMEOUT_MS = 270_000;
export const TRANSLATION_TIMEOUT_MS = 120_000;
