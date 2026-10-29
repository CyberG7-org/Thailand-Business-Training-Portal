import { readFileSync } from 'node:fs';
import { parse } from '@formatjs/icu-messageformat-parser';
import { describe, expect, it } from 'vitest';

interface Messages {
  [key: string]: string | Messages;
}

function flatten(messages: Messages, prefix = ''): Record<string, string> {
  return Object.fromEntries(
    Object.entries(messages).flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof value === 'string' ? [[path, value]] : Object.entries(flatten(value, path));
    }),
  );
}

function variables(message: string): string[] {
  return [...message.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)(?:,|\})/g)]
    .map((match) => match[1])
    .sort();
}

const read = (locale: string) =>
  flatten(JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8')) as Messages);

describe('website language catalogs', () => {
  const english = read('en');
  for (const locale of ['th', 'zh', 'ta', 'ms']) {
    it(`keeps every English key and interpolation variable in ${locale}`, () => {
      const translated = read(locale);
      expect(Object.keys(translated).sort()).toEqual(Object.keys(english).sort());
      for (const [key, source] of Object.entries(english)) {
        expect(translated[key], key).toBeTruthy();
        expect(variables(translated[key]), key).toEqual(variables(source));
        expect(() => parse(translated[key]), key).not.toThrow();
      }
    });
  }
});
