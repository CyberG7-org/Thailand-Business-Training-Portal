import type { ReactNode } from 'react';
import { AppHeader } from '@/components/app-header';
import { requireStaff } from '@/lib/auth/session';

export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await requireStaff(locale);
  return (
    <div className="min-h-screen">
      <AppHeader user={user} admin />
      <main className="p-6">{children}</main>
    </div>
  );
}
