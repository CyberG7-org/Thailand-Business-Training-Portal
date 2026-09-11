/** Login IDs are case-insensitive and stored lower-case. */
export const LOGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/i;

export function isValidLoginId(loginId: string): boolean {
  return LOGIN_ID_PATTERN.test(loginId);
}

/** Supabase Auth needs an email; learners never see this address (spec §4.1). */
export function loginIdToEmail(loginId: string, domain: string): string {
  return `${loginId.toLowerCase()}@${domain}`;
}
