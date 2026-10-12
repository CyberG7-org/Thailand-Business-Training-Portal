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
  it('prefixes a manager with T and stores it lower-case', () => {
    expect(MANAGER_PREFIX).toBe('t');
    expect(managerLoginId('A12')).toBe('ta12');
    expect(managerLoginId(' a12 ')).toBe('ta12');
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

/** D85: a manager's typed part is exactly one letter and two digits. */
describe('isValidSuffixFor a manager', () => {
  it('takes one letter then two digits, in either case', () => {
    for (const ok of ['A12', 'a12', 'Z99', 'g04', 'I00']) {
      expect(isValidSuffixFor('manager', ok), ok).toBe(true);
    }
  });

  it("refuses any other shape, D69's 2–6 letters or digits included", () => {
    for (const bad of [
      '',
      'G4',
      '01',
      'AB12',
      'SALES1',
      'A1',
      'A123',
      '123',
      'AB1',
      'A-1',
      'ก12',
    ]) {
      expect(isValidSuffixFor('manager', bad), bad).toBe(false);
    }
  });
});

/** D84: a learner's typed part is exactly two letters and two digits. */
describe('isValidSuffixFor a learner', () => {
  it('takes two letters then two digits, in either case', () => {
    for (const ok of ['DA42', 'da42', 'Da42', 'AA01', 'zz99', 'IO00']) {
      expect(isValidSuffixFor('learner', ok), ok).toBe(true);
    }
  });

  it('refuses any other shape', () => {
    for (const bad of [
      '',
      'D42',
      'L8',
      'DA4',
      'DA420',
      'ABC1',
      'A123',
      '1A23',
      'DA-4',
      'กข42',
      'DAB42',
    ]) {
      expect(isValidSuffixFor('learner', bad), bad).toBe(false);
    }
  });
});

describe('suffixLength', () => {
  it('is 3 for a manager and 4 for a learner, the field lengths', () => {
    expect(suffixLength('manager')).toBe(3);
    expect(suffixLength('learner')).toBe(4);
  });
});

describe('suggestionCandidates', () => {
  it('offers a manager one letter and two digits, never I or O, all distinct and valid', () => {
    const codes = suggestionCandidates('manager', 200, seeded(7));
    expect(codes).toHaveLength(200);
    expect(new Set(codes).size).toBe(200);
    for (const code of codes) {
      expect(code).toMatch(/^[a-hj-np-z][0-9]{2}$/);
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
    // 24 letters × 100 for managers; 24 × 24 letters × 100 for learners.
    expect(suggestionCandidates('manager', 5_000, seeded(5)).length).toBeLessThanOrEqual(2_400);
    expect(suggestionCandidates('learner', 60_000, seeded(2)).length).toBeLessThanOrEqual(57_600);
  });
});

describe('allSuffixes', () => {
  it('lists all 2,400 manager codes the suggestion can offer, in order, never I or O', () => {
    const codes = allSuffixes('manager');
    expect(codes).toHaveLength(2_400);
    expect(new Set(codes).size).toBe(2_400);
    expect(codes.slice(0, 3)).toEqual(['a00', 'a01', 'a02']);
    expect(codes[100]).toBe('b00');
    expect(codes.at(-1)).toBe('z99');
    for (const code of codes) {
      expect(code).toMatch(/^[a-hj-np-z][0-9]{2}$/);
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
