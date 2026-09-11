import type { ReactNode } from 'react';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { Noto_Sans_Thai } from 'next/font/google';
import { notFound } from 'next/navigation';
import { htmlLang, routing } from '@/i18n/routing';
import '../globals.css';

// Thai needs a proper web font for consistent rendering (spec §7); Latin glyphs are included,
// Chinese falls back to the system CJK font via globals.css.
const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  variable: '--font-thai',
  display: 'swap',
});

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return (
    <html lang={htmlLang(locale)} className={notoSansThai.variable}>
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
