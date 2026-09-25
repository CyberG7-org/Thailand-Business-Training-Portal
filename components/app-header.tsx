import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LanguageToggle } from '@/components/language-toggle';
import { PageNav } from '@/components/page-nav';
import { SignOutButton } from '@/components/sign-out-button';
import type { CurrentUser } from '@/lib/auth/session';
import { displayLoginId } from '@/lib/domain/login-id';

export async function AppHeader({ user, admin = false }: { user: CurrentUser; admin?: boolean }) {
  const t = await getTranslations('app');
  const home = admin ? '/admin' : '/dashboard';
  return (
    <>
      <header className="flex items-center justify-between border-b px-6 py-3">
        <Link href={home} className="font-semibold">
          {t('name')}
          {admin ? ' · Admin' : ''}
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <LanguageToggle label={t('language')} />
          <span>{user.displayName ?? displayLoginId(user.loginId)}</span>
          <SignOutButton />
        </div>
      </header>
      <PageNav home={home} labels={{ back: t('back'), home: t('home') }} />
    </>
  );
}
