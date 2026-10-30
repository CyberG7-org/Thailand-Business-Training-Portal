'use client';

import {
  BankIcon,
  BellIcon,
  BookOpenTextIcon,
  FileTextIcon,
  GearIcon,
  TagIcon,
  UserPlusIcon,
  UsersIcon,
  UsersThreeIcon,
  WarningIcon,
} from '@phosphor-icons/react/dist/ssr';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

export type StaffRole = 'admin' | 'manager' | 'submanager';
export type StaffNavItem = { href: string; key: string; adminOnly?: boolean };
export type StaffNavGroup = {
  key: 'team' | 'content' | 'learners' | 'system';
  items: StaffNavItem[];
};

export const STAFF_NAV_GROUPS: StaffNavGroup[] = [
  {
    key: 'team',
    items: [
      { href: '/admin/managers', key: 'managers', adminOnly: true },
      { href: '/admin/users', key: 'users' },
      { href: '/admin/submanagers', key: 'submanagers' },
      { href: '/admin/learners', key: 'learners' },
    ],
  },
  { key: 'learners', items: [{ href: '/admin/appointments', key: 'appointments' }] },
  {
    key: 'content',
    items: [
      { href: '/admin/exceptions', key: 'exceptions' },
      { href: '/admin/questions', key: 'questions', adminOnly: true },
    ],
  },
  {
    key: 'system',
    items: [
      { href: '/admin/notifications', key: 'notifications', adminOnly: true },
      { href: '/admin/business-categories', key: 'businessCategories', adminOnly: true },
      { href: '/admin/settings', key: 'settings', adminOnly: true },
    ],
  },
];

export function visibleStaffNavGroups(role: StaffRole) {
  return STAFF_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (role === 'submanager') {
        return ['/admin/users', '/admin/learners'].includes(item.href);
      }
      return !item.adminOnly || role === 'admin';
    }),
  })).filter((group) => group.items.length > 0);
}

export function isStaffNavItemActive(pathname: string, href: string) {
  if (href === '/admin/users') {
    return pathname === href || pathname.startsWith('/admin/dbd-records');
  }
  if (href === '/admin/learners') {
    return (
      pathname === href ||
      pathname.startsWith('/admin/learners/') ||
      pathname.startsWith('/admin/users/')
    );
  }
  return pathname === href || pathname.startsWith(href + '/');
}

export function activeStaffNavItem(pathname: string, role: StaffRole) {
  for (const group of visibleStaffNavGroups(role)) {
    const item = group.items.find((candidate) => isStaffNavItemActive(pathname, candidate.href));
    if (item) return { group, item };
  }
  return null;
}

function NavIcon({ itemKey }: { itemKey: string }) {
  const className = 'size-5 shrink-0';
  const props = { className, 'aria-hidden': true } as const;
  switch (itemKey) {
    case 'managers':
      return <UsersThreeIcon {...props} />;
    case 'users':
      return <UserPlusIcon {...props} />;
    case 'submanagers':
      return <UsersIcon {...props} />;
    case 'learners':
      return <FileTextIcon {...props} />;
    case 'appointments':
      return <BankIcon {...props} />;
    case 'exceptions':
      return <WarningIcon {...props} />;
    case 'questions':
      return <BookOpenTextIcon {...props} />;
    case 'notifications':
      return <BellIcon {...props} />;
    case 'businessCategories':
      return <TagIcon {...props} />;
    default:
      return <GearIcon {...props} />;
  }
}

export function StaffNav({ role, collapsed = false }: { role: StaffRole; collapsed?: boolean }) {
  const t = useTranslations('admin');
  const pathname = usePathname();

  return (
    <nav data-testid="staff-nav" aria-label={t('title')} className="min-w-0">
      <ul className="grid gap-2">
        {visibleStaffNavGroups(role).map((group) => (
          <li key={group.key}>
            {collapsed ? (
              <div className="mx-2 my-2 h-px bg-white/12" aria-hidden="true" />
            ) : (
              <div className="px-3 pt-2.5 pb-0.5 text-xs leading-[1.6] font-medium text-brand-100/75">
                {t(`navGroups.${group.key}`)}
              </div>
            )}
            <ul className="grid gap-1">
              {group.items.map((item) => {
                const current = isStaffNavItemActive(pathname, item.href);
                const label = t(`nav.${item.key}` as 'nav.users');
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-label={label}
                      title={collapsed ? label : undefined}
                      aria-current={current ? 'page' : undefined}
                      className={`flex min-h-11 items-center rounded-control px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-100 ${
                        collapsed ? 'justify-center' : 'gap-3'
                      } ${
                        current
                          ? 'bg-brand-600 text-white'
                          : 'text-brand-100 hover:bg-brand-700 hover:text-white'
                      }`}
                    >
                      <span className={current ? 'text-white' : 'text-brand-100/75'}>
                        <NavIcon itemKey={item.key} />
                      </span>
                      <span className={collapsed ? 'sr-only' : ''}>{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
