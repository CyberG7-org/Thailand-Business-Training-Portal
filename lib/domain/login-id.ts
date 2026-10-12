/**
 * Account codes (D69). Staff type the part after a fixed prefix: the owner gives a manager
 * `T-` + a suffix (T-A12: one letter and two digits, D85), a manager gives a learner their own
 * code + `-` + a suffix (T-A12-DA42: two letters and two digits, D84).
 * Codes are case-insensitive — stored lower-case, as every login id in this project is, and
 * shown upper-case — so `t-a12` can never reach a screen.
 */
export const MANAGER_PREFIX = 't';

/** Whose code is being chosen: a manager's (the owner) or a learner's (staff). */
export type LoginIdKind = 'manager' | 'learner';

/** A typed part is some letters then some digits, by whose code it is. */
const SHAPES: Record<LoginIdKind, { letters: number; digits: number }> = {
  manager: { letters: 1, digits: 2 },
  learner: { letters: 2, digits: 2 },
};

/** A manager's typed part (D85): exactly one letter then two digits, e.g. A12. */
export const MANAGER_SUFFIX_PATTERN = /^[a-z][0-9]{2}$/i;

/** A learner's typed part (D84): exactly two letters then two digits, e.g. DA42. */
export const LEARNER_SUFFIX_PATTERN = /^[a-z]{2}[0-9]{2}$/i;

export function isValidSuffixFor(kind: LoginIdKind, suffix: string): boolean {
  return (kind === 'learner' ? LEARNER_SUFFIX_PATTERN : MANAGER_SUFFIX_PATTERN).test(suffix);
}

/** How many characters a typed part has: 3 for a manager, 4 for a learner. */
export function suffixLength(kind: LoginIdKind): number {
  return SHAPES[kind].letters + SHAPES[kind].digits;
}

export function managerLoginId(suffix: string): string {
  return MANAGER_PREFIX + suffix.trim().toLowerCase();
}

/**
 * Every learner code starts with their manager's whole code, whatever shape that code has — a
 * manager created before D85 keeps working until renamed.
 */
export function learnerPrefix(managerLoginId: string): string {
  return managerLoginId.trim().toLowerCase().replaceAll('-', '');
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
 * Suffixes to offer, all distinct, never I or O: 2,400 for managers (D85) and 57,600 per team
 * for learners (D84). Fewer come back than asked for only when the space is smaller.
 */
export function suggestionCandidates(
  kind: LoginIdKind,
  count: number,
  random: () => number = Math.random,
): string[] {
  const { letters, digits } = SHAPES[kind];
  const pick = (chars: string) => chars[Math.floor(random() * chars.length)];
  const wanted = Math.min(count, LETTERS.length ** letters * DIGITS.length ** digits);
  const found = new Set<string>();
  for (let attempt = 0; found.size < wanted && attempt < wanted * 50; attempt++) {
    let code = '';
    for (let i = 0; i < letters; i++) code += pick(LETTERS);
    for (let i = 0; i < digits; i++) code += pick(DIGITS);
    found.add(code);
  }
  return [...found];
}

/** Every suffix the suggestion can offer, in order (a00 … z99, aa00 … zz99), never I or O. */
export function allSuffixes(kind: LoginIdKind): string[] {
  const { letters, digits } = SHAPES[kind];
  let codes = [''];
  for (let i = 0; i < letters; i++) codes = codes.flatMap((c) => [...LETTERS].map((l) => c + l));
  for (let i = 0; i < digits; i++) codes = codes.flatMap((c) => [...DIGITS].map((d) => c + d));
  return codes;
}
