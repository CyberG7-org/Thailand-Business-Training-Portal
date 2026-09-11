import { getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/auth/session';
import { DbdRecordForm } from '../dbd-record-form';

export default async function NewDbdRecordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireAdmin(locale);
  const t = await getTranslations('admin.dbd');
  return (
    <section className="grid gap-4">
      <h1 className="text-2xl font-semibold">{t('new')}</h1>
      <DbdRecordForm record={null} />
    </section>
  );
}
