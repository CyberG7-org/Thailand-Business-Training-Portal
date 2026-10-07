import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LanguageToggle } from '@/components/language-toggle';
import { SignOutButton } from '@/components/sign-out-button';
import type { CurrentUser } from '@/lib/auth/session';
import { initialsOf } from '@/lib/domain/initials';
import { displayLoginId } from '@/lib/domain/login-id';

/**
 * The glass header on the band: monogram and app name leading home, the language switcher, and
 * the signed-in user with Sign out. On a phone the name text steps aside and the row wraps.
 */
export async function ShellHeader({
  user,
  compact = false,
}: {
  user: CurrentUser | null;
  compact?: boolean;
}) {
  const [t, td] = await Promise.all([getTranslations('app'), getTranslations('dashboard')]);
  const name = t('name');
  const thaiName = t('nameThai');
  return (
    <header
      data-testid="shell-header"
      className={`glass flex items-center rounded-card py-2.5 pr-2 pl-3 text-ink-900 shadow-[0_8px_24px_rgb(12_26_58/0.18)] ${compact ? 'gap-2 md:gap-x-5' : 'flex-wrap gap-x-5 gap-y-2'}`}
    >
      <Link
        href="/dashboard"
        data-testid="nav-home"
        className="mr-auto flex min-w-0 items-center gap-2.5 rounded-control"
      >
        {compact && user && (
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-gold-100 text-sm font-semibold text-brand-900 md:hidden"
          >
            {initialsOf(user.displayName, user.loginId)}
          </span>
        )}
        <span
          aria-hidden="true"
          className={`size-10 shrink-0 place-items-center rounded-[10px] bg-brand-900 font-display text-base font-semibold text-gold-100 shadow-[inset_0_0_0_1px_rgb(200_150_62/0.6)] ${compact ? 'hidden md:grid' : 'grid'}`}
        >
          BT
        </span>
        <span className={`${compact ? 'flex' : 'hidden sm:flex'} min-w-0 flex-col leading-[1.35]`}>
          <span className="truncate text-sm font-semibold text-brand-900 md:font-display md:text-[17px]">
            <span className="md:hidden">
              {user?.displayName ?? (user ? displayLoginId(user.loginId) : name)}
            </span>
            <span className="hidden md:inline">{name}</span>
          </span>
          <span className="truncate text-xs text-ink-500 md:hidden">{td('accountLabel')}</span>
          {thaiName !== name && (
            <span className="hidden text-sm text-ink-700 md:inline">{thaiName}</span>
          )}
        </span>
      </Link>
      <LanguageToggle label={t('language')} compact={compact} />
      {user && (
        <div
          className={`flex items-center border-l border-brand-700/20 ${compact ? 'pl-1 md:gap-2.5 md:pl-4' : 'gap-2.5 pl-4'}`}
        >
          <span
            aria-hidden="true"
            className={`size-9 shrink-0 place-items-center rounded-full bg-gold-100 text-sm font-semibold text-brand-900 ${compact ? 'hidden md:grid' : 'grid'}`}
          >
            {initialsOf(user.displayName, user.loginId)}
          </span>
          <span className="hidden text-sm font-medium md:inline">
            {user.displayName ?? displayLoginId(user.loginId)}
          </span>
          <SignOutButton compact={compact} />
        </div>
      )}
    </header>
  );
}
