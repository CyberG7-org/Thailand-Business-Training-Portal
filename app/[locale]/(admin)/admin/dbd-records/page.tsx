import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/auth/session';

/**
 * The companies list moved to "Create learner & DBD" (D80), beside the form that creates one;
 * an old link or bookmark lands there. Each record's own page stays at `/admin/dbd-records/<id>`.
 */
export default async function DbdRecordsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireStaff(locale);
  redirect(`/${locale}/admin/users#create-dbd`);
}
