import type { ReactNode } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { CurrentUser } from '@/lib/auth/session';
import { initialsOf } from '@/lib/domain/initials';
import { displayLoginId } from '@/lib/domain/login-id';
import { StaffHeaderActions } from './staff-header-actions';
import { StaffNav } from './staff-nav';

/**
 * The staff shell (admin and manager screens): the learner portal's navy band and glass header,
 * slimmer, with a role chip; the sidebar and the page on the dot grid. The sidebar reaches every
 * section, so there are no Back and Home buttons (D82); a detail page links to its own list.
 * Pages render inside `main.staff`, where the shared patterns apply; a page may put a column
 * under the sidebar (`side`, a company record's status), and then the sidebar scrolls with it.
 */
export async function StaffShell({
  user,
  side,
  children,
}: {
  user: CurrentUser;
  side?: ReactNode;
  children: ReactNode;
}) {
  const [locale, t, ta, tp] = await Promise.all([
    getLocale(),
    getTranslations('app'),
    getTranslations('admin'),
    getTranslations('header'),
  ]);
  const role =
    user.role === 'admin' ? 'admin' : user.role === 'submanager' ? 'submanager' : 'manager';
  return (
    <div className="bg-dotgrid min-h-screen">
      <div className="band px-4 pt-4 pb-5 md:px-6">
        <header
          data-testid="shell-header"
          className="glass relative z-20 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 rounded-card py-4 pr-4 pl-5 text-ink-900 shadow-header md:flex md:justify-between md:gap-6 md:py-3.5 md:pr-4 md:pl-6"
        >
          <div className="contents md:flex md:min-w-0 md:flex-1 md:flex-col md:items-start md:gap-1">
            <Link
              href="/admin"
              className="col-start-1 row-start-1 min-w-0 rounded-control font-display text-[15px] leading-[1.4] font-semibold text-brand-900 md:text-xl md:whitespace-nowrap"
            >
              {t('name')}
            </Link>
            <span className="col-start-1 row-start-2 justify-self-start rounded-full bg-brand-100 px-2.5 py-px text-sm leading-[1.7] font-medium text-brand-700">
              {ta(`roles.${role}`)}
            </span>
          </div>
          <StaffHeaderActions
            languageLabel={tp('language')}
            profile={{
              name: user.displayName ?? displayLoginId(user.loginId),
              loginId: displayLoginId(user.loginId),
              initials: initialsOf(user.displayName, user.loginId),
              locale,
              labels: {
                profile: tp('profile'),
                profileSettings: tp('profileSettings'),
                signOut: tp('signOut'),
              },
            }}
          />
        </header>
      </div>
      <div className="mx-auto grid max-w-[1440px] grid-cols-[minmax(0,1fr)] gap-5 px-4 py-5 md:grid-cols-[236px_minmax(0,1fr)] md:gap-6 md:px-6 md:py-6">
        {/* Sticky while it is the sidebar alone; with a column under it, it is too tall to pin. */}
        <div className="grid min-w-0 content-start gap-5 md:sticky md:top-6 md:self-start md:has-data-staff-side:static">
          <StaffNav role={role} />
          {side}
        </div>
        <main className="staff min-w-0">{children}</main>
      </div>
    </div>
  );
}
