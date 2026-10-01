/**
 * Account codes (D69). Staff type the part after a fixed prefix: the owner gives a manager
 * `T-` + a suffix (T-G4), a manager gives a learner their own code + `-` + a suffix (T-G4-DA42:
 * a learner's suffix is two letters and two digits, D84).
 * Codes are case-insensitive — stored lower-case, as every login id in this project is, and
 * shown upper-case — so `t-g4` can never reach a screen.
 */
export const MANAGER_PREFIX = 't-';

/** Whose code is being chosen: a manager's (the owner) or a learner's (staff). */
export type LoginIdKind = 'manager' | 'learner';

/** A manager's typed part: 2–6 letters or digits. No hyphen, so it can never reach another team. */
export const LOGIN_SUFFIX_PATTERN = /^[a-z0-9]{2,6}$/i;

/** A learner's typed part (D84): exactly two letters then two digits, e.g. DA42. */
export const LEARNER_SUFFIX_PATTERN = /^[a-z]{2}[0-9]{2}$/i;

export function isValidLoginSuffix(suffix: string): boolean {
  return LOGIN_SUFFIX_PATTERN.test(suffix);
}

export function isValidSuffixFor(kind: LoginIdKind, suffix: string): boolean {
  return (kind === 'learner' ? LEARNER_SUFFIX_PATTERN : LOGIN_SUFFIX_PATTERN).test(suffix);
}

export function managerLoginId(suffix: string): string {
  return MANAGER_PREFIX + suffix.trim().toLowerCase();
}

/** Every learner code starts with their manager's whole code, whatever shape that code has. */
export function learnerPrefix(managerLoginId: string): string {
  return `${managerLoginId.trim().toLowerCase()}-`;
}

export function learnerLoginId(managerLoginId: string, suffix: string): string {
  return learnerPrefix(managerLoginId) + suffix.trim().toLowerCase();
}

export function displayLoginId(loginId: string | null | undefined): string {
  const trimmed = loginId?.trim();
  return trimmed ? trimmed.toUpperCase() : '—';
}

// No i or o: handed over on paper or by phone they read as 1 and 0.
const LETTERS = 'abcdefghjklmnpqrstuvwxyz';
const DIGITS = '0123456789';

/**
 * Suffixes to offer, all distinct. Two characters are one letter then one digit (G4, L8); longer
 * ones keep the letter first and mix after it. Fewer come back than asked for only when the space
 * of that length is smaller than `count`.
 */
export function suggestionCandidates(
  count: number,
  length = 2,
  random: () => number = Math.random,
): string[] {
  const pick = (chars: string) => chars[Math.floor(random() * chars.length)];
  const rest = length === 2 ? DIGITS : LETTERS + DIGITS;
  const space = LETTERS.length * rest.length ** (length - 1);
  const wanted = Math.min(count, space);
  const found = new Set<string>();
  for (let attempt = 0; found.size < wanted && attempt < wanted * 50; attempt++) {
    let code = pick(LETTERS);
    for (let i = 1; i < length; i++) code += pick(rest);
    found.add(code);
  }
  return [...found];
}

/**
 * Learner suffixes to offer (D84): two letters, never I or O, then two digits — 57,600 in all
 * per team, all distinct.
 */
export function learnerSuggestionCandidates(
  count: number,
  random: () => number = Math.random,
): string[] {
  const pick = (chars: string) => chars[Math.floor(random() * chars.length)];
  const wanted = Math.min(count, LETTERS.length ** 2 * DIGITS.length ** 2);
  const found = new Set<string>();
  for (let attempt = 0; found.size < wanted && attempt < wanted * 50; attempt++) {
    found.add(pick(LETTERS) + pick(LETTERS) + pick(DIGITS) + pick(DIGITS));
  }
  return [...found];
}

/** Every learner suffix the suggestion can offer (D84), in order: aa00 … zz99, never I or O. */
export function allLearnerSuffixes(): string[] {
  const codes: string[] = [];
  for (const first of LETTERS) {
    for (const second of LETTERS) {
      for (const tens of DIGITS) {
        for (const units of DIGITS) codes.push(first + second + tens + units);
      }
    }
  }
  return codes;
}
