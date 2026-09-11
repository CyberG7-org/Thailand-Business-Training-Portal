'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { isValidLoginId, loginIdToEmail } from '@/lib/auth/internal-email';
import { serverEnv } from '@/lib/db/env';
import { createSupabaseServerClient } from '@/lib/db/server';

export type SignInState = { error: 'invalid' | 'disabled' | null };

const schema = z.object({
  loginId: z.string().trim().refine(isValidLoginId),
  password: z.string().min(1),
  locale: z.enum(['th', 'en', 'zh']),
});

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = schema.safeParse({
    loginId: formData.get('loginId'),
    password: formData.get('password'),
    locale: formData.get('locale'),
  });
  // Any failure — malformed ID, unknown account, wrong password — yields the same message (AUTH-004).
  if (!parsed.success) return { error: 'invalid' };
  const { loginId, password } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: loginIdToEmail(loginId, serverEnv().APP_INTERNAL_EMAIL_DOMAIN),
    password,
  });
  if (error || !data.user) return { error: 'invalid' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, preferred_language')
    .eq('id', data.user.id)
    .single();
  if (!profile || profile.status === 'disabled') {
    await supabase.auth.signOut();
    return { error: 'disabled' };
  }
  redirect(`/${profile.preferred_language}/${profile.role === 'admin' ? 'admin' : 'dashboard'}`);
}

export async function signOutAction(formData: FormData) {
  const locale = String(formData.get('locale') ?? 'th');
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(`/${locale}/login`);
}
