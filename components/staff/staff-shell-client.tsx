'use client';

import { CaretRightIcon, ListIcon, SidebarSimpleIcon, XIcon } from '@phosphor-icons/react/dist/ssr';
import { useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { LanguageToggle } from '@/components/language-toggle';
import { Link, usePathname } from '@/i18n/navigation';
import { ProfileDropdown } from './profile-dropdown';
import { activeStaffNavItem, StaffNav, type StaffRole } from './staff-nav';

const COLLAPSED_STORAGE_KEY = 'staff-sidebar-collapsed';
const DESKTOP_QUERY = '(min-width: 768px)';

type OpenMenu = 'language' | 'profile' | null;

export function StaffShellClient({
  role,
  side,
  children,
  profile,
}: {
  role: StaffRole;
  side?: ReactNode;
  children: ReactNode;
  profile: {
    name: string;
    loginId: string;
    initials: string;
    locale: string;
  };
}) {
  const tApp = useTranslations('app');
  const tAdmin = useTranslations('admin');
  const tHeader = useTranslations('header');
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

  const compactSidebar = desktop && collapsed;
  const active = activeStaffNavItem(pathname, role);
  const roleLabel = tAdmin(`roles.${role}`);
  const breadcrumbGroup = active ? tAdmin(`navGroups.${active.group.key}`) : roleLabel;
  const breadcrumbPage = active ? tAdmin(`nav.${active.item.key}` as 'nav.users') : roleLabel;

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
      className={`relative min-h-screen bg-brand-50 md:grid md:h-dvh md:min-h-0 md:grid-rows-[56px_minmax(0,1fr)] md:overflow-hidden md:transition-[grid-template-columns] md:duration-200 ${
        collapsed ? 'md:grid-cols-[64px_minmax(0,1fr)]' : 'md:grid-cols-[248px_minmax(0,1fr)]'
      }`}
    >
      {drawerOpen && (
        <button
          type="button"
          data-testid="staff-drawer-scrim"
          aria-label={tHeader('closeMenu')}
          onClick={() => closeDrawer()}
          className="fixed inset-0 z-40 bg-brand-900/40 md:hidden"
        />
      )}

      <aside
        ref={sidebarRef}
        data-testid="staff-sidebar"
        data-collapsed={compactSidebar}
        aria-hidden={!desktop && !drawerOpen ? true : undefined}
        inert={!desktop && !drawerOpen}
        onKeyDown={onSidebarKeyDown}
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col gap-2 bg-brand-900 p-2 text-white shadow-[0_16px_40px_rgb(12_26_58_/_0.25)] transition-[transform,visibility] duration-200 md:static md:row-span-2 md:w-auto md:translate-x-0 md:shadow-none ${
          drawerOpen ? 'visible translate-x-0' : 'invisible -translate-x-[105%] md:visible'
        }`}
      >
        {compactSidebar ? (
          <button
            type="button"
            aria-label={tHeader('expandMenu')}
            onClick={toggleCollapsed}
            className="grid size-11 shrink-0 place-items-center self-center rounded-control text-brand-100/75 transition-colors hover:bg-brand-700 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-100"
          >
            <SidebarSimpleIcon className="size-5" mirrored aria-hidden="true" />
          </button>
        ) : (
          <div className="shrink-0 px-1 pt-2 pb-3 pl-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <Link
                  href="/admin"
                  className="block rounded-control font-display text-base leading-[1.45] font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-100"
                >
                  {tApp('name')}
                </Link>
                <span className="mt-2 inline-flex rounded-full bg-white/14 px-2.5 py-px text-sm leading-[1.7] font-medium text-white">
                  {roleLabel}
                </span>
              </div>
              <button
                ref={closeDrawerRef}
                type="button"
                aria-label={tHeader('closeMenu')}
                onClick={() => closeDrawer()}
                className="grid size-11 shrink-0 place-items-center rounded-control text-brand-100/75 transition-colors hover:bg-brand-700 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-100 md:hidden"
              >
                <XIcon className="size-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={tHeader('collapseMenu')}
                onClick={toggleCollapsed}
                className="hidden size-11 shrink-0 place-items-center rounded-control text-brand-100/75 transition-colors hover:bg-brand-700 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-100 md:grid"
              >
                <SidebarSimpleIcon className="size-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <StaffNav role={role} collapsed={compactSidebar} />
        </div>

        <div className="shrink-0 border-t border-white/12 pt-2">
          <ProfileDropdown
            {...profile}
            labels={{
              profile: tHeader('profile'),
              profileSettings: tHeader('profileSettings'),
              signOut: tHeader('signOut'),
            }}
            variant="sidebar"
            collapsed={compactSidebar}
            open={openMenu === 'profile'}
            onOpenChange={(open) => setOpenMenu(open ? 'profile' : null)}
          />
        </div>
      </aside>

      <header
        data-testid="shell-header"
        className="glass-strong sticky top-0 z-30 flex h-14 min-w-0 items-center gap-3 border-x-0 border-t-0 border-b border-ink-100 px-3 shadow-none md:static md:col-start-2 md:row-start-1 md:px-5"
      >
        <button
          ref={openDrawerRef}
          type="button"
          aria-label={tHeader('openMenu')}
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
            {tApp('name')}
          </span>
        </div>
        <div className="hidden min-w-0 flex-1 items-center gap-2 text-sm leading-[1.7] whitespace-nowrap md:flex">
          <span className="truncate text-ink-500">{breadcrumbGroup}</span>
          <CaretRightIcon className="size-3.5 shrink-0 text-ink-500" aria-hidden="true" />
          <span className="truncate font-medium text-brand-900">{breadcrumbPage}</span>
        </div>

        <LanguageToggle
          label={tHeader('language')}
          tone="staff"
          compact={!desktop}
          open={openMenu === 'language'}
          onOpenChange={(open) => setOpenMenu(open ? 'language' : null)}
        />
      </header>

      <main
        data-scroll-root
        className="staff min-w-0 px-4 py-4 md:col-start-2 md:row-start-2 md:overflow-y-auto md:p-6"
      >
        <div className="staff-content min-w-0">
          <div className="staff-side min-w-0">{side}</div>
          <div className="min-w-0">{children}</div>
        </div>
      </main>
    </div>
  );
}
