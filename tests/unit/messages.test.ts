import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import th from '@/messages/th.json';
import zh from '@/messages/zh.json';

type Catalog = Record<string, unknown>;

function entries(obj: Catalog, prefix = ''): Array<[string, unknown]> {
  return Object.entries(obj).flatMap(([key, value]) =>
    value !== null && typeof value === 'object'
      ? entries(value as Catalog, `${prefix}${key}.`)
      : [[`${prefix}${key}`, value] as [string, unknown]],
  );
}

const keysOf = (c: Catalog) =>
  entries(c)
    .map(([k]) => k)
    .sort();

describe('message catalogs', () => {
  it('en has exactly the same keys as th', () => {
    expect(keysOf(en)).toEqual(keysOf(th));
  });
  it('zh has exactly the same keys as th', () => {
    expect(keysOf(zh)).toEqual(keysOf(th));
  });
  it('has no empty strings in any catalog', () => {
    for (const [name, catalog] of Object.entries({ th, en, zh })) {
      for (const [key, value] of entries(catalog)) {
        expect(typeof value === 'string' && value.trim().length > 0, `${name}:${key}`).toBe(true);
      }
    }
  });
});
