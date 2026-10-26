'use client';

import { CaretDownIcon, KeyIcon, SignOutIcon } from '@phosphor-icons/react/dist/ssr';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { signOutAction } from '@/app/[locale]/(auth)/login/actions';
import { Link } from '@/i18n/navigation';

export function ProfileDropdown({
  name,
  loginId,
  initials,
  locale,
  labels,
}: {
  name: string;
  loginId: string;
  initials: string;
  locale: string;
  labels: { profile: string; changePassword: string; signOut: string };
}) {
  const [open, setOpen] = useState(false);
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
  }, [open]);

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
      className="relative min-w-0"
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
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        data-testid="staff-profile-trigger"
        className="flex min-h-11 min-w-0 items-center gap-2 rounded-control border border-brand-100/80 bg-white/55 px-2.5 text-left text-ink-900 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-gold-100 text-xs font-semibold text-brand-900"
        >
          {initials}
        </span>
        <span className="hidden max-w-36 truncate text-sm font-medium sm:block">{name}</span>
        <CaretDownIcon className="size-4 shrink-0 text-ink-500" aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={labels.profile}
          onKeyDown={onMenuKeyDown}
          className="absolute top-full right-0 z-50 mt-2 w-60 rounded-card border border-ink-100 bg-white p-2 shadow-raised"
        >
          <div className="border-b border-ink-100 px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-brand-900">{name}</p>
            <p className="truncate text-xs text-ink-500">{loginId}</p>
          </div>
          <Link
            href="/admin/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="mt-1 flex min-h-11 items-center gap-2.5 rounded-control px-3 text-sm font-medium text-ink-900 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-600"
          >
            <KeyIcon className="size-4 text-brand-600" aria-hidden="true" />
            {labels.changePassword}
          </Link>
          <div className="my-1 border-t border-ink-100" />
          <form action={signOutAction}>
            <input type="hidden" name="locale" value={locale} />
            <button
              type="submit"
              role="menuitem"
              className="flex min-h-11 w-full items-center gap-2.5 rounded-control bg-bad-50 px-3 text-left text-sm font-medium text-bad-600 hover:bg-bad-50/70 focus-visible:outline-2 focus-visible:outline-bad-600"
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
