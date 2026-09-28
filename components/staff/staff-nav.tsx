'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

type Role = 'admin' | 'manager';
type Item = { href: string; key: string; adminOnly?: boolean };

/** The sections in the order a manager reads them; the admin-only doors are marked. */
const GROUPS: { key: 'team' | 'content' | 'learners' | 'system'; items: Item[] }[] = [
  {
    key: 'team',
    items: [
      { href: '/admin/users', key: 'users' },
      { href: '/admin/managers', key: 'managers', adminOnly: true },
    ],
  },
  {
    key: 'content',
    items: [
      { href: '/admin/dbd-records', key: 'dbdRecords' },
      { href: '/admin/content', key: 'content' },
      { href: '/admin/questions', key: 'questions' },
    ],
  },
  {
    key: 'learners',
    items: [
      { href: '/admin/interviews', key: 'interviews' },
      { href: '/admin/appointments', key: 'appointments' },
    ],
  },
  {
    key: 'system',
    items: [
      { href: '/admin/notifications', key: 'notifications', adminOnly: true },
      { href: '/admin/settings', key: 'settings', adminOnly: true },
      { href: '/admin/audit', key: 'audit' },
    ],
  },
];

/**
 * The staff sidebar: every section the caller may open, grouped, with the current one marked
 * by a brand bar. On a phone it becomes one scrolling strip under the band.
 */
export function StaffNav({ role }: { role: Role }) {
  const t = useTranslations('admin');
  const pathname = usePathname();
  const active = (href: string) => pathname === href || pathname.startsWith(href + '/');
  return (
    <nav
      data-testid="staff-nav"
      aria-label={t('title')}
      className="min-w-0 rounded-card bg-white p-2 shadow-raised md:sticky md:top-6 md:self-start md:p-3"
    >
      <ul className="flex gap-1 overflow-x-auto md:flex-col md:gap-4 md:overflow-visible">
        {GROUPS.map((group) => {
          const items = group.items.filter((item) => !item.adminOnly || role === 'admin');
          if (items.length === 0) return null;
          return (
            <li key={group.key} className="shrink-0 md:shrink">
              <div className="hidden px-3 pb-1 text-xs font-semibold text-ink-500 md:block">
                {t(`navGroups.${group.key}`)}
              </div>
              <ul className="flex gap-1 md:flex-col">
                {items.map((item) => {
                  const current = active(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={current ? 'page' : undefined}
                        className={
                          'flex min-h-11 items-center rounded-control px-3 text-sm font-medium whitespace-nowrap transition-colors ' +
                          (current
                            ? 'bg-brand-50 text-brand-700 shadow-[inset_4px_0_0_var(--color-brand-700)]'
                            : 'text-ink-900 hover:bg-ink-50')
                        }
                      >
                        {t(`nav.${item.key}` as 'nav.users')}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
