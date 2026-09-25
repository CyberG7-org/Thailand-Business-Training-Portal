import { describe, expect, it } from 'vitest';
import { STAFF_ROLES, isStaffRole } from '@/lib/auth/session';

describe('who counts as staff', () => {
  it('is the admin and an active manager, never a learner', () => {
    expect(isStaffRole('admin')).toBe(true);
    expect(isStaffRole('manager')).toBe(true);
    expect(isStaffRole('learner')).toBe(false);
    expect([...STAFF_ROLES].sort()).toEqual(['admin', 'manager']);
  });
});
