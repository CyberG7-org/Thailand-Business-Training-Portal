import { MCQ_CONCEPTS } from '@/lib/domain/concepts/registry';
import type { AppliesWhen, Variant } from './variant';

export type CaseCoverage = { when: AppliesWhen | null; approved: number };

export type ConceptCoverage = {
  conceptKey: string;
  /** One case for every company, or two per status fact the concept turns on (spec §8). */
  cases: CaseCoverage[];
  covered: boolean;
  counts: { approved: number; draft: number; retired: number };
};

const covers = (variant: Variant, when: AppliesWhen | null): boolean =>
  variant.appliesWhen === null ||
  (when !== null &&
    variant.appliesWhen.fact === when.fact &&
    variant.appliesWhen.value === when.value);

/**
 * Which concepts the bank can already ask in every status: a concept is covered when each of
 * its cases has an approved variant. A variant with no status condition covers every case.
 */
export function bankCoverage(variants: readonly Variant[]): {
  concepts: ConceptCoverage[];
  ready: number;
  total: number;
} {
  const concepts = MCQ_CONCEPTS.map((concept): ConceptCoverage => {
    const own = variants.filter((v) => v.conceptKey === concept.key);
    const approved = own.filter((v) => v.status === 'approved');
    const whens: (AppliesWhen | null)[] =
      concept.alternateWhen.length === 0
        ? [null]
        : concept.alternateWhen.flatMap((fact) => [
            { fact, value: true },
            { fact, value: false },
          ]);
    const cases = whens.map((when) => ({
      when,
      approved: approved.filter((v) => covers(v, when)).length,
    }));
    return {
      conceptKey: concept.key,
      cases,
      covered: cases.every((c) => c.approved > 0),
      counts: {
        approved: approved.length,
        draft: own.filter((v) => v.status === 'draft').length,
        retired: own.filter((v) => v.status === 'retired').length,
      },
    };
  });
  return { concepts, ready: concepts.filter((c) => c.covered).length, total: concepts.length };
}
