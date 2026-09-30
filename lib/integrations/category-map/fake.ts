import type { CategoryMapInput, CategoryMapResult, CategoryMapper } from './types';

const compact = (s: string) => s.toLowerCase().replace(/\s+/g, '');

/** Longest common substring length; the strings are a few hundred characters at most. */
function commonRun(a: string, b: string): number {
  let best = 0;
  const prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : 0;
      if (prev[j] > best) best = prev[j];
      diag = up;
    }
  }
  return best;
}

/**
 * Deterministic stand-in for tests and local work: the longest shared run of characters with a
 * category label. Six or more is a confident match, four or five a weak one to review.
 */
export class FakeCategoryMapper implements CategoryMapper {
  readonly name = 'fake' as const;
  readonly model = null;

  async map(input: CategoryMapInput): Promise<CategoryMapResult> {
    const text = compact(`${input.natureOfBusiness} ${input.productsServices ?? ''}`);
    let best: { key: string | null; run: number } = { key: null, run: 0 };
    for (const c of input.categories) {
      const run = Math.max(
        commonRun(text, compact(c.label_th)),
        commonRun(text, compact(c.label_en)),
      );
      if (run > best.run) best = { key: c.key, run };
    }
    if (best.run >= 6) return { key: best.key, confidence: 0.95 };
    if (best.run >= 4) return { key: best.key, confidence: 0.6 };
    return { key: null, confidence: 0 };
  }
}
