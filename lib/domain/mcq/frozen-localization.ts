import type { RenderContext } from './context';
import type { FactSheet } from '@/lib/domain/facts/fact-sheet';
import type { PresentedQuestion } from './attempt';
import { renderVariant } from './render';
import type { Variant } from './variant';

/**
 * Recreate a locale that was not frozen when an older attempt began. Match every English
 * choice before replacing it; an edited question or changed fact keeps the original snapshot.
 * Presented keys and the stored correct key are never recalculated.
 */
export function localizeFrozenQuestion(args: {
  variant: Variant;
  context: RenderContext;
  englishFacts: FactSheet;
  translatedFacts: FactSheet;
  seed: string;
  language: 'ms' | 'ta';
  frozenEnglish: PresentedQuestion;
}): PresentedQuestion | null {
  const { variant, context, englishFacts, translatedFacts, seed, language, frozenEnglish } = args;
  if (!variant.texts[language]) return null;
  const english = renderVariant(variant, { ...context, facts: englishFacts }, seed, 'en');
  const translated = renderVariant(variant, { ...context, facts: translatedFacts }, seed, language);
  if (!english.ok || !translated.ok || english.rendered.prompt !== frozenEnglish.prompt)
    return null;
  const sourceChoices = new Map(
    english.rendered.options.map((option) => [option.text, option.key]),
  );
  if (sourceChoices.size !== english.rendered.options.length) return null;
  const translatedChoices = new Map(
    translated.rendered.options.map((option) => [option.key, option.text]),
  );
  const matched = frozenEnglish.options.map((option) => ({
    key: option.key,
    sourceKey: sourceChoices.get(option.text),
  }));
  if (matched.some((option) => !option.sourceKey)) return null;
  if (new Set(matched.map((option) => option.sourceKey)).size !== matched.length) return null;
  return {
    prompt: translated.rendered.prompt,
    options: matched.map((option) => ({
      key: option.key,
      text: translatedChoices.get(option.sourceKey!)!,
    })),
    explanation: translated.rendered.explanation,
  };
}
