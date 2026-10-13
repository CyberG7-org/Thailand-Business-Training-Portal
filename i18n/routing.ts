import { defineRouting } from 'next-intl/routing';

export const LOCALES = ['th', 'en', 'zh', 'ms'] as const;
export type AppLocale = (typeof LOCALES)[number];

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: 'th',
});

/** `zh` is Simplified Chinese (decision D8). */
export function htmlLang(locale: AppLocale): string {
  return locale === 'zh' ? 'zh-Hans' : locale;
}
