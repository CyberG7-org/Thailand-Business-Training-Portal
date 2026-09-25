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
export async function ShellHeader({ user }: { user: CurrentUser | null }) {
  const t = await getTranslations('app');
  const name = t('name');
  const thaiName = t('nameThai');
  return (
    <header
      data-testid="shell-header"
      className="glass flex flex-wrap items-center gap-x-5 gap-y-2 rounded-card py-2.5 pr-3 pl-4 text-ink-900 shadow-[0_8px_24px_rgb(12_26_58/0.18)]"
    >
      <Link
        href="/dashboard"
        data-testid="nav-home"
        className="mr-auto flex items-center gap-3 rounded-control"
      >
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-brand-900 font-display text-base font-semibold text-gold-100 shadow-[inset_0_0_0_1px_rgb(200_150_62/0.6)]"
        >
          BT
        </span>
        <span className="hidden flex-col leading-[1.4] sm:flex">
          <span className="font-display text-[17px] font-semibold text-brand-900">{name}</span>
          {thaiName !== name && <span className="text-sm text-ink-700">{thaiName}</span>}
        </span>
      </Link>
      <LanguageToggle label={t('language')} />
      {user && (
        <div className="flex items-center gap-2.5 border-l border-brand-700/20 pl-4">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-100 text-sm font-semibold text-brand-900"
          >
            {initialsOf(user.displayName, user.loginId)}
          </span>
          <span className="hidden text-sm font-medium sm:inline">
            {user.displayName ?? displayLoginId(user.loginId)}
          </span>
          <SignOutButton />
        </div>
      )}
    </header>
  );
}
