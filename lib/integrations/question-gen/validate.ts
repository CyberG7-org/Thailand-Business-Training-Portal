import { LOCALES, type AppLocale } from '@/i18n/routing';
import { TemplateSyntaxError, placeholderFields } from '@/lib/domain/assessment/template';
import type { GeneratedLocalization, GeneratedQuestion } from './types';

const KEYS = ['A', 'B', 'C', 'D'] as const;
const PLACEHOLDER_RE = /\{[a-z_]+(?:\|[^}]+)?\}/g;

export type Rejection = { index: number; reason: string };
export type ValidationResult = {
  accepted: GeneratedQuestion[];
  rejected: Rejection[];
};

function placeholderSignature(loc: GeneratedLocalization): string {
  const all = [loc.prompt, ...loc.options.map((o) => o.text)].join('\n');
  return (all.match(PLACEHOLDER_RE) ?? []).sort().join('|');
}

function checkLocalization(loc: GeneratedLocalization): string | null {
  if (!loc.prompt.trim()) return 'empty prompt';
  if (loc.options.length !== 4) return `expected 4 options, got ${loc.options.length}`;
  const keys = loc.options.map((o) => o.key);
  if (KEYS.some((k, i) => keys[i] !== k)) return 'options must be A, B, C, D in order';
  if (loc.options.some((o) => !o.text.trim())) return 'empty option text';
  if (!keys.includes(loc.correct_key)) return 'correct key is not an option';
  return null;
}

/**
 * Rejects malformed questions instead of repairing them (decision D34): exactly four A–D options,
 * a valid correct key shared by all languages, known placeholders used identically per language,
 * and template questions must actually use a placeholder.
 */
export function validateGenerated(
  questions: GeneratedQuestion[],
  options: { bannedLiterals?: string[] } = {},
): ValidationResult {
  const accepted: GeneratedQuestion[] = [];
  const rejected: Rejection[] = [];
  const banned = (options.bannedLiterals ?? []).map((v) => v.toLowerCase());
  questions.forEach((q, index) => {
    const reason = reasonToReject(q) ?? literalLeak(q, banned);
    if (reason) rejected.push({ index, reason });
    else accepted.push(trim(q));
  });
  return { accepted, rejected };
}

function reasonToReject(q: GeneratedQuestion): string | null {
  for (const lang of LOCALES) {
    const loc = q.localizations[lang];
    if (!loc) return `missing ${lang}`;
    const problem = checkLocalization(loc);
    if (problem) return `${lang}: ${problem}`;
  }
  const correct = new Set(LOCALES.map((l) => q.localizations[l].correct_key));
  if (correct.size !== 1) return 'correct key differs between languages';

  let fields = 0;
  try {
    for (const lang of LOCALES) {
      const loc = q.localizations[lang];
      for (const text of [loc.prompt, ...loc.options.map((o) => o.text)]) {
        fields += placeholderFields(text).length;
      }
    }
  } catch (e) {
    return e instanceof TemplateSyntaxError ? e.message : 'invalid placeholder';
  }
  const signatures = new Set(LOCALES.map((l) => placeholderSignature(q.localizations[l])));
  if (signatures.size !== 1) return 'placeholders differ between languages';
  if (q.kind === 'dbd_template' && fields === 0) return 'template question uses no placeholder';
  return null;
}

/** A shared question must not carry one learner's real data (decision D36). */
function literalLeak(q: GeneratedQuestion, banned: string[]): string | null {
  if (banned.length === 0) return null;
  for (const lang of LOCALES) {
    const loc = q.localizations[lang];
    const haystack = [loc.prompt, loc.explanation, ...loc.options.map((o) => o.text)]
      .join('\n')
      .toLowerCase();
    const hit = banned.find((v) => haystack.includes(v));
    if (hit) return `${lang}: contains reference value "${hit}"`;
  }
  return null;
}

function trim(q: GeneratedQuestion): GeneratedQuestion {
  const localizations = {} as Record<AppLocale, GeneratedLocalization>;
  for (const lang of LOCALES) {
    const loc = q.localizations[lang];
    localizations[lang] = {
      prompt: loc.prompt.trim(),
      options: loc.options.map((o) => ({ key: o.key, text: o.text.trim() })),
      correct_key: loc.correct_key,
      explanation: loc.explanation.trim(),
    };
  }
  return { kind: q.kind, localizations };
}

/**
 * A translation must mirror the source: same option keys in the same order, same correct key,
 * identical placeholders, nothing empty. Returns the reason to reject or null.
 */
export function translationProblem(
  source: GeneratedLocalization,
  translated: GeneratedLocalization,
): string | null {
  if (!translated.prompt.trim()) return 'empty prompt';
  if (translated.options.length !== source.options.length) return 'option count differs';
  if (translated.options.some((o, i) => o.key !== source.options[i]?.key)) {
    return 'option keys differ';
  }
  if (translated.options.some((o) => !o.text.trim())) return 'empty option text';
  if (translated.correct_key !== source.correct_key) return 'correct key differs';
  if (placeholderSignature(translated) !== placeholderSignature(source)) {
    return 'placeholders differ';
  }
  try {
    for (const text of [translated.prompt, ...translated.options.map((o) => o.text)]) {
      placeholderFields(text);
    }
  } catch (e) {
    return e instanceof TemplateSyntaxError ? e.message : 'invalid placeholder';
  }
  return null;
}
