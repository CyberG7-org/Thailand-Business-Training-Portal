import { getTranslations } from 'next-intl/server';
import { ChevronIcon } from '@/components/icons';
import { Link } from '@/i18n/navigation';
import { requireStaff } from '@/lib/auth/session';

/** The doors a manager may open, in order; the admin gets these plus the admin-only ones. */
const STAFF_LINKS = [
  // "Create learner & DBD" holds the companies list too (D80).
  ['/admin/users', 'users'],
  ['/admin/learners', 'learners'],
  ['/admin/questions', 'questions'],
  ['/admin/interviews', 'interviews'],
  ['/admin/appointments', 'appointments'],
] as const;

const ADMIN_LINKS = [
  ['/admin/managers', 'managers'],
  ['/admin/notifications', 'notifications'],
  ['/admin/settings', 'settings'],
] as const;

/** The staff home: one card per section; the suite reads the list by `admin-nav`. */
export default async function AdminHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireStaff(locale);
  const t = await getTranslations('admin');
  const links = user.role === 'admin' ? [...ADMIN_LINKS, ...STAFF_LINKS] : STAFF_LINKS;
  return (
    <section className="grid gap-5">
      <div>
        <h1>{t('title')}</h1>
        <p className="staff-intro mt-1">{t('home.intro')}</p>
      </div>
      <ul data-testid="admin-nav" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {links.map(([href, key]) => (
          <li key={href}>
            <Link
              href={href}
              className="staff-card flex min-h-[84px] items-center justify-between gap-3 transition-colors hover:bg-brand-50"
            >
              <span className="text-base font-semibold text-brand-900">
                {t(`nav.${key}` as 'nav.users')}
              </span>
              <ChevronIcon className="shrink-0 text-ink-500" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
