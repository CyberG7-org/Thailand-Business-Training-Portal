import { createRng, shuffleWith } from '@/lib/domain/assessment/random';
import { MCQ_CONCEPTS } from '@/lib/domain/concepts/registry';
import type { Locale } from '@/lib/domain/thai-date';
import type { RenderContext } from './context';
import { pickVariant, type ConceptCheck } from './preflight';
import { renderVariant, type Rendered } from './render';
import { OPTION_KEYS, VARIANT_LOCALES, type Variant, type VariantOptionKey } from './variant';

/** A question as one learner sees it in one language: options in the order presented. */
export type PresentedQuestion = {
  prompt: string;
  options: { key: VariantOptionKey; text: string }[];
  explanation: string | null;
};
/** What `assessment_answer_keys.localized` holds: Thai always, the others as rendered. */
export type LocalizedQuestion = { th: PresentedQuestion } & Partial<
  Record<Locale, PresentedQuestion>
>;

export type AttemptQuestion = {
  conceptKey: string;
  variantId: string;
  /** The presented key (A–D by position) of the correct option. */
  correctKey: VariantOptionKey;
  localized: LocalizedQuestion;
};

/**
 * One question for each of the 30 concepts, for one company (spec §8). A variant the learner has
 * already been asked more often yields to a less-used one; the same seed draws the same places and
 * numbers in every language; the options are put in an order of their own, and from here on are
 * known only by their position, so the row a learner can read says nothing about which is right.
 */
export function buildAttemptQuestions(
  variants: readonly Variant[],
  ctx: RenderContext,
  seed: string,
  useCounts: ReadonlyMap<string, number> = new Map(),
): { questions: AttemptQuestion[]; missing: ConceptCheck[] } {
  const checks = MCQ_CONCEPTS.map((concept) =>
    pickVariant(concept.key, variants, ctx, seed, useCounts),
  );
  const missing = checks.filter((c) => c.variant === null);
  if (missing.length > 0) return { questions: [], missing };

  const questions = checks.map((check): AttemptQuestion => {
    const variant = check.variant!;
    const variantSeed = `${seed}:${variant.id}`;
    const order = shuffleWith(OPTION_KEYS, createRng(`${variantSeed}:order`));
    const present = (rendered: Rendered): PresentedQuestion => ({
      prompt: rendered.prompt,
      options: order.map((original, index) => ({
        key: OPTION_KEYS[index],
        text: rendered.options.find((o) => o.key === original)!.text,
      })),
      explanation: rendered.explanation,
    });
    const localized: LocalizedQuestion = { th: present(check.rendered!) };
    for (const locale of VARIANT_LOCALES) {
      if (locale === 'th') continue;
      const view = renderVariant(variant, ctx, variantSeed, locale);
      // A translation that cannot be rendered shows the Thai question: the one that was approved.
      localized[locale] = view.ok ? present(view.rendered) : localized.th;
    }
    return {
      conceptKey: check.conceptKey,
      variantId: variant.id,
      correctKey: OPTION_KEYS[order.indexOf(variant.correctKey)],
      localized,
    };
  });
  return { questions: shuffleWith(questions, createRng(`${seed}:questions`)), missing: [] };
}
