'use server';

import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { createSupabaseServerClient } from '@/lib/db/server';

/** Persists the signed-in user's language choice; a no-op for anonymous visitors. */
export async function setPreferredLanguageAction(locale: string): Promise<void> {
  if (!hasLocale(routing.locales, locale)) return;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.rpc('set_my_preferred_language', { p_lang: locale });
}
