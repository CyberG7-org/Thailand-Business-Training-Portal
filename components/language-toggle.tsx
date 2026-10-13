'use client';

import { useLocale } from 'next-intl';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import type { KeyboardEvent } from 'react';
import { setPreferredLanguageAction } from '@/app/[locale]/actions';
import { LANGUAGE_CHOICE_COOKIE } from '@/i18n/language-choice';
import { usePathname, useRouter } from '@/i18n/navigation';
import { LOCALES, type AppLocale } from '@/i18n/routing';

const LABELS: Record<AppLocale, string> = {
  th: 'ไทย',
  en: 'English',
  zh: '简体中文',
  ms: 'Bahasa Melayu',
};

/** Remembered for the sign-in action; expires quickly so it never outlives the visit. */
function rememberChoice(locale: AppLocale) {
  document.cookie = `${LANGUAGE_CHOICE_COOKIE}=${locale}; path=/; max-age=900; SameSite=Lax`;
}

/** Shared language menu for the login, learner and staff headers. */
export function LanguageToggle({
  label,
  className = '',
  tone = 'default',
}: {
  label: string;
  className?: string;
  tone?: 'default' | 'login';
  compact?: boolean;
}) {
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();

    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [open]);

  function choose(next: AppLocale) {
    setOpen(false);
    triggerRef.current?.focus();
    if (next === locale) return;
    rememberChoice(next);
    startTransition(async () => {
      await setPreferredLanguageAction(next);
      router.replace(pathname, { locale: next });
    });
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const options = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitemradio"]:not([aria-disabled="true"])',
      ) ?? [],
    );
    const current = options.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : event.key === 'ArrowDown'
            ? (current + 1) % options.length
            : (current - 1 + options.length) % options.length;
    options[next]?.focus();
  }

  return (
    <div
      ref={rootRef}
      data-testid="language-toggle"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      className={`relative shrink-0 ${className}`}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${label}: ${LABELS[locale]}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={pending}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        data-testid="language-menu-button"
        className={`flex min-h-10 w-[116px] items-center justify-between gap-2 rounded-[10px] border px-3 text-xs font-medium text-white shadow-[0_2px_8px_rgb(12_26_58/0.12)] transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-60 sm:w-[154px] sm:text-sm ${tone === 'login' ? 'border-white/30 bg-brand-900' : 'border-brand-900/15 bg-brand-900'}`}
      >
        <span lang={locale === 'zh' ? 'zh-Hans' : locale} className="truncate">
          {LABELS[locale]}
        </span>
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4 shrink-0">
          <path
            d="m3 6 5 5 5-5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="absolute top-full right-0 z-50 mt-1.5 w-[190px] rounded-[12px] border border-white/15 bg-ink-700 p-1.5 text-sm text-white shadow-raised"
        >
          {LOCALES.map((code) => (
            <button
              key={code}
              type="button"
              role="menuitemradio"
              aria-checked={code === locale}
              lang={code === 'zh' ? 'zh-Hans' : code}
              onClick={() => choose(code)}
              data-testid={`lang-${code}`}
              className={`flex min-h-10 w-full items-center rounded-[8px] px-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300 ${code === locale ? 'bg-white font-semibold text-ink-900' : 'hover:bg-white/15'}`}
            >
              {LABELS[code]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
