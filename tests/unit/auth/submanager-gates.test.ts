import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const state = vi.hoisted(() => ({
  role: 'submanager',
  profile: {
    id: 'sub',
    login_id: 'tf38s01',
    role: 'submanager',
    manager_id: 'manager',
    display_name: null,
    preferred_language: 'en',
    status: 'active',
  },
  parentActive: true,
}));
vi.mock('react', () => ({ cache: (fn: unknown) => fn }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(path);
  },
}));
vi.mock('@/lib/db/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'sub' } } }), signOut: async () => ({}) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: state.profile }) }) }),
    }),
    rpc: async () => ({ data: state.parentActive, error: null }),
  }),
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { app_metadata: { role: state.role } } } }) },
  }),
}));

import * as session from '@/lib/auth/session';
import { handleWithSession } from '@/lib/db/middleware';

describe('Submanager gates', () => {
  beforeEach(() => {
    state.role = 'submanager';
    state.profile.role = 'submanager';
    state.profile.status = 'active';
    state.parentActive = true;
  });

  it('routes Submanagers home without granting staff privileges', () => {
    expect(session.homePathFor('submanager' as session.CurrentUser['role'], 'en')).toBe(
      '/en/admin',
    );
    expect(session.isStaffRole('submanager' as session.CurrentUser['role'])).toBe(false);
  });
  it('resolves the parent team and admits only the dedicated guard', async () => {
    const user = await session.requireSubmanager('en');
    expect(user.managerId).toBe('manager');
    expect(session.managerTeamId(user)).toBe('manager');
    await expect(session.requireStaff('en')).rejects.toThrow('/en/admin');
    await expect(session.requireManager('en')).rejects.toThrow('/en/admin');
  });
  it('denies a session immediately when its parent is inactive', async () => {
    state.parentActive = false;
    await expect(session.requireUser('en')).rejects.toThrow('/en/login?reason=disabled');
  });
  it('admits Submanagers to explicit list/profile guards', async () => {
    expect((await session.requireStaffOrSubmanager('en')).id).toBe('sub');
  });
  it.each(['admin', 'manager'])('preserves staff access for %s', async (role) => {
    state.profile.role = role;
    const user = await session.requireStaff('en');
    expect(user.role).toBe(role);
    expect(session.managerTeamId(user)).toBe(role === 'manager' ? 'sub' : null);
    await expect(session.requireSubmanager('en')).rejects.toThrow('/en/admin');
  });
  it('denies learner access to all admin guards', async () => {
    state.profile.role = 'learner';
    await expect(session.requireStaffOrSubmanager('en')).rejects.toThrow('/en/dashboard');
    await expect(session.requireManager('en')).rejects.toThrow('/en/dashboard');
  });
  it.each(['/admin', '/admin/users', '/admin/learners', '/admin/profile'])(
    'admits the exact route %s',
    async (path) => {
      const response = await handleWithSession(
        new NextRequest(`https://example.test/en${path}`),
        () => NextResponse.next(),
      );
      expect(response.headers.get('location')).toBeNull();
    },
  );
  it.each([
    '/admin/users/learner',
    '/admin/learners/learner',
    '/admin/profile/other',
    '/admin/dbd-records',
    '/admin/settings',
    '/admin/appointments',
    '/admin/interviews',
  ])('denies %s', async (path) => {
    const response = await handleWithSession(
      new NextRequest(`https://example.test/en${path}`),
      () => NextResponse.next(),
    );
    expect(response.headers.get('location')).toBe('https://example.test/en/admin');
  });
});
