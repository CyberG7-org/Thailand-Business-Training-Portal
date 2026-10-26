import { describe, expect, it } from 'vitest';
import { validateStaffPasswordChange } from '@/lib/domain/staff-password';

describe('staff password change', () => {
  it('requires all three values and a 6–8 character new password', () => {
    expect(validateStaffPasswordChange('', 'newpass', 'newpass')).toBe('missing');
    expect(validateStaffPasswordChange('old-password', 'short', 'short')).toBe('tooShort');
    expect(validateStaffPasswordChange('old-password', 'a'.repeat(9), 'a'.repeat(9))).toBe(
      'tooLong',
    );
  });

  it('accepts any characters, but confirmation must match', () => {
    expect(validateStaffPasswordChange('old-password', 'newpass', 'otherpw')).toBe('mismatch');
    expect(validateStaffPasswordChange('old-password', 'a b!12', 'a b!12')).toBeNull();
    expect(validateStaffPasswordChange('same123', 'same123', 'same123')).toBeNull();
  });
});
