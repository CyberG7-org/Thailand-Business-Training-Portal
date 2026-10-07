import { getLocale, getTranslations } from 'next-intl/server';
import { SignOutIcon } from '@phosphor-icons/react/dist/ssr';
import { signOutAction } from '@/app/[locale]/(auth)/login/actions';

export async function SignOutButton({ compact = false }: { compact?: boolean }) {
  const locale = await getLocale();
  const t = await getTranslations('auth');
  return (
    <form action={signOutAction}>
      <input type="hidden" name="locale" value={locale} />
      <button
        type="submit"
        className={`grid min-h-11 place-items-center text-sm text-ink-700 hover:text-brand-700 ${compact ? 'size-11 px-0 md:w-auto md:px-2' : 'px-2'}`}
      >
        {compact && <SignOutIcon className="size-5 md:hidden" weight="bold" aria-hidden="true" />}
        <span className={compact ? 'sr-only md:not-sr-only' : ''}>{t('signOut')}</span>
      </button>
    </form>
  );
}
