'use client';

import { CaretDownIcon, SignOutIcon, UserIcon } from '@phosphor-icons/react/dist/ssr';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { signOutAction } from '@/app/[locale]/(auth)/login/actions';
import { Link } from '@/i18n/navigation';

export function ProfileDropdown({
  name,
  loginId,
  initials,
  locale,
  labels,
  className = '',
  open: controlledOpen,
  onOpenChange,
}: {
  name: string;
  loginId: string;
  initials: string;
  locale: string;
  labels: { profile: string; profileSettings: string; signOut: string };
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      setInternalOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [open, setOpen]);

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowDown'
            ? (current + 1) % items.length
            : (current - 1 + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <div
      ref={rootRef}
      className={`relative min-w-0 ${className}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={labels.profile}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        data-testid="staff-profile-trigger"
        className="flex h-11 w-[140px] items-center gap-2 rounded-control border border-brand-900 bg-brand-900 py-0 pr-3 pl-[5px] text-left text-white transition-colors hover:border-brand-700 hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-100"
      >
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-[6px] bg-gold-100 text-sm font-semibold text-brand-900"
        >
          {initials}
        </span>
        <span className="flex-1 truncate text-sm font-medium">{labels.profile}</span>
        <CaretDownIcon className="size-3.5 shrink-0 text-brand-100" aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={labels.profile}
          onKeyDown={onMenuKeyDown}
          className="absolute top-full right-0 z-50 mt-1.5 w-[140px] rounded-[12px] border border-ink-100 bg-white p-1.5 shadow-menu"
        >
          <div className="border-b border-ink-100 px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-brand-900">{name}</p>
            <p className="truncate text-xs text-ink-500">{loginId}</p>
          </div>
          <Link
            href="/admin/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="mt-1 flex min-h-11 items-center gap-2 rounded-control px-2 text-xs font-medium text-ink-900 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-600"
          >
            <UserIcon className="size-4 text-brand-700" aria-hidden="true" />
            <span className="min-w-0 leading-tight">{labels.profileSettings}</span>
          </Link>
          <div className="my-1 border-t border-ink-100" />
          <form action={signOutAction}>
            <input type="hidden" name="locale" value={locale} />
            <button
              type="submit"
              role="menuitem"
              className="flex min-h-11 w-full items-center gap-2 rounded-control bg-bad-50 px-2 text-left text-xs font-medium text-bad-600 hover:bg-bad-50/70 focus-visible:outline-2 focus-visible:outline-bad-600"
            >
              <SignOutIcon className="size-4" aria-hidden="true" />
              {labels.signOut}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
