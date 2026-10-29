import type { AppLocale } from './routing';
import { formatDate, type ISODate } from '@/lib/domain/thai-date';

/** UI-only date formatting; stored assessment templates remain in their approved languages. */
export function formatDisplayDate(date: ISODate, locale: AppLocale): string {
  if (locale !== 'ms' && locale !== 'ta') return formatDate(date, locale);
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(locale === 'ms' ? 'ms-MY' : 'ta-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
