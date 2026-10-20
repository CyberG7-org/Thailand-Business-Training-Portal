import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/auth/session';
import { pageTitle } from '@/i18n/page-title';

export const generateMetadata = pageTitle('admin.dbd', 'title');

/**
 * The companies list moved to "Create learner & DBD" (D80), its own tab beside the learner form;
 * an old link or bookmark lands there. Each record's own page stays at `/admin/dbd-records/<id>`.
 */
export default async function DbdRecordsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireStaff(locale);
  redirect(`/${locale}/admin/users?tab=companies`);
}
