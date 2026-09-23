import { redirect } from 'next/navigation';
import type { AppLocale } from '@/i18n/routing';
import { createSupabaseServerClient } from '@/lib/db/server';

export type CurrentUser = {
  id: string;
  loginId: string;
  role: 'learner' | 'manager' | 'admin';
  displayName: string | null;
  preferredLanguage: AppLocale;
  status: 'active' | 'disabled';
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, login_id, role, display_name, preferred_language, status')
    .eq('id', user.id)
    .single();
  if (!profile) return null;
  return {
    id: profile.id,
    loginId: profile.login_id,
    role: profile.role as CurrentUser['role'],
    displayName: profile.display_name,
    preferredLanguage: profile.preferred_language as AppLocale,
    status: profile.status as CurrentUser['status'],
  };
}

/** Redirects to login when signed out or disabled. Source of truth is the profiles row, not the JWT. */
export async function requireUser(locale: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/login`);
  if (user.status === 'disabled') {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    redirect(`/${locale}/login?reason=disabled`);
  }
  return user;
}

export async function requireAdmin(locale: string): Promise<CurrentUser> {
  const user = await requireUser(locale);
  if (user.role !== 'admin') redirect(`/${locale}/dashboard`);
  return user;
}
