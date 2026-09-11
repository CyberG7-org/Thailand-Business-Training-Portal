import { describe, expect, it } from 'vitest';
import { isValidLoginId, loginIdToEmail } from '@/lib/auth/internal-email';

describe('isValidLoginId', () => {
  it('accepts 3–64 chars of letters, digits, dot, underscore, dash', () => {
    expect(isValidLoginId('siam001')).toBe(true);
    expect(isValidLoginId('learner.a_b-c')).toBe(true);
  });
  it('rejects too short, spaces, @ and leading punctuation', () => {
    expect(isValidLoginId('ab')).toBe(false);
    expect(isValidLoginId('has space')).toBe(false);
    expect(isValidLoginId('a@b')).toBe(false);
    expect(isValidLoginId('.abc')).toBe(false);
  });
});

describe('loginIdToEmail', () => {
  it('lower-cases the id and appends the internal domain', () => {
    expect(loginIdToEmail('Siam001', 'learner.portal.internal')).toBe(
      'siam001@learner.portal.internal',
    );
  });
});
