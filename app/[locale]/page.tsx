import { redirect } from 'next/navigation';
import { getCurrentUser, homePathFor } from '@/lib/auth/session';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await getCurrentUser();
  if (!user || user.status !== 'active') redirect(`/${locale}/login`);
  redirect(homePathFor(user.role, user.preferredLanguage));
}
