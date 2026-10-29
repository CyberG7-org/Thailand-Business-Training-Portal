import { defineRouting } from 'next-intl/routing';

export const LOCALES = ['th', 'en', 'zh', 'ta', 'ms'] as const;
export type AppLocale = (typeof LOCALES)[number];
export const QUESTION_LOCALES = LOCALES;
export type QuestionLocale = (typeof QUESTION_LOCALES)[number];
export type ExistingContentLocale = 'th' | 'en' | 'zh';
export const CONTENT_LOCALES = [
  'th',
  'en',
  'zh',
] as const satisfies readonly ExistingContentLocale[];

/** Quiz/question content stays in its approved languages until it is translated separately. */
export function contentLocale(locale: AppLocale): ExistingContentLocale {
  return locale === 'th' || locale === 'zh' ? locale : 'en';
}

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: 'th',
});

/** `zh` is Simplified Chinese (decision D8). */
export function htmlLang(locale: AppLocale): string {
  return locale === 'zh' ? 'zh-Hans' : locale;
}
