import type { Locale } from '@/lib/domain/thai-date';
import type { GeoName } from './context';
import type { TokenKind } from './tokens';

const NUMBER_LOCALES: Record<Locale, string> = { th: 'th-TH', en: 'en-US', zh: 'zh-CN' };
const CURRENCY: Record<Locale, string> = { th: 'บาท', en: 'THB', zh: '泰铢' };

export function formatNumber(n: number, locale: Locale): string {
  return n.toLocaleString(NUMBER_LOCALES[locale], { maximumFractionDigits: 2 });
}

/** Money with its currency word, a percent with its sign, anything else a plain number. */
export function formatQuantity(kind: TokenKind, n: number, locale: Locale): string {
  if (kind === 'money') return `${formatNumber(n, locale)} ${CURRENCY[locale]}`;
  if (kind === 'percent') return `${formatNumber(n, locale)}%`;
  return formatNumber(n, locale);
}

/** Thai and English show their own name; Chinese has none, so it shows both (plan decision 9). */
export function geoLabel(place: GeoName, locale: Locale): string {
  if (locale === 'th') return place.th;
  if (locale === 'en') return place.en;
  return `${place.th} (${place.en})`;
}

/**
 * What two options are compared on: case, spacing and punctuation do not make them differ. A
 * point or comma between two digits is part of the number and stays.
 */
export function normalizeOption(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[;:!?'"“”‘’()[\]–—-]/g, '')
    .replace(/(?<!\d)[.,]|[.,](?!\d)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
