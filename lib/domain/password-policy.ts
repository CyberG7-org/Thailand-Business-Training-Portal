export const MIN_PASSWORD_LENGTH = 6;
export const MAX_PASSWORD_LENGTH = 8;

/** All account roles use the same length-only password rule. */
export function isValidPassword(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH;
}
