import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { getDbdRecord } from '@/lib/db/dbd-records';
import { createSupabaseServerClient } from '@/lib/db/server';
import { DbdRecordForm } from '../dbd-record-form';
import { RecordTools } from './record-tools';

export default async function DbdRecordPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  await requireAdmin(locale);
  const record = await getDbdRecord(await createSupabaseServerClient(), id);
  if (!record) notFound();
  const t = await getTranslations('admin.dbd');
  return (
    <section className="grid gap-6">
      <Link href="/admin/dbd-records" className="text-sm underline">
        ← {t('title')}
      </Link>
      <h1 className="text-2xl font-semibold">{record.company_name_th ?? t('untitled')}</h1>
      <RecordTools
        id={record.id}
        status={record.extraction_status}
        documentPath={record.document_path}
      />
      <DbdRecordForm record={record} />
    </section>
  );
}
