/**
 * Account codes (D69). Staff type the part after a fixed prefix: the owner gives a manager
 * a two-character code without a prefix, and a manager gives a learner their whole code plus a
 * four-character suffix. Each new code may contain ASCII letters and digits in any order.
 * Codes are case-insensitive and stored lower-case, then shown upper-case. Existing IDs,
 * including older formats, are left unchanged.
 */
export const MANAGER_PREFIX = '';

/** Whose code is being chosen: a manager's (the owner) or a learner's (staff). */
export type LoginIdKind = 'manager' | 'learner';

/** Suggested codes keep the familiar readable shapes; manually typed codes may use any order. */
const SHAPES: Record<LoginIdKind, { letters: number; digits: number }> = {
  manager: { letters: 1, digits: 1 },
  learner: { letters: 2, digits: 2 },
};

/** A new manager's code: any two ASCII letters or digits. */
export const MANAGER_SUFFIX_PATTERN = /^[a-z0-9]{2}$/i;

/** A new learner's typed part: any four ASCII letters or digits. */
export const LEARNER_SUFFIX_PATTERN = /^[a-z0-9]{4}$/i;

export function isValidSuffixFor(kind: LoginIdKind, suffix: string): boolean {
  return (kind === 'learner' ? LEARNER_SUFFIX_PATTERN : MANAGER_SUFFIX_PATTERN).test(suffix);
}

/** How many characters a typed part has: 2 for a manager, 4 for a learner. */
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
 * Suffixes to offer, all distinct, never I or O: 240 for managers and 57,600 per team
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

/** Every suffix the suggestion can offer, in order (a0 … z9, aa00 … zz99), never I or O. */
export function allSuffixes(kind: LoginIdKind): string[] {
  const { letters, digits } = SHAPES[kind];
  let codes = [''];
  for (let i = 0; i < letters; i++) codes = codes.flatMap((c) => [...LETTERS].map((l) => c + l));
  for (let i = 0; i < digits; i++) codes = codes.flatMap((c) => [...DIGITS].map((d) => c + d));
  return codes;
}
