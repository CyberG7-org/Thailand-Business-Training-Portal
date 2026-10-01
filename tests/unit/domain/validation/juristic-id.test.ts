import { describe, expect, it } from 'vitest';
import {
  isValidJuristicId,
  juristicIdCheckDigit,
  withCheckDigit,
} from '@/lib/domain/validation/juristic-id';

describe('Thai registration numbers (spec §5.5)', () => {
  it('computes the mod-11 check digit', () => {
    expect(juristicIdCheckDigit('010556823370')).toBe(4);
    expect(juristicIdCheckDigit('045556900080')).toBe(8);
    expect(withCheckDigit('010556900012')).toBe('0105569000126');
  });

  it('accepts a correct digit and refuses everything else', () => {
    expect(isValidJuristicId('0105568233704')).toBe(true);
    expect(isValidJuristicId('0105568233705')).toBe(false);
    expect(isValidJuristicId('010556823370')).toBe(false);
    expect(isValidJuristicId('0105568233704 ')).toBe(false);
    expect(isValidJuristicId(null)).toBe(false);
  });

  it('refuses to extend anything but twelve digits', () => {
    expect(() => withCheckDigit('123')).toThrow();
  });
});
