import { describe, expect, it } from 'vitest';
import {
  isValidPassword,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from '@/lib/domain/password-policy';

describe('password policy for every role', () => {
  it('accepts any characters at lengths 6 through 8', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(6);
    expect(MAX_PASSWORD_LENGTH).toBe(8);
    expect(isValidPassword('abcdef')).toBe(true);
    expect(isValidPassword('a b!12')).toBe(true);
    expect(isValidPassword('12345678')).toBe(true);
    expect(isValidPassword('abcde')).toBe(false);
    expect(isValidPassword('123456789')).toBe(false);
  });
});
