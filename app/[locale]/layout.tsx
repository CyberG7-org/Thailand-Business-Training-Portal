import type { ReactNode } from 'react';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { IBM_Plex_Sans_Thai, Trirong } from 'next/font/google';
import { notFound } from 'next/navigation';
import { htmlLang, routing } from '@/i18n/routing';
import '../globals.css';

// Design handoff, Step 0: Trirong for headings and key numbers, IBM Plex Sans Thai for the body.
// Both carry Thai and Latin; Chinese falls back to the system CJK fonts via globals.css.
const trirong = Trirong({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-trirong',
  display: 'swap',
});
const plexThai = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-thai',
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
    <html lang={htmlLang(locale)} className={`${trirong.variable} ${plexThai.variable}`}>
      <body className="min-h-screen bg-white text-ink-900 antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
