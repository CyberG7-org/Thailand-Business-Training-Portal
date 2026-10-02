import { createRng, shuffleWith } from '@/lib/domain/assessment/random';
import type { FactKey, FactSheet } from '@/lib/domain/facts/fact-sheet';
import { firstAmount } from '@/lib/domain/standard-answers';
import { formatDate, type ISODate, type Locale } from '@/lib/domain/thai-date';
import { withCheckDigit } from '@/lib/domain/validation/juristic-id';
import type { CategoryLabel, RenderContext } from './context';
import { formatNumber, formatQuantity, geoLabel } from './format';
import { GrammarError, parseTemplate, type Placeholder } from './grammar';
import { TOKENS, type GeoKind, type TokenKind, type TokenName } from './tokens';
import { OPTION_KEYS, type Variant, type VariantOptionKey } from './variant';

export type RenderFailureCode =
  | 'no_text'
  | 'not_applicable'
  | 'missing_fact'
  | 'no_category'
  | 'no_alternatives'
  | 'out_of_range'
  | 'grammar';

export type Rendered = {
  prompt: string;
  options: { key: VariantOptionKey; text: string }[];
  explanation: string | null;
};

export type RenderResult =
  { ok: true; rendered: Rendered } | { ok: false; code: RenderFailureCode; detail: string };

class RenderFailure extends Error {
  constructor(
    public readonly code: RenderFailureCode,
    public readonly detail: string,
  ) {
    super(`${code}: ${detail}`);
  }
}

const SIBLINGS = {
  province: 'provinces',
  district: 'districts',
  subdistrict: 'subdistricts',
} as const;

/** One or two digits changed, never the first, the check digit recomputed (plan decision 7). */
export function mutateId(id: string, rng: () => number): string {
  const digits = id.slice(0, 12).split('');
  const changes = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < changes; i++) {
    const at = 1 + Math.floor(rng() * 11);
    const shift = 1 + Math.floor(rng() * 9);
    digits[at] = String((Number(digits[at]) + shift) % 10);
  }
  return withCheckDigit(digits.join(''));
}

/**
 * What one rendering has drawn so far. A list is shuffled once per seed and handed out in
 * order, so alternates never repeat inside a question, and a second language asking in the
 * same order gets the same draws (spec §8).
 */
class Draws {
  private readonly lists = new Map<string, unknown[]>();
  private readonly taken = new Map<string, number>();
  private readonly ids: string[] = [];

  constructor(private readonly seed: string) {}

  next<T>(name: string, candidates: readonly T[]): T | null {
    let list = this.lists.get(name) as T[] | undefined;
    if (!list) {
      list = shuffleWith(candidates, createRng(`${this.seed}:${name}`));
      this.lists.set(name, list);
    }
    const index = this.taken.get(name) ?? 0;
    this.taken.set(name, index + 1);
    return list[index] ?? null;
  }

  mutatedId(original: string): string | null {
    const rng = createRng(`${this.seed}:id_mutation:${this.ids.length}`);
    for (let attempt = 0; attempt < 50; attempt++) {
      const candidate = mutateId(original, rng);
      if (candidate !== original && !this.ids.includes(candidate)) {
        this.ids.push(candidate);
        return candidate;
      }
    }
    return null;
  }
}

function numberOf(token: TokenName, facts: FactSheet): number | null {
  switch (token) {
    case 'registered_capital':
      return facts.registered_capital;
    case 'total_shares':
      return facts.total_shares;
    case 'my_shares':
      return facts.my_shares;
    case 'my_share_percent':
      return facts.my_share_percent;
    case 'director_count':
      return facts.director_count;
    case 'shareholder_count':
      return facts.shareholder_count;
    // An answer written in words has no amount to vary: the placeholder is missing.
    case 'monthly_revenue_amount':
      return firstAmount(facts.monthly_revenue);
    case 'average_transaction_amount':
      return firstAmount(facts.average_transaction);
    case 'monthly_transactions_count':
      return firstAmount(facts.monthly_transactions);
    default:
      return null;
  }
}

function textOf(token: TokenName, facts: FactSheet): string | null {
  if (token === 'address') return facts.address?.full ?? null;
  if (token === 'postcode') return facts.address?.postcode ?? null;
  const value = facts[token as FactKey];
  return typeof value === 'string' ? value : null;
}

function varyNumber(base: number, arg: string, kind: TokenKind, raw: string): number {
  const moved = arg.startsWith('x') ? base * Number(arg.slice(1)) : base + Number(arg);
  const value = kind === 'percent' ? Math.round(moved * 100) / 100 : Math.round(moved);
  if (!(value > 0) || (kind === 'percent' && value > 100)) {
    throw new RenderFailure('out_of_range', raw);
  }
  return value;
}

/** ±N days, months or years; a month that is too short takes its last day. */
function shiftDate(date: ISODate, arg: string): ISODate {
  const n = Number.parseInt(arg, 10);
  const unit = arg.at(-1);
  const [y, m, d] = date.split('-').map(Number);
  const iso = (t: Date) => t.toISOString().slice(0, 10);
  if (unit === 'd') return iso(new Date(Date.UTC(y, m - 1, d + n)));
  const months = y * 12 + (m - 1) + (unit === 'y' ? n * 12 : n);
  const year = Math.floor(months / 12);
  const month = months % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(year, month, Math.min(d, last))));
}

function ownCategory(ctx: RenderContext): CategoryLabel {
  const own = ctx.categories.find((c) => c.key === ctx.facts.business_category);
  if (!own) throw new RenderFailure('no_category', 'business_category');
  return own;
}

function resolve(p: Placeholder, ctx: RenderContext, locale: Locale, draws: Draws): string {
  const { facts } = ctx;
  const kind = TOKENS[p.token].kind;
  const missing = (): never => {
    throw new RenderFailure('missing_fact', p.token);
  };

  if (p.fn === null) {
    if (kind === 'text') return textOf(p.token, facts)?.trim() || missing();
    if (kind === 'names') {
      const names =
        p.token === 'directors'
          ? facts.directors.map((d) => (locale === 'en' ? (d.name_en ?? d.name_th) : d.name_th))
          : facts.shareholders.map((s) => s.name);
      return names.length > 0 ? names.join(', ') : missing();
    }
    if (kind === 'id') return facts.juristic_id ?? missing();
    if (kind === 'date') {
      return facts.registered_on ? formatDate(facts.registered_on, locale) : missing();
    }
    if (kind === 'province' || kind === 'district' || kind === 'subdistrict') {
      const own = ctx.geo[kind];
      return own ? geoLabel(own, locale) : missing();
    }
    if (kind === 'category') return ownCategory(ctx)[locale];
    const n = numberOf(p.token, facts);
    return n === null ? missing() : formatQuantity(kind, n, locale);
  }

  const arg = p.arg ?? '';
  switch (p.fn) {
    case 'numeric': {
      const base = numberOf(p.token, facts) ?? missing();
      return formatQuantity(kind, varyNumber(base, arg, kind, p.raw), locale);
    }
    case 'count': {
      const value = (numberOf(p.token, facts) ?? missing()) + Number(arg);
      if (value < 1) throw new RenderFailure('out_of_range', p.raw);
      return formatNumber(value, locale);
    }
    case 'date':
      return formatDate(shiftDate(facts.registered_on ?? missing(), arg), locale);
    case 'id_mutation': {
      const base = facts.juristic_id ?? missing();
      if (!/^\d{13}$/.test(base)) throw new RenderFailure('out_of_range', p.raw);
      const mutated = draws.mutatedId(base);
      if (!mutated) throw new RenderFailure('no_alternatives', p.raw);
      return mutated;
    }
    case 'geo_alt': {
      const place = kind as GeoKind;
      if (!ctx.geo[place]) missing();
      const pick = draws.next(`geo_alt:${place}`, ctx.geo[SIBLINGS[place]]);
      if (!pick) throw new RenderFailure('no_alternatives', p.raw);
      return geoLabel(pick, locale);
    }
    case 'business_alt': {
      const own = ownCategory(ctx);
      const pick = draws.next(
        'business_alt',
        ctx.categories.filter((c) => c.active && c.key !== own.key),
      );
      if (!pick) throw new RenderFailure('no_alternatives', p.raw);
      return pick[locale];
    }
  }
}

function renderText(text: string, ctx: RenderContext, locale: Locale, draws: Draws): string {
  return parseTemplate(text)
    .map((part) =>
      part.type === 'text' ? part.text : resolve(part.placeholder, ctx, locale, draws),
    )
    .join('')
    .trim();
}

/**
 * Renders a variant for one company in one language. The seed fixes every draw; options come
 * back in the order written (shuffling is the attempt's business, P17e). A language without a
 * translation shows the Thai text with that language's formatting.
 */
export function renderVariant(
  variant: Pick<Variant, 'appliesWhen' | 'texts'>,
  ctx: RenderContext,
  seed: string,
  locale: Locale,
): RenderResult {
  const text = variant.texts[locale] ?? variant.texts.th;
  if (!text) return { ok: false, code: 'no_text', detail: locale };
  const when = variant.appliesWhen;
  if (when && ctx.facts[when.fact] !== when.value) {
    return { ok: false, code: 'not_applicable', detail: when.fact };
  }
  const draws = new Draws(seed);
  try {
    const prompt = renderText(text.prompt, ctx, locale, draws);
    const options = OPTION_KEYS.map((key) => ({
      key,
      text: renderText(text.options[key], ctx, locale, draws),
    }));
    const explanation = text.explanation ? renderText(text.explanation, ctx, locale, draws) : null;
    return { ok: true, rendered: { prompt, options, explanation } };
  } catch (e) {
    if (e instanceof RenderFailure) return { ok: false, code: e.code, detail: e.detail };
    if (e instanceof GrammarError) return { ok: false, code: 'grammar', detail: e.raw };
    throw e;
  }
}
