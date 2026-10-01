import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { LanguageToggle } from '@/components/language-toggle';
import { SignOutButton } from '@/components/sign-out-button';
import { Link } from '@/i18n/navigation';
import type { CurrentUser } from '@/lib/auth/session';
import { initialsOf } from '@/lib/domain/initials';
import { displayLoginId } from '@/lib/domain/login-id';
import { StaffNav } from './staff-nav';

/**
 * The staff shell (admin and manager screens): the learner portal's navy band and glass header,
 * slimmer, with a role chip; the sidebar and the page on the dot grid. The sidebar reaches every
 * section, so there are no Back and Home buttons (D82); a detail page links to its own list.
 * Pages render inside `main.staff`, where the shared patterns apply.
 */
export async function StaffShell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  const [t, ta] = await Promise.all([getTranslations('app'), getTranslations('admin')]);
  const role = user.role === 'admin' ? 'admin' : 'manager';
  return (
    <div className="bg-dotgrid min-h-screen">
      <div className="band px-4 pt-4 pb-5 md:px-6">
        <header
          data-testid="shell-header"
          className="glass flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card py-2.5 pr-3 pl-4 text-ink-900 shadow-[0_8px_24px_rgb(12_26_58/0.18)]"
        >
          <Link href="/admin" className="flex items-center gap-3 rounded-control">
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-brand-900 font-display text-base font-semibold text-gold-100 shadow-[inset_0_0_0_1px_rgb(200_150_62/0.6)]"
            >
              BT
            </span>
            <span className="font-display text-[17px] leading-[1.4] font-semibold text-brand-900">
              {t('name')} · Admin
            </span>
          </Link>
          <span className="mr-auto rounded-full bg-brand-100 px-2.5 py-px text-xs font-semibold text-brand-700">
            {ta(`roles.${role}`)}
          </span>
          <LanguageToggle label={t('language')} />
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
        </header>
      </div>
      <div className="mx-auto grid max-w-[1440px] grid-cols-[minmax(0,1fr)] gap-5 px-4 py-5 md:grid-cols-[236px_minmax(0,1fr)] md:gap-6 md:px-6 md:py-6">
        <StaffNav role={role} />
        <main className="staff min-w-0">{children}</main>
      </div>
    </div>
  );
}
