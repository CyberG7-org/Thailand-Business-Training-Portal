import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await getCurrentUser();
  if (!user || user.status !== 'active') redirect(`/${locale}/login`);
  // Staff work in the admin area; learners study (spec §11).
  const home = user.role === 'learner' ? 'dashboard' : 'admin';
  redirect(`/${user.preferredLanguage}/${home}`);
}
