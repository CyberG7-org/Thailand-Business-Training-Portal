import type { ReactNode } from 'react';
import { AppHeader } from '@/components/app-header';
import { requireUser } from '@/lib/auth/session';

export default async function LearnerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await requireUser(locale);
  return (
    <div className="min-h-screen">
      <AppHeader user={user} />
      <main className="p-6">{children}</main>
    </div>
  );
}
