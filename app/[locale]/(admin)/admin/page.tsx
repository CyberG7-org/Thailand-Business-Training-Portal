import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireStaff } from '@/lib/auth/session';

/** The doors a manager may open, in order; the admin gets these plus the admin-only ones. */
const STAFF_LINKS = [
  ['/admin/users', 'users'],
  ['/admin/dbd-records', 'dbdRecords'],
  ['/admin/content', 'content'],
  ['/admin/questions', 'questions'],
  ['/admin/calls', 'calls'],
] as const;

const ADMIN_LINKS = [
  ['/admin/managers', 'managers'],
  ['/admin/notifications', 'notifications'],
  ['/admin/settings', 'settings'],
  ['/admin/audit', 'audit'],
] as const;

export default async function AdminHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireStaff(locale);
  const t = await getTranslations('admin');
  const links = user.role === 'admin' ? [...ADMIN_LINKS, ...STAFF_LINKS] : STAFF_LINKS;
  return (
    <section>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <ul className="mt-4 list-disc pl-6" data-testid="admin-nav">
        {links.map(([href, key]) => (
          <li key={href}>
            <Link href={href} className="underline">
              {t(`nav.${key}` as 'nav.users')}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
