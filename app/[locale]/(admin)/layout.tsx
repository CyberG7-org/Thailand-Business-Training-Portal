import type { ReactNode } from 'react';
import { StaffShell } from '@/components/staff/staff-shell';
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
  return <StaffShell user={user}>{children}</StaffShell>;
}
