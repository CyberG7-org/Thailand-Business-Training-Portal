'use client';

import { useLocale } from 'next-intl';
import { useTransition } from 'react';
import { setPreferredLanguageAction } from '@/app/[locale]/actions';
import { LANGUAGE_CHOICE_COOKIE } from '@/i18n/language-choice';
import { usePathname, useRouter } from '@/i18n/navigation';
import { LOCALES, type AppLocale } from '@/i18n/routing';

const LABELS: Record<AppLocale, string> = { th: 'ไทย', en: 'English', zh: '中文' };

/** Remembered for the sign-in action; expires quickly so it never outlives the visit. */
function rememberChoice(locale: AppLocale) {
  document.cookie = `${LANGUAGE_CHOICE_COOKIE}=${locale}; path=/; max-age=900; SameSite=Lax`;
}

/**
 * Segmented TH / EN / ZH control. Signed-in users get their preference persisted; anonymous
 * visitors (login page) get a short-lived cookie that the sign-in action honours.
 */
export function LanguageToggle({ label, className = '' }: { label: string; className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function choose(next: AppLocale) {
    if (next === locale) return;
    rememberChoice(next);
    startTransition(async () => {
      await setPreferredLanguageAction(next);
      router.replace(pathname, { locale: next });
    });
  }

  return (
    <div
      role="group"
      aria-label={label}
      data-testid="language-toggle"
      className={`inline-flex rounded-[10px] bg-brand-100/90 p-[3px] text-sm ${className}`}
    >
      {LOCALES.map((code) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            lang={code === 'zh' ? 'zh-Hans' : code}
            aria-pressed={active}
            disabled={pending}
            onClick={() => choose(code)}
            data-testid={`lang-${code}`}
            className={`grid min-h-11 place-items-center rounded-control px-3.5 transition-colors disabled:opacity-60 ${
              active ? 'bg-brand-700 font-semibold text-white' : 'text-brand-700 hover:bg-white/60'
            }`}
          >
            {LABELS[code]}
          </button>
        );
      })}
    </div>
  );
}
