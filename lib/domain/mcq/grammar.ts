import {
  FUNCTION_KINDS,
  GEO_SCOPES,
  isRecipeFunction,
  isTokenName,
  RECIPE_FUNCTIONS,
  TOKENS,
  type GeoKind,
  type Recipe,
  type RecipeFunction,
  type TokenName,
} from './tokens';

export type GrammarErrorCode =
  'unbalanced' | 'unknown_token' | 'unknown_recipe' | 'recipe_not_for_token' | 'bad_argument';

/** A placeholder the grammar does not accept; `raw` is what was typed. */
export class GrammarError extends Error {
  constructor(
    public readonly code: GrammarErrorCode,
    public readonly raw: string,
  ) {
    super(`${code}: ${raw}`);
    this.name = 'GrammarError';
  }
}

export type Placeholder = {
  raw: string;
  token: TokenName;
  fn: RecipeFunction | null;
  arg: string | null;
  recipe: Recipe;
};

export type Part =
  { type: 'text'; text: string } | { type: 'placeholder'; placeholder: Placeholder };

const BRACES = /\{([^{}]*)\}/g;
const INNER = /^([a-z_]+)(?:\|([a-z_]+)(?:\(([^()]*)\))?)?$/;

const ARGUMENTS: Record<RecipeFunction, (arg: string | null, token: TokenName) => boolean> = {
  // x<factor> (not 1) or +N / -N (not 0).
  numeric: (arg) =>
    arg !== null &&
    ((/^x\d+(\.\d+)?$/.test(arg) && Number(arg.slice(1)) > 0 && Number(arg.slice(1)) !== 1) ||
      (/^[+-]\d+$/.test(arg) && Number(arg) !== 0)),
  count: (arg) => arg !== null && /^[+-]\d+$/.test(arg) && Number(arg) !== 0,
  date: (arg) => arg !== null && /^[+-]\d+[dmy]$/.test(arg) && Number.parseInt(arg, 10) !== 0,
  id_mutation: (arg) => arg === null,
  geo_alt: (arg, token) => arg === GEO_SCOPES[TOKENS[token].kind as GeoKind],
  business_alt: (arg) => arg === null,
};

function parsePlaceholder(raw: string, inner: string): Placeholder {
  const m = INNER.exec(inner);
  if (!m) throw new GrammarError('unknown_token', raw);
  const [, token, fn, arg] = m;
  if (!isTokenName(token)) throw new GrammarError('unknown_token', raw);
  if (fn === undefined) return { raw, token, fn: null, arg: null, recipe: 'DIRECT_FACT' };
  if (!isRecipeFunction(fn)) throw new GrammarError('unknown_recipe', raw);
  if (!FUNCTION_KINDS[fn].includes(TOKENS[token].kind)) {
    throw new GrammarError('recipe_not_for_token', raw);
  }
  if (!ARGUMENTS[fn](arg ?? null, token)) throw new GrammarError('bad_argument', raw);
  return { raw, token, fn, arg: arg ?? null, recipe: RECIPE_FUNCTIONS[fn] };
}

/** Text and placeholders in the order written. Throws `GrammarError` on anything unknown. */
export function parseTemplate(text: string): Part[] {
  const parts: Part[] = [];
  let last = 0;
  for (const m of text.matchAll(BRACES)) {
    const at = m.index ?? 0;
    if (at > last) parts.push({ type: 'text', text: text.slice(last, at) });
    parts.push({ type: 'placeholder', placeholder: parsePlaceholder(m[0], m[1]) });
    last = at + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) });
  if (parts.some((p) => p.type === 'text' && /[{}]/.test(p.text))) {
    throw new GrammarError('unbalanced', text);
  }
  return parts;
}

export function placeholdersOf(text: string): Placeholder[] {
  return parseTemplate(text).flatMap((p) => (p.type === 'placeholder' ? [p.placeholder] : []));
}

/**
 * The recipe an option's text amounts to (D77): no placeholder is STATIC, one placeholder and
 * nothing else is that placeholder's recipe, anything more is a COMPOSITE_TEMPLATE.
 */
export function classify(text: string): Recipe {
  const parts = parseTemplate(text);
  const placeholders = parts.flatMap((p) => (p.type === 'placeholder' ? [p.placeholder] : []));
  if (placeholders.length === 0) return 'STATIC';
  const bare = parts.every((p) => p.type === 'placeholder' || p.text.trim() === '');
  return placeholders.length === 1 && bare ? placeholders[0].recipe : 'COMPOSITE_TEMPLATE';
}

/** The placeholders in order: a translation must have the same ones (spec §8). */
export function signature(text: string): string {
  return placeholdersOf(text)
    .map((p) => p.raw)
    .join(' ');
}
