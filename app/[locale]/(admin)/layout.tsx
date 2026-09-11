import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { SignOutButton } from '@/components/sign-out-button';
import { requireAdmin } from '@/lib/auth/session';

export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await requireAdmin(locale);
  const t = await getTranslations('app');
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="font-semibold">{t('name')} · Admin</span>
        <div className="flex items-center gap-4 text-sm">
          <span>{user.displayName ?? user.loginId}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
