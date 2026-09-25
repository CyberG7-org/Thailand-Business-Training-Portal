import { describe, expect, it } from 'vitest';
import { initialsOf } from '@/lib/domain/initials';

/** The avatar in the shell header shows the first two graphemes of the name, never a bare mark. */
describe('initialsOf', () => {
  it('takes the first two characters of a Latin name', () => {
    expect(initialsOf('User1')).toBe('Us');
  });

  it('keeps a Thai vowel or tone mark with its consonant', () => {
    // ค + ุ + ณ: the second grapheme is ณ, not the vowel mark on its own.
    expect(initialsOf('คุณสมชาย')).toBe('คุณ');
  });

  it('falls back to the login id when there is no display name', () => {
    expect(initialsOf(null, 't01-03')).toBe('T0');
  });
});
