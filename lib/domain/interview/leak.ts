import type { FactSheet } from './types';

/** Values shorter than this ("1", a province, a one-word trade) are not a leak worth acting on. */
const MIN_LENGTH = 8;

function normalise(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Spec §4.3: the officer never states a company fact. The prompt asks for it; this checks it.
 * Returns the first fact-sheet value — or one entry of a joined list such as the directors —
 * that the officer's words reproduce, or null when they state nothing.
 */
export function revealedFact(say: string, facts: FactSheet): string | null {
  const text = normalise(say);
  for (const value of Object.values(facts)) {
    if (typeof value !== 'string') continue;
    for (const part of [value, ...value.split(/[,;]\s*|\s\/\s/)]) {
      const v = normalise(part);
      if (v.length >= MIN_LENGTH && text.includes(v)) return part.trim();
    }
  }
  return null;
}
