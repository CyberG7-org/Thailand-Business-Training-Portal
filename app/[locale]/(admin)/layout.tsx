import type { ReactNode } from 'react';
import { StaffShell } from '@/components/staff/staff-shell';
import { requireStaff } from '@/lib/auth/session';

export default async function AdminLayout({
  children,
  side,
  params,
}: {
  children: ReactNode;
  /** What a page puts under the sidebar (`@side`): a company record's status column. */
  side: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await requireStaff(locale);
  return (
    <StaffShell user={user} side={side}>
      {children}
    </StaffShell>
  );
}
