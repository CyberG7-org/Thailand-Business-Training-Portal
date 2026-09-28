import type { FactSheet } from './types';

const LONG_FACT = 20;
const LABEL_LINE = /^[^:\n]{2,40}:\s*\S/;

function normalise(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Spec §4.3: an answer that reproduces the record wholesale is not the learner's knowledge.
 * Two long facts verbatim, or three "label: value" lines, mark it. One long fact typed out —
 * an address, a product line — is an honest answer and passes.
 */
export function detectPasted(answer: string, facts: FactSheet): boolean {
  const text = normalise(answer);
  const longFacts = Object.values(facts)
    .filter((v): v is string => typeof v === 'string' && v.trim().length >= LONG_FACT)
    .map(normalise);
  const reproduced = new Set(longFacts.filter((v) => text.includes(v))).size;
  if (reproduced >= 2) return true;
  const labelLines = answer.split('\n').filter((line) => LABEL_LINE.test(line.trim())).length;
  return labelLines >= 3;
}
