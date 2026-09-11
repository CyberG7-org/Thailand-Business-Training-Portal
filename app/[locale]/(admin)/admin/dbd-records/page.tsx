import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { listDbdRecords } from '@/lib/db/dbd-records';
import { createSupabaseServerClient } from '@/lib/db/server';

export default async function DbdRecordsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireAdmin(locale);
  const records = await listDbdRecords(await createSupabaseServerClient());
  const t = await getTranslations('admin.dbd');
  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Link
          href="/admin/dbd-records/new"
          className="rounded bg-gray-900 px-3 py-1 text-sm text-white"
        >
          {t('new')}
        </Link>
      </div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">{t('fields.companyNameTh')}</th>
            <th>{t('fields.juristicId')}</th>
            <th>{t('fields.issuedOn')}</th>
            <th>{t('status')}</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="py-2">
                <Link href={`/admin/dbd-records/${r.id}`} className="underline">
                  {r.company_name_th ?? '—'}
                </Link>
              </td>
              <td>{r.juristic_id ?? '—'}</td>
              <td>{r.issued_on ?? '—'}</td>
              <td>{r.extraction_status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
