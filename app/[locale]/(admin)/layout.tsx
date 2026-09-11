import type { ReactNode } from 'react';
import { AppHeader } from '@/components/app-header';
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
  return (
    <div className="min-h-screen">
      <AppHeader user={user} admin />
      <main className="p-6">{children}</main>
    </div>
  );
}
