/**
 * Login ids are stored lower-case, as every login id in this project is, and shown upper-case
 * so a code reads as what it is: T01 is a manager, T01-03 the third learner of that team
 * (spec §3.3). One helper, so `t01-03` can never reach a screen.
 */
export function displayLoginId(loginId: string | null | undefined): string {
  const trimmed = loginId?.trim();
  return trimmed ? trimmed.toUpperCase() : '—';
}
