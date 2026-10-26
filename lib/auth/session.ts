import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { AppLocale } from '@/i18n/routing';
import { createSupabaseServerClient } from '@/lib/db/server';

export type CurrentUser = {
  id: string;
  loginId: string;
  role: 'learner' | 'submanager' | 'manager' | 'admin';
  managerId: string | null;
  displayName: string | null;
  preferredLanguage: AppLocale;
  status: 'active' | 'disabled';
  archivedAt?: string | null;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, login_id, role, manager_id, display_name, preferred_language, status, archived_at')
    .eq('id', user.id)
    .single();
  if (!profile) return null;
  return {
    id: profile.id,
    loginId: profile.login_id,
    role: profile.role as CurrentUser['role'],
    managerId: profile.manager_id,
    displayName: profile.display_name,
    preferredLanguage: profile.preferred_language as AppLocale,
    status: profile.status as CurrentUser['status'],
    archivedAt: profile.archived_at,
  };
});

/** Redirects to login when signed out or disabled. Source of truth is the profiles row, not the JWT. */
export async function requireUser(locale: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/login`);
  if (user.status === 'disabled' || user.archivedAt) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    redirect(`/${locale}/login?reason=disabled`);
  }
  if (user.role === 'submanager') {
    const supabase = await createSupabaseServerClient();
    // SECURITY DEFINER checks the parent without exposing its profile through RLS.
    const { data, error } = await supabase.rpc('is_submanager');
    if (!user.managerId || error || data !== true) {
      await supabase.auth.signOut();
      redirect(`/${locale}/login?reason=disabled`);
    }
  }
  return user;
}

/** Level 1 and level 2 both reach the working screens; only level 1 reaches settings (spec §11). */
export const STAFF_ROLES = ['admin', 'manager'] as const;

export function isStaffRole(role: CurrentUser['role']): boolean {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

/** Where a signed-in person belongs: staff work in the admin area, learners study (spec §11). */
export function homePathFor(role: CurrentUser['role'], locale: string): string {
  return `/${locale}/${isStaffRole(role) || role === 'submanager' ? 'admin' : 'dashboard'}`;
}

export async function requireAdmin(locale: string): Promise<CurrentUser> {
  const user = await requireUser(locale);
  if (user.role !== 'admin') {
    redirect(homePathFor(user.role, locale));
  }
  return user;
}

/**
 * The admin or an active manager. `requireUser` has already read the profile row rather than the
 * JWT, so a manager suspended mid-session loses these screens on their next request.
 */
export async function requireStaff(
  locale: string,
): Promise<CurrentUser & { role: 'admin' | 'manager' }> {
  const user = await requireUser(locale);
  if (!isStaffRole(user.role)) redirect(homePathFor(user.role, locale));
  return user as CurrentUser & { role: 'admin' | 'manager' };
}

/** Exact-role guards; neither grants the other role's capabilities. */
export async function requireSubmanager(locale: string): Promise<CurrentUser> {
  const user = await requireUser(locale);
  if (user.role !== 'submanager') redirect(homePathFor(user.role, locale));
  return user;
}

export async function requireManager(locale: string): Promise<CurrentUser> {
  const user = await requireUser(locale);
  if (user.role !== 'manager') redirect(homePathFor(user.role, locale));
  return user;
}

/** Only the admin shell and explicitly allowed list/profile pages use this guard. */
export async function requireStaffOrSubmanager(locale: string): Promise<CurrentUser> {
  const user = await requireUser(locale);
  if (!isStaffRole(user.role) && user.role !== 'submanager')
    redirect(homePathFor(user.role, locale));
  return user;
}

export function managerTeamId(user: CurrentUser): string | null {
  if (user.role === 'manager') return user.id;
  if (user.role === 'submanager') return user.managerId;
  return null;
}
