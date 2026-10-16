import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  getUser: vi.fn(),
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ requireStaff: mocks.requireStaff }));
vi.mock('@/lib/db/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock('@/lib/db/env', () => ({
  publicEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-key',
  }),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      updateUser: mocks.updateUser,
      signOut: mocks.signOut,
    },
  }),
}));

import { changePasswordAction } from '@/app/[locale]/(admin)/admin/profile/actions';

function form(currentPassword: string, newPassword = 'New123!') {
  const data = new FormData();
  data.set('locale', 'en');
  data.set('currentPassword', currentPassword);
  data.set('newPassword', newPassword);
  data.set('confirmPassword', newPassword);
  return data;
}

describe('staff self-service password action', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireStaff.mockResolvedValue({ id: 'staff-1', role: 'manager' });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'staff-1', email: 'staff@example.test' } },
      error: null,
    });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it('rejects an incorrect current password without updating the account', async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: null }, error: new Error('bad') });
    const result = await changePasswordAction(
      { error: null, success: false },
      form('wrong-password'),
    );
    expect(result).toEqual({ error: 'invalidCurrent', success: false });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it('updates only the verified staff account', async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: 'staff-1' } }, error: null });
    mocks.updateUser.mockResolvedValue({ error: null });
    const result = await changePasswordAction({ error: null, success: false }, form('Old123!'));
    expect(result).toEqual({ error: null, success: true });
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'staff@example.test',
      password: 'Old123!',
    });
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'New123!' });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('rejects a verified account with a different user ID', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'other-user' } },
      error: null,
    });
    const result = await changePasswordAction({ error: null, success: false }, form('Old123!'));
    expect(result).toEqual({ error: 'invalidCurrent', success: false });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
