import type { Director } from './dbd-record';
import { formatThaiMobile } from './phone';

/** Fixed Thai template (decision D24). Bumped whenever the layout changes. */
export const NAME_CARD_TEMPLATE_VERSION = 'placeholder-v1';

/** DBD fields the template cannot render without (never fabricated — BR-008). */
export const NAME_CARD_REQUIRED_FIELDS = ['company_name_th', 'head_office_address'] as const;

export type NameCardSource = {
  company_name_th: string | null;
  company_name_en: string | null;
  head_office_address: string | null;
  juristic_id: string | null;
  directors: Director[] | null;
  /** Learner's display name; falls back to the first director's Thai name. */
  holder_name: string | null;
};

export type NameCardData = {
  companyNameTh: string;
  companyNameEn: string | null;
  holderName: string;
  holderTitle: string;
  address: string;
  phoneDisplay: string;
  juristicId: string | null;
  templateVersion: string;
};

export function missingNameCardFields(source: NameCardSource): string[] {
  return NAME_CARD_REQUIRED_FIELDS.filter((f) => !source[f]);
}

/** Builds the render model; throws when required DBD data is missing. */
export function buildNameCardData(source: NameCardSource, phoneNormalized: string): NameCardData {
  const missing = missingNameCardFields(source);
  if (missing.length > 0) throw new Error(`Missing DBD fields: ${missing.join(', ')}`);
  const holder = source.holder_name?.trim() || source.directors?.[0]?.name_th?.trim() || '';
  if (!holder) throw new Error('Missing DBD fields: holder name');
  return {
    companyNameTh: source.company_name_th!,
    companyNameEn: source.company_name_en,
    holderName: holder,
    holderTitle: 'กรรมการผู้มีอำนาจลงนาม',
    address: source.head_office_address!,
    phoneDisplay: formatThaiMobile(phoneNormalized),
    juristicId: source.juristic_id,
    templateVersion: NAME_CARD_TEMPLATE_VERSION,
  };
}

/**
 * Inserts zero-width spaces at Thai word boundaries so the PDF layout engine can wrap
 * space-less Thai text (spike S3). Latin text is unaffected.
 */
export function withThaiBreaks(text: string): string {
  if (typeof Intl === 'undefined' || !('Segmenter' in Intl)) return text;
  const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
  let out = '';
  for (const { segment } of segmenter.segment(text)) out += segment + '​';
  return out;
}
