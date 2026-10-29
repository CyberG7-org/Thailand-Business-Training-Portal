import { describe, expect, it } from 'vitest';
import { MCQ_STARTER } from '@/lib/content/mcq-starter';
import { starterQuizTranslation } from '@/lib/content/mcq-manual-translations';
import { localizeFrozenQuestion } from '@/lib/domain/mcq/frozen-localization';
import { buildAttemptQuestions } from '@/lib/domain/mcq/attempt';
import { renderVariant } from '@/lib/domain/mcq/render';
import { SAMPLE_CONTEXT } from '@/lib/domain/mcq/sample';
import type { Variant } from '@/lib/domain/mcq/variant';

const starter = MCQ_STARTER.find((entry) => entry.key === 'mcq-v2-first-incoming-funds-2')!;
const variant: Variant = {
  ...starter,
  id: starter.key,
  status: 'approved',
  texts: {
    ...starter.texts,
    ms: starterQuizTranslation(starter.conceptKey, 'ms', starter.key)!,
    ta: starterQuizTranslation(starter.conceptKey, 'ta', starter.key)!,
  },
};

describe('older bank attempt localization', () => {
  it('reconstructs all 30 questions from a pre-translation attempt', () => {
    const bank: Variant[] = MCQ_STARTER.map((entry) => ({
      ...entry,
      id: entry.key,
      status: 'approved',
      texts: {
        ...entry.texts,
        ms: starterQuizTranslation(entry.conceptKey, 'ms', entry.key)!,
        ta: starterQuizTranslation(entry.conceptKey, 'ta', entry.key)!,
      },
    }));
    const { questions, missing } = buildAttemptQuestions(bank, SAMPLE_CONTEXT, 'old-attempt');
    expect(missing).toEqual([]);
    expect(questions).toHaveLength(30);
    for (const question of questions) {
      const selected = bank.find((entry) => entry.id === question.variantId)!;
      for (const language of ['ms', 'ta'] as const) {
        const view = localizeFrozenQuestion({
          variant: selected,
          context: SAMPLE_CONTEXT,
          englishFacts: SAMPLE_CONTEXT.facts,
          translatedFacts: SAMPLE_CONTEXT.facts,
          seed: `old-attempt:${selected.id}`,
          language,
          frozenEnglish: question.localized.en!,
        });
        expect(view, `${question.conceptKey}:${language}`).toEqual(question.localized[language]);
      }
    }
  });

  it('translates a frozen English question without changing presented keys or answer order', () => {
    const english = renderVariant(variant, SAMPLE_CONTEXT, 'old-seed', 'en');
    expect(english.ok).toBe(true);
    if (!english.ok) return;
    const original = [...english.rendered.options].reverse().map((option, index) => ({
      key: ['A', 'B', 'C', 'D'][index] as 'A' | 'B' | 'C' | 'D',
      text: option.text,
    }));
    const frozenEnglish = {
      prompt: english.rendered.prompt,
      options: original,
      explanation: english.rendered.explanation,
    };
    for (const language of ['ms', 'ta'] as const) {
      const view = localizeFrozenQuestion({
        variant,
        context: SAMPLE_CONTEXT,
        englishFacts: SAMPLE_CONTEXT.facts,
        translatedFacts: SAMPLE_CONTEXT.facts,
        seed: 'old-seed',
        language,
        frozenEnglish,
      });
      expect(view).not.toBeNull();
      expect(view?.prompt).not.toBe(frozenEnglish.prompt);
      expect(view?.options.map((option) => option.key)).toEqual(
        original.map((option) => option.key),
      );
      expect(view?.options[0].text).not.toBe(original[0].text);
    }
  });

  it('keeps the frozen English question when its original choices cannot be matched', () => {
    const english = renderVariant(variant, SAMPLE_CONTEXT, 'old-seed', 'en');
    if (!english.ok) throw new Error('fixture did not render');
    const view = localizeFrozenQuestion({
      variant,
      context: SAMPLE_CONTEXT,
      englishFacts: SAMPLE_CONTEXT.facts,
      translatedFacts: SAMPLE_CONTEXT.facts,
      seed: 'old-seed',
      language: 'ta',
      frozenEnglish: {
        prompt: english.rendered.prompt,
        options: english.rendered.options.map((option) => ({
          ...option,
          text: 'Changed after start',
        })),
        explanation: english.rendered.explanation,
      },
    });
    expect(view).toBeNull();
  });
});
