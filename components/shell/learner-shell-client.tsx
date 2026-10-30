'use client';

import {
  BankIcon,
  BookOpenTextIcon,
  CaretRightIcon,
  CheckIcon,
  ExamIcon,
  HouseIcon,
  IdentificationCardIcon,
  ListIcon,
  LockIcon,
  SidebarSimpleIcon,
  XIcon,
} from '@phosphor-icons/react/dist/ssr';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { LanguageToggle } from '@/components/language-toggle';
import { ProfileDropdown } from '@/components/staff/profile-dropdown';
import { Link, usePathname } from '@/i18n/navigation';
import type { StageStatus } from '@/lib/domain/progression';

const COLLAPSED_STORAGE_KEY = 'learner-sidebar-collapsed';
const DESKTOP_QUERY = '(min-width: 768px)';

type OpenMenu = 'language' | 'profile' | null;
type LearnerNavKey = 'home' | 'study' | 'exam' | 'interview' | 'nameCard';

type NavItem = {
  key: LearnerNavKey;
  href: string;
  label: string;
  status?: StageStatus;
};

function isActive(pathname: string, key: LearnerNavKey) {
  if (key === 'home') return pathname === '/dashboard';
  if (key === 'exam')
    return (
      pathname === '/exam' ||
      pathname.startsWith('/exam/') ||
      pathname === '/quiz' ||
      pathname.startsWith('/quiz/')
    );
  const prefix = key === 'nameCard' ? '/name-card' : `/${key}`;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function NavIcon({ itemKey }: { itemKey: LearnerNavKey }) {
  const props = { className: 'size-5 shrink-0', weight: 'duotone' as const };
  if (itemKey === 'home') return <HouseIcon {...props} />;
  if (itemKey === 'study') return <BookOpenTextIcon {...props} />;
  if (itemKey === 'exam') return <ExamIcon {...props} />;
  if (itemKey === 'interview') return <BankIcon {...props} />;
  return <IdentificationCardIcon {...props} />;
}

function StatusIcon({ status }: { status?: StageStatus }) {
  if (status === 'done') {
    return <CheckIcon className="size-4 shrink-0 text-gold-300" weight="bold" aria-hidden="true" />;
  }
  if (status === 'locked' || status === 'pending') {
    return <LockIcon className="size-4 shrink-0 text-brand-100/75" aria-hidden="true" />;
  }
  return null;
}

export function LearnerShellClient({
  children,
  labels,
  profile,
  statuses,
  fallbackPageLabel,
  viewportLocked = false,
}: {
  children: ReactNode;
  labels: {
    appName: string;
    role: string;
    home: string;
    study: string;
    exam: string;
    interview: string;
    nameCard: string;
    training: string;
    language: string;
    collapseMenu: string;
    expandMenu: string;
    openMenu: string;
    closeMenu: string;
    profile: string;
    profileSettings: string;
    signOut: string;
    learnerAccount: string;
  };
  profile: {
    name: string;
    loginId: string;
    initials: string;
    locale: string;
  };
  statuses: Partial<Record<Exclude<LearnerNavKey, 'home'>, StageStatus>>;
  fallbackPageLabel: string;
  viewportLocked?: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const openDrawerRef = useRef<HTMLButtonElement>(null);
  const closeDrawerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY);
    const sync = () => {
      setDesktop(media.matches);
      if (media.matches) {
        setDrawerOpen(false);
        setOpenMenu(null);
      }
    };
    const initialSync = requestAnimationFrame(() => {
      setCollapsed(localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true');
      sync();
    });
    media.addEventListener('change', sync);
    return () => {
      cancelAnimationFrame(initialSync);
      media.removeEventListener('change', sync);
    };
  }, []);

  const closeDrawer = useCallback((restoreFocus = true) => {
    setDrawerOpen(false);
    setOpenMenu(null);
    if (restoreFocus) requestAnimationFrame(() => openDrawerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (desktop || !drawerOpen) return;
    const focusTimer = window.setTimeout(() => closeDrawerRef.current?.focus(), 220);
    const drawer = sidebarRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== 'Tab' || !drawer) return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null && !element.hasAttribute('inert'));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [closeDrawer, desktop, drawerOpen]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setDrawerOpen(false);
      setOpenMenu(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  const items: NavItem[] = [
    { key: 'home', href: '/dashboard', label: labels.home },
    { key: 'study', href: '/study', label: labels.study, status: statuses.study },
    { key: 'exam', href: '/exam', label: labels.exam, status: statuses.exam },
    {
      key: 'interview',
      href: '/interview',
      label: labels.interview,
      status: statuses.interview,
    },
    {
      key: 'nameCard',
      href: '/name-card',
      label: labels.nameCard,
      status: statuses.nameCard,
    },
  ];
  const active = items.find((item) => isActive(pathname, item.key));
  const compactSidebar = desktop && collapsed;
  const home = active?.key === 'home';

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    setOpenMenu(null);
    localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
  }

  function onSidebarKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (desktop || event.key !== 'Escape') return;
    event.preventDefault();
    closeDrawer();
  }

  return (
    <div
      className={`bg-dotgrid relative md:grid md:grid-rows-[56px_minmax(0,1fr)] md:transition-[grid-template-columns] md:duration-200 ${
        viewportLocked
          ? 'h-dvh overflow-hidden'
          : 'min-h-screen md:h-dvh md:min-h-0 md:overflow-hidden'
      } ${collapsed ? 'md:grid-cols-[64px_minmax(0,1fr)]' : 'md:grid-cols-[248px_minmax(0,1fr)]'}`}
    >
      {drawerOpen && (
        <button
          type="button"
          data-testid="learner-drawer-scrim"
          aria-label={labels.closeMenu}
          onClick={() => closeDrawer()}
          className="fixed inset-0 z-40 bg-brand-900/40 md:hidden"
        />
      )}

      <aside
        ref={sidebarRef}
        data-testid="learner-sidebar"
        data-collapsed={compactSidebar}
        aria-hidden={!desktop && !drawerOpen ? true : undefined}
        inert={!desktop && !drawerOpen}
        onKeyDown={onSidebarKeyDown}
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col gap-2 bg-brand-900 p-2 text-white shadow-[0_16px_40px_rgb(12_26_58_/_0.25)] transition-[transform,visibility] duration-200 md:static md:row-span-2 md:w-auto md:translate-x-0 md:shadow-none ${
          drawerOpen ? 'visible translate-x-0' : 'invisible -translate-x-[105%] md:visible'
        }`}
      >
        {compactSidebar ? (
          <>
            <button
              type="button"
              aria-label={labels.expandMenu}
              onClick={toggleCollapsed}
              className="grid size-11 shrink-0 place-items-center self-center rounded-control text-brand-100/75 transition-colors hover:bg-brand-700 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-100"
            >
              <SidebarSimpleIcon className="size-5" mirrored aria-hidden="true" />
            </button>
            <div className="mx-2 h-px shrink-0 bg-white/12" aria-hidden="true" />
          </>
        ) : (
          <div className="shrink-0 px-1 pt-2 pb-3 pl-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <Link
                  href="/dashboard"
                  className="block rounded-control font-display text-base leading-[1.45] font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-100"
                >
                  {labels.appName}
                </Link>
                <span className="mt-2 inline-flex rounded-full bg-white/14 px-2.5 py-px text-sm leading-[1.7] font-medium text-white">
                  {labels.role}
                </span>
              </div>
              <button
                ref={closeDrawerRef}
                type="button"
                aria-label={labels.closeMenu}
                onClick={() => closeDrawer()}
                className="grid size-11 shrink-0 place-items-center rounded-control text-brand-100/75 transition-colors hover:bg-brand-700 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-100 md:hidden"
              >
                <XIcon className="size-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={labels.collapseMenu}
                onClick={toggleCollapsed}
                className="hidden size-11 shrink-0 place-items-center rounded-control text-brand-100/75 transition-colors hover:bg-brand-700 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-100 md:grid"
              >
                <SidebarSimpleIcon className="size-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        <nav
          data-testid="learner-shell-nav"
          aria-label={labels.training}
          className="min-h-0 flex-1"
        >
          <ul className="grid gap-1">
            {items.map((item) => {
              const current = isActive(pathname, item.key);
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    aria-label={item.label}
                    title={compactSidebar ? item.label : undefined}
                    aria-current={current ? 'page' : undefined}
                    data-status={item.status}
                    className={`flex min-h-11 items-center rounded-control px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-100 ${
                      compactSidebar ? 'justify-center' : 'gap-3'
                    } ${
                      current
                        ? 'bg-brand-600 text-white'
                        : 'text-brand-100 hover:bg-brand-700 hover:text-white'
                    }`}
                  >
                    <span className={current ? 'text-white' : 'text-brand-100/75'}>
                      <NavIcon itemKey={item.key} />
                    </span>
                    {!compactSidebar && (
                      <>
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        <StatusIcon status={item.status} />
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="shrink-0 border-t border-white/12 pt-2">
          <ProfileDropdown
            {...profile}
            labels={{
              profile: labels.profile,
              profileSettings: labels.profileSettings,
              signOut: labels.signOut,
            }}
            accountLabel={labels.learnerAccount}
            profileHref={null}
            triggerTestId="learner-profile-trigger"
            variant="sidebar"
            collapsed={compactSidebar}
            open={openMenu === 'profile'}
            onOpenChange={(open) => setOpenMenu(open ? 'profile' : null)}
          />
        </div>
      </aside>

      <header
        data-testid="learner-shell-header"
        className="glass-strong sticky top-0 z-30 flex h-14 min-w-0 items-center gap-3 border-x-0 border-t-0 border-b border-ink-100 px-3 shadow-none md:static md:col-start-2 md:row-start-1 md:px-6"
      >
        <button
          ref={openDrawerRef}
          type="button"
          aria-label={labels.openMenu}
          aria-expanded={drawerOpen}
          onClick={() => {
            setOpenMenu(null);
            setDrawerOpen(true);
          }}
          className="-ml-1.5 grid size-11 shrink-0 place-items-center rounded-control text-brand-900 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 md:hidden"
        >
          <ListIcon className="size-[22px]" aria-hidden="true" />
        </button>

        <div className="min-w-0 flex-1 md:hidden">
          <span className="block truncate font-display text-[15px] leading-[1.4] font-semibold text-brand-900">
            {labels.appName}
          </span>
        </div>
        <div className="hidden min-w-0 flex-1 items-center gap-2 text-sm leading-[1.7] whitespace-nowrap md:flex">
          {home ? (
            <span className="truncate font-medium text-brand-900">{labels.home}</span>
          ) : (
            <>
              <span className="truncate text-ink-500">{labels.training}</span>
              <CaretRightIcon className="size-3.5 shrink-0 text-ink-500" aria-hidden="true" />
              <span className="truncate font-medium text-brand-900">
                {active?.label ?? fallbackPageLabel}
              </span>
            </>
          )}
        </div>

        <LanguageToggle
          label={labels.language}
          tone="staff"
          compact={!desktop}
          open={openMenu === 'language'}
          onOpenChange={(open) => setOpenMenu(open ? 'language' : null)}
        />
      </header>

      <main
        data-scroll-root
        className={`min-w-0 md:col-start-2 md:row-start-2 md:overflow-x-hidden ${
          viewportLocked ? 'flex min-h-0 flex-col overflow-hidden' : 'md:overflow-y-auto'
        }`}
      >
        {children}
      </main>
    </div>
  );
}
