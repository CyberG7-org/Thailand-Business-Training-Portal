import { getTranslations } from 'next-intl/server';
import { requireStaff } from '@/lib/auth/session';
import { MaterialForm } from '../material-form';

export default async function NewContentPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireStaff(locale);
  const t = await getTranslations('admin.content');
  return (
    <section className="grid gap-4">
      <h1 className="text-2xl font-semibold">{t('new')}</h1>
      <MaterialForm material={null} />
    </section>
  );
}
