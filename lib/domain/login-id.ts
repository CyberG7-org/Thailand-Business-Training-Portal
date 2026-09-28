/**
 * Login ids are stored lower-case, as every login id in this project is, and shown upper-case
 * so a code reads as what it is: T01 is a manager, T01-03 the third learner of that team
 * (spec §3.3). One helper, so `t01-03` can never reach a screen.
 */
export function displayLoginId(loginId: string | null | undefined): string {
  const trimmed = loginId?.trim();
  return trimmed ? trimmed.toUpperCase() : '—';
}

/**
 * The code `allocate_login_id` writes for a counter value — lower-case, a single digit padded to
 * two — so a screen can say which code comes next before it is taken (D66).
 */
export function formatLoginCode(prefix: string, value: number): string {
  return prefix.toLowerCase() + (value < 10 ? `0${value}` : String(value));
}
