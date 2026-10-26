import { describe, expect, it } from 'vitest';
import { submanagerLoginId } from '@/lib/domain/login-id';

describe('Submanager login IDs', () => {
  it.each([
    ['A7', 'tf38sa7'],
    ['9z', 'tf38s9z'],
    ['00', 'tf38s00'],
    ['AA', 'tf38saa'],
  ])('accepts any two ASCII letters or digits: %s', (suffix, expected) => {
    expect(submanagerLoginId('TF38', suffix)).toBe(expected);
  });
  it('preserves the full legacy Manager ID', () => {
    expect(submanagerLoginId('t-f38', 'A7')).toBe('t-f38sa7');
  });
  it.each(['', 'a', 'abc', 'a-', 'ก1', 'a 1', ' a7 '])('rejects suffix %s', (suffix) => {
    expect(() => submanagerLoginId('tf38', suffix)).toThrow();
  });
});
