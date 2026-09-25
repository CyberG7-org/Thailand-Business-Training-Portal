import { getLocale, getTranslations } from 'next-intl/server';
import { signOutAction } from '@/app/[locale]/(auth)/login/actions';

export async function SignOutButton() {
  const locale = await getLocale();
  const t = await getTranslations('auth');
  return (
    <form action={signOutAction}>
      <input type="hidden" name="locale" value={locale} />
      <button
        type="submit"
        className="grid min-h-11 place-items-center px-2 text-sm text-ink-700 hover:text-brand-700"
      >
        {t('signOut')}
      </button>
    </form>
  );
}
