import { describe, expect, it } from 'vitest';
import {
  MANAGER_PREFIX,
  allLearnerSuffixes,
  displayLoginId,
  isValidLoginSuffix,
  isValidSuffixFor,
  learnerSuggestionCandidates,
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

/** D83: a learner's typed part is exactly one letter and two digits; managers keep 2–6. */
describe('isValidSuffixFor', () => {
  it('takes one letter then two digits for a learner, in either case', () => {
    for (const ok of ['D42', 'd42', 'A01', 'z99']) {
      expect(isValidSuffixFor('learner', ok), ok).toBe(true);
    }
  });

  it('refuses any other shape for a learner', () => {
    for (const bad of ['', 'D4', 'L8', 'D420', 'AB1', '142', 'DD4', 'D-4', 'ก42', 'AB12']) {
      expect(isValidSuffixFor('learner', bad), bad).toBe(false);
    }
  });

  it('leaves the manager rule as it was', () => {
    for (const ok of ['G4', 'AB12', 'SALES1', '01']) {
      expect(isValidSuffixFor('manager', ok), ok).toBe(true);
    }
    expect(isValidSuffixFor('manager', 'g')).toBe(false);
  });
});

describe('learnerSuggestionCandidates', () => {
  function seeded(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 1103515245 + 12345) % 2 ** 31;
      return s / 2 ** 31;
    };
  }

  it('offers one letter and two digits, never I or O, all distinct and valid', () => {
    const codes = learnerSuggestionCandidates(200, seeded(9));
    expect(codes).toHaveLength(200);
    expect(new Set(codes).size).toBe(200);
    for (const code of codes) {
      expect(code).toMatch(/^[a-hj-np-z][0-9]{2}$/);
      expect(isValidSuffixFor('learner', code)).toBe(true);
    }
  });

  it('stops at the size of the space: 24 letters × 100', () => {
    expect(learnerSuggestionCandidates(5000, seeded(2)).length).toBeLessThanOrEqual(2400);
  });
});

describe('allLearnerSuffixes', () => {
  it('lists all 2,400 codes the suggestion can offer, in order, each valid and never I or O', () => {
    const codes = allLearnerSuffixes();
    expect(codes).toHaveLength(2400);
    expect(new Set(codes).size).toBe(2400);
    expect(codes.slice(0, 3)).toEqual(['a00', 'a01', 'a02']);
    expect(codes.at(-1)).toBe('z99');
    for (const code of codes) {
      expect(code).toMatch(/^[a-hj-np-z][0-9]{2}$/);
      expect(isValidSuffixFor('learner', code)).toBe(true);
    }
  });
});
