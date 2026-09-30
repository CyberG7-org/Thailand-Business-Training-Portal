import { describe, expect, it } from 'vitest';
import {
  MANAGER_PREFIX,
  displayLoginId,
  isValidLoginSuffix,
  learnerLoginId,
  learnerPrefix,
  managerLoginId,
  suggestionCandidates,
} from '@/lib/domain/login-id';

/** D69: staff type the part after the prefix; 2–6 letters or digits, any case. */
describe('isValidLoginSuffix', () => {
  it('takes 2–6 letters or digits in either case', () => {
    for (const ok of ['g4', 'G4', 'L8', 'AB12', 'SALES1', '01', 'zz']) {
      expect(isValidLoginSuffix(ok), ok).toBe(true);
    }
  });

  it('refuses anything shorter, longer, or with other characters', () => {
    for (const bad of ['', 'g', 'abcdefg', 'g-4', 'g 4', 'g.4', 'ก4', 'g4!']) {
      expect(isValidLoginSuffix(bad), bad).toBe(false);
    }
  });
});

describe('composing a code', () => {
  it('prefixes a manager with T- and stores it lower-case', () => {
    expect(MANAGER_PREFIX).toBe('t-');
    expect(managerLoginId('G4')).toBe('t-g4');
    expect(managerLoginId(' g4 ')).toBe('t-g4');
  });

  it("puts a learner under their manager's whole code", () => {
    expect(learnerPrefix('t-g4')).toBe('t-g4-');
    expect(learnerLoginId('t-g4', 'L8')).toBe('t-g4-l8');
    expect(learnerLoginId('T-G4', ' l8 ')).toBe('t-g4-l8');
    // A team renamed from the old numbering keeps working the same way.
    expect(learnerLoginId('t-01', '02')).toBe('t-01-02');
  });
});

describe('suggestionCandidates', () => {
  /** A fixed sequence, so a failing case can be replayed. */
  function seeded(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 1103515245 + 12345) % 2 ** 31;
      return s / 2 ** 31;
    };
  }

  it('offers one letter then one digit, like G4, all distinct and valid', () => {
    const codes = suggestionCandidates(20, 2, seeded(7));
    expect(codes).toHaveLength(20);
    expect(new Set(codes).size).toBe(20);
    for (const code of codes) {
      expect(code).toMatch(/^[a-z][0-9]$/);
      expect(isValidLoginSuffix(code)).toBe(true);
    }
  });

  it('never suggests i or o, which read as 1 and 0 when a code is handed over', () => {
    const codes = suggestionCandidates(200, 3, seeded(11));
    for (const code of codes) expect(code).not.toMatch(/[io]/);
  });

  it('grows the length when asked, keeping a letter first', () => {
    for (const code of suggestionCandidates(30, 3, seeded(3))) {
      expect(code).toMatch(/^[a-z][a-z0-9]{2}$/);
    }
  });

  it('stops at the size of the space rather than looping for ever', () => {
    // 24 letters × 10 digits is every two-character suggestion there is.
    expect(suggestionCandidates(500, 2, seeded(5)).length).toBeLessThanOrEqual(240);
  });
});

describe('displayLoginId', () => {
  it('shows a stored code upper-case', () => {
    expect(displayLoginId('t-g4')).toBe('T-G4');
    expect(displayLoginId('t-g4-l8')).toBe('T-G4-L8');
    expect(displayLoginId('t-01-100')).toBe('T-01-100');
  });

  it('leaves the admin account readable and survives nothing', () => {
    expect(displayLoginId('owner')).toBe('OWNER');
    expect(displayLoginId(null)).toBe('—');
    expect(displayLoginId('')).toBe('—');
  });
});
