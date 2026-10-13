import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

function mergeMessages(
  base: Record<string, unknown>,
  translated: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };
  for (const [key, value] of Object.entries(translated)) {
    const previous = result[key];
    result[key] =
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      previous &&
      typeof previous === 'object' &&
      !Array.isArray(previous)
        ? mergeMessages(previous as Record<string, unknown>, value as Record<string, unknown>)
        : value;
  }
  return result;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages:
      locale === 'ms'
        ? mergeMessages(
            (await import('../messages/en.json')).default,
            (await import('../messages/ms.json')).default,
          )
        : (await import(`../messages/${locale}.json`)).default,
  };
});
