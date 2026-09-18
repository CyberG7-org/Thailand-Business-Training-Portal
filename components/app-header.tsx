import { getTranslations } from 'next-intl/server';
import { LanguageToggle } from '@/components/language-toggle';
import { SignOutButton } from '@/components/sign-out-button';
import type { CurrentUser } from '@/lib/auth/session';

export async function AppHeader({ user, admin = false }: { user: CurrentUser; admin?: boolean }) {
  const t = await getTranslations('app');
  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <span className="font-semibold">
        {t('name')}
        {admin ? ' · Admin' : ''}
      </span>
      <div className="flex items-center gap-4 text-sm">
        <LanguageToggle label={t('language')} />
        <span>{user.displayName ?? user.loginId}</span>
        <SignOutButton />
      </div>
    </header>
  );
}
