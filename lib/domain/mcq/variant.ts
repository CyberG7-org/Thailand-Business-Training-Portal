import type { StatusFact } from '@/lib/domain/facts/fact-sheet';
import type { Locale } from '@/lib/domain/thai-date';
import { GrammarError, parseTemplate } from './grammar';
import type { Recipe } from './tokens';

export const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;
export type VariantOptionKey = (typeof OPTION_KEYS)[number];
export const VARIANT_LOCALES = ['th', 'en', 'zh'] as const satisfies readonly Locale[];

/** One language of a variant: the prompt, exactly four options, an optional explanation. */
export type VariantText = {
  prompt: string;
  options: Record<VariantOptionKey, string>;
  explanation: string | null;
};

/** The status a variant is worded for (spec §8); null means every company. */
export type AppliesWhen = { fact: StatusFact; value: boolean };
export type VariantStatus = 'draft' | 'approved' | 'retired';

/**
 * A question variant of one MCQ concept. Thai is the text it is approved on; English and
 * Chinese are reference translations with the same placeholders.
 */
export type Variant = {
  id: string;
  key: string;
  conceptKey: string;
  status: VariantStatus;
  correctKey: VariantOptionKey;
  optionRecipes: Record<VariantOptionKey, Recipe>;
  appliesWhen: AppliesWhen | null;
  texts: Partial<Record<Locale, VariantText>>;
};

/** What the validator and the writer need: a variant before it has an id. */
export type VariantDraft = Pick<
  Variant,
  'conceptKey' | 'correctKey' | 'optionRecipes' | 'appliesWhen' | 'texts'
>;

/** A starter draft: a variant with the key it is loaded under (`lib/content/mcq-starter.ts`). */
export type StarterVariant = VariantDraft & { key: string };

function placeholdersOnly(option: string): boolean {
  try {
    const parts = parseTemplate(option);
    return (
      parts.some((p) => p.type === 'placeholder') &&
      parts.every((p) => p.type === 'placeholder' || p.text.trim() === '')
    );
  } catch (e) {
    if (e instanceof GrammarError) return false;
    throw e;
  }
}

/**
 * A blank English or Chinese option takes the Thai option when that one is placeholders only:
 * `{registered_capital|numeric(x2)}` reads the same in every language.
 */
export function inheritPlaceholders(texts: Variant['texts']): Variant['texts'] {
  const th = texts.th;
  if (!th) return texts;
  const out: Variant['texts'] = { th };
  for (const locale of ['en', 'zh'] as const) {
    const text = texts[locale];
    if (!text) continue;
    const options = { ...text.options };
    for (const key of OPTION_KEYS) {
      if (options[key].trim() === '' && placeholdersOnly(th.options[key])) {
        options[key] = th.options[key].trim();
      }
    }
    out[locale] = { ...text, options };
  }
  return out;
}
