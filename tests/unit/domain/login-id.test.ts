import { describe, expect, it } from 'vitest';
import {
  MANAGER_PREFIX,
  allSuffixes,
  displayLoginId,
  isValidSuffixFor,
  learnerLoginId,
  learnerPrefix,
  managerLoginId,
  suffixLength,
  suggestionCandidates,
} from '@/lib/domain/login-id';

/** mulberry32: a fixed sequence in 32-bit integer steps, so a failing case can be replayed. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

describe('composing a code', () => {
  it('stores a new two-character manager code without a T prefix', () => {
    expect(MANAGER_PREFIX).toBe('');
    expect(managerLoginId('A1')).toBe('a1');
    expect(managerLoginId(' a1 ')).toBe('a1');
  });

  it("puts a learner under their manager's whole code", () => {
    expect(learnerPrefix('t-a12')).toBe('ta12');
    expect(learnerLoginId('t-a12', 'DA42')).toBe('ta12da42');
    expect(learnerLoginId('T-A12', ' da42 ')).toBe('ta12da42');
    // A team from before D85 keeps working the same way until it is renamed.
    expect(learnerLoginId('t-01', 'da42')).toBe('t01da42');
  });
});

describe('displayLoginId', () => {
  it('shows a stored code upper-case', () => {
    expect(displayLoginId('t-a12')).toBe('T-A12');
    expect(displayLoginId('t-a12-da42')).toBe('T-A12-DA42');
  });

  it('leaves the admin account readable and survives nothing', () => {
    expect(displayLoginId('owner')).toBe('OWNER');
    expect(displayLoginId(null)).toBe('—');
    expect(displayLoginId('')).toBe('—');
  });
});

/** Newly typed manager codes allow any two ASCII letters or digits. */
describe('isValidSuffixFor a manager', () => {
  it('accepts any order of two letters or digits, in either case', () => {
    for (const ok of ['A1', 'a1', 'AB', '12', '1A', 'I0']) {
      expect(isValidSuffixFor('manager', ok), ok).toBe(true);
    }
  });

  it('refuses the wrong length or non-alphanumeric characters', () => {
    for (const bad of ['', 'A', 'A12', 'AB12', 'SALES1', 'A-1', 'A 1', 'ก1']) {
      expect(isValidSuffixFor('manager', bad), bad).toBe(false);
    }
  });
});

/** Newly typed learner suffixes allow any four ASCII letters or digits. */
describe('isValidSuffixFor a learner', () => {
  it('accepts any order of four letters or digits, in either case', () => {
    for (const ok of ['DA42', 'da42', 'ABCD', '1234', 'A1B2', '1A23', 'IO00']) {
      expect(isValidSuffixFor('learner', ok), ok).toBe(true);
    }
  });

  it('refuses any other shape', () => {
    for (const bad of ['', 'D42', 'L8', 'DA4', 'DA420', 'DA-4', 'กข42', 'DAB42']) {
      expect(isValidSuffixFor('learner', bad), bad).toBe(false);
    }
  });
});

describe('suffixLength', () => {
  it('is 2 for a manager and 4 for a learner, the field lengths', () => {
    expect(suffixLength('manager')).toBe(2);
    expect(suffixLength('learner')).toBe(4);
  });
});

describe('suggestionCandidates', () => {
  it('offers a manager one letter and one digit, never I or O, all distinct and valid', () => {
    const codes = suggestionCandidates('manager', 200, seeded(7));
    expect(codes).toHaveLength(200);
    expect(new Set(codes).size).toBe(200);
    for (const code of codes) {
      expect(code).toMatch(/^[a-hj-np-z][0-9]$/);
      expect(isValidSuffixFor('manager', code)).toBe(true);
    }
  });

  it('offers a learner two letters and two digits, never I or O, all distinct and valid', () => {
    const codes = suggestionCandidates('learner', 200, seeded(9));
    expect(codes).toHaveLength(200);
    expect(new Set(codes).size).toBe(200);
    for (const code of codes) {
      expect(code).toMatch(/^[a-hj-np-z]{2}[0-9]{2}$/);
      expect(isValidSuffixFor('learner', code)).toBe(true);
    }
  });

  it('stops at the size of the space rather than looping for ever', () => {
    // 24 letters × 10 for suggested managers; manually typed codes may use any two characters.
    expect(suggestionCandidates('manager', 5_000, seeded(5)).length).toBeLessThanOrEqual(240);
    expect(suggestionCandidates('learner', 60_000, seeded(2)).length).toBeLessThanOrEqual(57_600);
  });
});

describe('allSuffixes', () => {
  it('lists all 240 manager codes the suggestion can offer, in order, never I or O', () => {
    const codes = allSuffixes('manager');
    expect(codes).toHaveLength(240);
    expect(new Set(codes).size).toBe(240);
    expect(codes.slice(0, 3)).toEqual(['a0', 'a1', 'a2']);
    expect(codes[10]).toBe('b0');
    expect(codes.at(-1)).toBe('z9');
    for (const code of codes) {
      expect(code).toMatch(/^[a-hj-np-z][0-9]$/);
      expect(isValidSuffixFor('manager', code)).toBe(true);
    }
  });

  it('lists all 57,600 learner codes the suggestion can offer, in order, never I or O', () => {
    const codes = allSuffixes('learner');
    expect(codes).toHaveLength(57_600);
    expect(new Set(codes).size).toBe(57_600);
    expect(codes.slice(0, 3)).toEqual(['aa00', 'aa01', 'aa02']);
    expect(codes[100]).toBe('ab00');
    expect(codes.at(-1)).toBe('zz99');
    for (const code of codes) {
      expect(code).toMatch(/^[a-hj-np-z]{2}[0-9]{2}$/);
      expect(isValidSuffixFor('learner', code)).toBe(true);
    }
  });
});
