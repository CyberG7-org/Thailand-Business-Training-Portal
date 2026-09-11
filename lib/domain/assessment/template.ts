import type { Director } from '../dbd-record';
import { addCalendarDays, formatDate, type ISODate, type Locale } from '../thai-date';
import { createRng, shuffleWith } from './random';

/** Record fields that placeholders may reference. */
export const TEMPLATE_FIELDS = [
  'company_name_th',
  'company_name_en',
  'juristic_id',
  'certificate_no',
  'registered_capital',
  'head_office_address',
  'registered_on',
  'issued_on',
  'directors',
  'objectives_count',
  'signing_authority',
] as const;
export type TemplateField = (typeof TEMPLATE_FIELDS)[number];

export type TemplateRecord = {
  company_name_th: string | null;
  company_name_en: string | null;
  juristic_id: string | null;
  certificate_no: string | null;
  registered_capital: number | string | null;
  head_office_address: string | null;
  registered_on: ISODate | null;
  issued_on: ISODate | null;
  directors: Director[] | null;
  objectives_count: number | null;
  signing_authority: string | null;
};

export class MissingFieldError extends Error {
  constructor(public readonly field: string) {
    super(`Record has no value for ${field}`);
    this.name = 'MissingFieldError';
  }
}

export class TemplateSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateSyntaxError';
  }
}

const PLACEHOLDER = /\{([a-z_]+)(?:\|([^}]+))?\}/g;
const NUMBER_LOCALES: Record<Locale, string> = { th: 'th-TH', en: 'en-US', zh: 'zh-CN' };

/** Distinct record fields referenced by a template (for `dbd_field_dependencies`). */
export function placeholderFields(text: string): TemplateField[] {
  const found = new Set<TemplateField>();
  for (const m of text.matchAll(PLACEHOLDER)) {
    const field = m[1] as TemplateField;
    if (!(TEMPLATE_FIELDS as readonly string[]).includes(field)) {
      throw new TemplateSyntaxError(`Unknown placeholder field: ${m[1]}`);
    }
    found.add(field);
  }
  return [...found];
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

function applyNumberVariant(value: number, variant: string): number {
  const m = /^x(\d+(?:\.\d+)?)$/.exec(variant);
  if (!m) throw new TemplateSyntaxError(`Unsupported numeric variant: ${variant}`);
  return Math.round(value * Number(m[1]));
}

function applyDateVariant(value: ISODate, variant: string): ISODate {
  const m = /^([+-])(\d+)([dmy])$/.exec(variant);
  if (!m) throw new TemplateSyntaxError(`Unsupported date variant: ${variant}`);
  const sign = m[1] === '-' ? -1 : 1;
  const n = Number(m[2]) * sign;
  if (m[3] === 'd') return addCalendarDays(value, n);
  const [y, mo, d] = value.split('-').map(Number);
  const months = m[3] === 'm' ? n : n * 12;
  const total = y * 12 + (mo - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

function shuffleDigits(value: string, rng: () => number): string {
  const digits = value.split('');
  let out = shuffleWith(digits, rng).join('');
  // Guarantee the distractor differs from the real value.
  if (out === value && digits.length > 1) out = out.slice(1) + out[0];
  return out;
}

function formatValue(field: TemplateField, value: unknown, locale: Locale): string {
  switch (field) {
    case 'registered_capital':
      return Number(value).toLocaleString(NUMBER_LOCALES[locale]);
    case 'registered_on':
    case 'issued_on':
      return formatDate(String(value), locale);
    case 'directors':
      return (value as Director[]).map((d) => d.name_th).join(', ');
    default:
      return String(value);
  }
}

/**
 * Substitutes `{field}` and `{field|variant}` placeholders. Variants derive deterministic
 * distractors from the real value: `x2`/`x0.5`/`x10` (numbers), `+1m`/`-1y`/`+10d` (dates),
 * `shuffle` (digit strings). Missing record values raise MissingFieldError (BR-008).
 */
export function renderTemplate(
  text: string,
  record: TemplateRecord,
  seed: string,
  locale: Locale,
): string {
  const rng = createRng(`${seed}:${text}`);
  return text.replace(PLACEHOLDER, (_match, rawField: string, variant?: string) => {
    const field = rawField as TemplateField;
    if (!(TEMPLATE_FIELDS as readonly string[]).includes(field)) {
      throw new TemplateSyntaxError(`Unknown placeholder field: ${rawField}`);
    }
    const value = record[field];
    if (isEmpty(value)) throw new MissingFieldError(field);
    if (!variant) return formatValue(field, value, locale);

    if (field === 'registered_capital' || field === 'objectives_count') {
      return formatValue(field, applyNumberVariant(Number(value), variant), locale);
    }
    if (field === 'registered_on' || field === 'issued_on') {
      return formatValue(field, applyDateVariant(String(value), variant), locale);
    }
    if (variant === 'shuffle') return shuffleDigits(String(value), rng);
    throw new TemplateSyntaxError(`Variant ${variant} is not valid for ${field}`);
  });
}
