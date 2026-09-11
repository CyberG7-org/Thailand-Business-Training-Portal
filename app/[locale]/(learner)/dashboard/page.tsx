import { getTranslations } from 'next-intl/server';
import { requireUser } from '@/lib/auth/session';

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireUser(locale);
  const t = await getTranslations('dashboard');
  return (
    <section>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="mt-2">{t('welcome', { name: user.displayName ?? user.loginId })}</p>
    </section>
  );
}
