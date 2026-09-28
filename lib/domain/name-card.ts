import { formatThaiMobile } from './phone';

/** One two-sided design for every company (D24, D63). Bumped whenever the layout changes. */
export const NAME_CARD_TEMPLATE_VERSION = 'two-sided-v2';

/**
 * The words every card carries, whatever the company (owner, 2026-09-28): a tagline on both
 * sides and a slogan on the front. Edit here; the template version need not change for copy.
 */
export const NAME_CARD_COPY = {
  tagline: 'TRUST · TRADE · TOGETHER',
  sloganTh: 'เชื่อมโอกาส สร้างอนาคตไปด้วยกัน',
  sloganEn: 'YOUR PARTNER FOR A BRIGHTER TOMORROW',
} as const;

/** DBD fields the template cannot render without (never fabricated — BR-008). */
export const NAME_CARD_REQUIRED_FIELDS = ['company_name_th', 'head_office_address'] as const;

export type NameCardSource = {
  company_name_th: string | null;
  company_name_en: string | null;
  head_office_address: string | null;
  juristic_id: string | null;
  /** The company's contact and business answers, as the manager filled them (D58). */
  contact_email: string | null;
  nature_of_business: string | null;
  products_services: string | null;
};

/** What the learner types beside the phone number. */
export type NameCardHolder = { nameTh: string; nameEn: string | null };

export type NameCardData = {
  companyNameTh: string;
  companyNameEn: string | null;
  /** The monogram on the front. */
  companyInitials: string;
  holderName: string;
  holderNameEn: string | null;
  address: string;
  phoneDisplay: string;
  email: string | null;
  juristicId: string | null;
  natureOfBusiness: string | null;
  productsServices: string | null;
  templateVersion: string;
};

export function missingNameCardFields(source: NameCardSource): string[] {
  return NAME_CARD_REQUIRED_FIELDS.filter((f) => !source[f]);
}

const LEGAL_WORDS = new Set([
  'CO',
  'CO.',
  'LTD',
  'LTD.',
  'LIMITED',
  'COMPANY',
  'PUBLIC',
  'PCL',
  'PCL.',
  'PLC',
  'PLC.',
  'INC',
  'INC.',
  'CORP',
  'CORP.',
  'CORPORATION',
  'PARTNERSHIP',
  'THE',
  '&',
  'AND',
]);
const THAI_LEGAL_PREFIX =
  /^\s*(บริษัท|ห้างหุ้นส่วนจำกัด|ห้างหุ้นส่วนสามัญ|ห้างหุ้นส่วน|หจก\.?|บจก\.?|บมจ\.?)\s*/u;

/** The first letter with any mark that sits on it, so a Thai vowel is never shown alone. */
function firstGrapheme(text: string): string {
  let out = '';
  for (const ch of text) {
    if (out && !/\p{M}/u.test(ch)) break;
    out += ch;
  }
  return out;
}

/**
 * The monogram: the initials of the English name without its legal words ("THARA VANICH CO.,
 * LTD." → "TV"), else the first letter of the Thai name after its legal prefix.
 */
export function companyInitials(nameEn: string | null, nameTh: string | null): string {
  const words = (nameEn ?? '')
    .toUpperCase()
    .split(/[\s,]+/)
    .map((w) => w.replace(/[^A-Z0-9.&]/g, ''))
    .filter((w) => w && !LEGAL_WORDS.has(w));
  const latin = words
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
  if (latin) return latin;
  return firstGrapheme((nameTh ?? '').replace(THAI_LEGAL_PREFIX, '').trim());
}

/** Builds the render model; throws when required DBD data or the holder's name is missing. */
export function buildNameCardData(
  source: NameCardSource,
  phoneNormalized: string,
  holder: NameCardHolder,
): NameCardData {
  const missing = missingNameCardFields(source);
  if (missing.length > 0) throw new Error(`Missing DBD fields: ${missing.join(', ')}`);
  const nameTh = holder.nameTh.trim();
  if (!nameTh) throw new Error('Missing holder name');
  return {
    companyNameTh: source.company_name_th!,
    companyNameEn: source.company_name_en?.trim() || null,
    companyInitials: companyInitials(source.company_name_en, source.company_name_th),
    holderName: nameTh,
    holderNameEn: holder.nameEn?.trim() || null,
    address: source.head_office_address!,
    phoneDisplay: formatThaiMobile(phoneNormalized),
    email: source.contact_email?.trim() || null,
    juristicId: source.juristic_id,
    natureOfBusiness: source.nature_of_business?.trim() || null,
    productsServices: source.products_services?.trim() || null,
    templateVersion: NAME_CARD_TEMPLATE_VERSION,
  };
}

const isThai = (s: string) => /[฀-๿]/.test(s);

/**
 * Splits text into the pieces a line may break between: Thai words (Intl.Segmenter knows
 * the Thai dictionary), and Latin words or numbers such as "99/9" kept whole, each with the
 * space after it. Thai has no spaces between words and the PDF layout engine hyphenates any
 * break it makes inside a word, so the card lays each piece out as its own box in a row that
 * wraps (spike S3). Without a segmenter the text is one piece.
 */
export function thaiWords(text: string): string[] {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) return [];
  if (typeof Intl === 'undefined' || !('Segmenter' in Intl)) return [clean];
  const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
  const out: string[] = [];
  for (const { segment } of segmenter.segment(clean)) {
    const prev = out[out.length - 1];
    if (segment === ' ' && prev !== undefined) {
      out[out.length - 1] = prev + ' '; // the space rides on the word before it
    } else if (prev === undefined || prev.endsWith(' ') || isThai(segment) || isThai(prev)) {
      out.push(segment);
    } else {
      out[out.length - 1] = prev + segment; // "99" + "/" + "9" stays one piece
    }
  }
  return out;
}
