'use server';

import { cookies } from 'next/headers';
import { hasLocale } from 'next-intl';
import { redirect } from 'next/navigation';
import { LANGUAGE_CHOICE_COOKIE } from '@/i18n/language-choice';
import { routing } from '@/i18n/routing';
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
  // A language picked on the login page is a deliberate choice: it wins over the stored
  // preference and becomes the new preference. Otherwise the stored preference wins.
  const jar = await cookies();
  const chosen = jar.get(LANGUAGE_CHOICE_COOKIE)?.value;
  let language = profile.preferred_language;
  if (chosen && hasLocale(routing.locales, chosen)) {
    jar.delete(LANGUAGE_CHOICE_COOKIE);
    if (chosen !== language) {
      await supabase.rpc('set_my_preferred_language', { p_lang: chosen });
      language = chosen;
    }
  }
  redirect(`/${language}/${profile.role === 'admin' ? 'admin' : 'dashboard'}`);
}

export async function signOutAction(formData: FormData) {
  const locale = String(formData.get('locale') ?? 'th');
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(`/${locale}/login`);
}
