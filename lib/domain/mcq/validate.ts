import { MCQ_CONCEPTS } from '@/lib/domain/concepts/registry';
import type { FactKey } from '@/lib/domain/facts/fact-sheet';
import { classify, GrammarError, placeholdersOf, signature } from './grammar';
import { DRAWING_FUNCTIONS, TOKENS } from './tokens';
import { OPTION_KEYS, VARIANT_LOCALES, type VariantDraft, type VariantText } from './variant';

export const ISSUE_CODES = [
  'unknown_concept',
  'thai_required',
  'prompt_required',
  'option_required',
  'grammar',
  'recipe_mismatch',
  'prompt_varies',
  'correct_varies',
  'correct_foreign_fact',
  'correct_needs_fact',
  'duplicate_option',
  'applies_when_fact',
  'translation_placeholders',
] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];

/** One thing wrong with a variant: what, where (`th.B`, `en.prompt`, `appliesWhen`) and a detail. */
export type VariantIssue = { code: IssueCode; where: string; detail: string };

const FIELDS = ['prompt', ...OPTION_KEYS, 'explanation'] as const;
type Field = (typeof FIELDS)[number];

const fieldText = (text: VariantText, field: Field): string =>
  field === 'prompt'
    ? text.prompt
    : field === 'explanation'
      ? (text.explanation ?? '')
      : text.options[field];

/**
 * Every rule a variant must keep to be saved and approved (spec §8, plan decisions 4–8). An
 * empty list means valid. Grammar errors are reported alone: the later rules read parsed text.
 */
export function validateVariant(v: VariantDraft): VariantIssue[] {
  const concept = MCQ_CONCEPTS.find((c) => c.key === v.conceptKey);
  if (!concept) return [{ code: 'unknown_concept', where: 'concept', detail: v.conceptKey }];
  const th = v.texts.th;
  if (!th) return [{ code: 'thai_required', where: 'th', detail: '' }];

  const issues: VariantIssue[] = [];
  const add = (code: IssueCode, where: string, detail = '') => issues.push({ code, where, detail });

  // 1. Grammar, field by field, in every language that was written.
  for (const locale of VARIANT_LOCALES) {
    const text = v.texts[locale];
    if (!text) continue;
    for (const field of FIELDS) {
      try {
        placeholdersOf(fieldText(text, field));
      } catch (e) {
        if (!(e instanceof GrammarError)) throw e;
        add('grammar', `${locale}.${field}`, `${e.code}: ${e.raw}`);
      }
    }
  }
  if (issues.length > 0) return issues;

  if (v.appliesWhen && !concept.alternateWhen.includes(v.appliesWhen.fact)) {
    add('applies_when_fact', 'appliesWhen', v.appliesWhen.fact);
  }

  // 2. Each language: nothing blank, no variation outside the options, the Thai placeholders.
  for (const locale of VARIANT_LOCALES) {
    const text = v.texts[locale];
    if (!text) continue;
    if (text.prompt.trim() === '') add('prompt_required', `${locale}.prompt`);
    for (const key of OPTION_KEYS) {
      if (text.options[key].trim() === '') add('option_required', `${locale}.${key}`);
    }
    for (const field of ['prompt', 'explanation'] as const) {
      if (placeholdersOf(fieldText(text, field)).some((p) => p.fn !== null)) {
        add('prompt_varies', `${locale}.${field}`);
      }
    }
    if (locale === 'th') continue;
    for (const field of FIELDS) {
      const expected = signature(fieldText(th, field));
      if (signature(fieldText(text, field)) !== expected) {
        add('translation_placeholders', `${locale}.${field}`, expected);
      }
    }
  }

  // 3. The Thai options: the declared recipe, the correct option, no repeated text.
  for (const key of OPTION_KEYS) {
    const actual = classify(th.options[key]);
    if (th.options[key].trim() !== '' && v.optionRecipes[key] !== actual) {
      add('recipe_mismatch', `th.${key}`, actual);
    }
  }
  const correct = placeholdersOf(th.options[v.correctKey]);
  const where = `th.${v.correctKey}`;
  if (correct.some((p) => p.fn !== null)) add('correct_varies', where);
  const conceptFacts: readonly FactKey[] = concept.facts;
  const foreign = correct.filter((p) =>
    TOKENS[p.token].facts.some((fact) => !conceptFacts.includes(fact)),
  );
  if (foreign.length > 0) {
    add('correct_foreign_fact', where, [...new Set(foreign.map((p) => p.token))].join(', '));
  }
  if (
    correct.length === 0 &&
    th.options[v.correctKey].trim() !== '' &&
    concept.facts.length > 0 &&
    !v.appliesWhen
  ) {
    add('correct_needs_fact', where);
  }
  const seen = new Map<string, string>();
  for (const key of OPTION_KEYS) {
    const option = th.options[key].trim();
    if (option === '') continue;
    const drawn = placeholdersOf(option).some(
      (p) => p.fn !== null && DRAWING_FUNCTIONS.includes(p.fn),
    );
    if (drawn) continue;
    const earlier = seen.get(option);
    if (earlier) add('duplicate_option', `th.${key}`, earlier);
    else seen.set(option, key);
  }
  return issues;
}
