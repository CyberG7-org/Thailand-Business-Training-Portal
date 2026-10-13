import { describe, expect, it } from 'vitest';
import { isLanguageOptionAvailable } from '@/i18n/language-choice';

describe('language options', () => {
  it('offers Thai, English, and Simplified Chinese but not Malay', () => {
    expect(isLanguageOptionAvailable('th')).toBe(true);
    expect(isLanguageOptionAvailable('en')).toBe(true);
    expect(isLanguageOptionAvailable('zh')).toBe(true);
    expect(isLanguageOptionAvailable('ms')).toBe(false);
  });
});
