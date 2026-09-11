'use client';

import { useLocale } from 'next-intl';
import { useTransition } from 'react';
import { setPreferredLanguageAction } from '@/app/[locale]/actions';
import { usePathname, useRouter } from '@/i18n/navigation';
import { LOCALES, type AppLocale } from '@/i18n/routing';

const LABELS: Record<AppLocale, string> = { th: 'ไทย', en: 'English', zh: '中文' };

export function LanguageSwitcher({ label }: { label: string }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <select
      aria-label={label}
      data-testid="language-switcher"
      value={locale}
      disabled={pending}
      onChange={(event) => {
        const next = event.target.value as AppLocale;
        startTransition(async () => {
          await setPreferredLanguageAction(next);
          router.replace(pathname, { locale: next });
        });
      }}
      className="rounded border px-2 py-1 text-sm"
    >
      {LOCALES.map((code) => (
        <option key={code} value={code}>
          {LABELS[code]}
        </option>
      ))}
    </select>
  );
}
