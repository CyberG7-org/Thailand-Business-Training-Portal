import { getLocale, getTranslations } from 'next-intl/server';
import { signOutAction } from '@/app/[locale]/(auth)/login/actions';

export async function SignOutButton() {
  const locale = await getLocale();
  const t = await getTranslations('auth');
  return (
    <form action={signOutAction}>
      <input type="hidden" name="locale" value={locale} />
      <button type="submit" className="text-sm underline">
        {t('signOut')}
      </button>
    </form>
  );
}
