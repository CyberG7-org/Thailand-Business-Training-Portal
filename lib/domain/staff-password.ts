import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './password-policy';

export type StaffPasswordError = 'missing' | 'tooShort' | 'tooLong' | 'mismatch';

/** Staff self-service uses the same length-only policy as provisioning and resets. */
export function validateStaffPasswordChange(
  currentPassword: string,
  newPassword: string,
  confirmation: string,
): StaffPasswordError | null {
  if (!currentPassword || !newPassword || !confirmation) return 'missing';
  if (newPassword.length < MIN_PASSWORD_LENGTH) return 'tooShort';
  if (newPassword.length > MAX_PASSWORD_LENGTH) return 'tooLong';
  if (newPassword !== confirmation) return 'mismatch';
  return null;
}
