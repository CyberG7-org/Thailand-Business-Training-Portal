import { describe, expect, it } from 'vitest';
import { contentLocale, htmlLang, LOCALES } from '@/i18n/routing';
import { formatDisplayDate } from '@/i18n/format-date';

describe('site languages and approved question content', () => {
  it('offers five site languages while keeping unapproved quiz content in English', () => {
    expect(LOCALES).toEqual(['th', 'en', 'zh', 'ta', 'ms']);
    expect(contentLocale('th')).toBe('th');
    expect(contentLocale('zh')).toBe('zh');
    expect(contentLocale('ms')).toBe('en');
    expect(contentLocale('ta')).toBe('en');
    expect(htmlLang('zh')).toBe('zh-Hans');
    expect(htmlLang('ta')).toBe('ta');
  });

  it('formats display-only dates in Malay and Tamil', () => {
    expect(formatDisplayDate('2026-04-10', 'ms')).toContain('April');
    expect(formatDisplayDate('2026-04-10', 'ta')).toContain('2026');
  });
});
