import { getFormatter, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireStaff } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/db/server';
import { listExceptionQueue } from '@/lib/db/validation';

/** The exception queue (spec §5.5): RLS scopes it to the viewer's companies. */
export default async function ExceptionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireStaff(locale);
  const db = await createSupabaseServerClient();
  const [rows, t, tk, format] = await Promise.all([
    listExceptionQueue(db),
    getTranslations('admin.exceptions'),
    getTranslations('admin.dbd.exceptions.kinds'),
    getFormatter(),
  ]);
  return (
    <section className="grid gap-5">
      <div>
        <h1 className="staff-title">{t('title')}</h1>
        <p className="staff-intro mt-1">{t('intro')}</p>
      </div>
      <p className="text-sm" data-testid="exceptions-count" data-count={rows.length}>
        {t('count', { count: rows.length })}
      </p>
      {rows.length === 0 ? (
        <p className="staff-notice-ok max-w-2xl" data-testid="exceptions-empty">
          {t('empty')}
        </p>
      ) : (
        <div className="staff-table-wrap">
          <table className="staff-table" data-testid="exceptions-table">
            <thead>
              <tr>
                <th>{t('columns.company')}</th>
                <th>{t('columns.kind')}</th>
                <th>{t('columns.field')}</th>
                <th>{t('columns.blocks')}</th>
                <th>{t('columns.since')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  data-testid={`queue-${r.dbd_record_id}`}
                  data-kind={r.kind}
                  data-blocks={r.blocks}
                >
                  <td>
                    <Link href={`/admin/dbd-records/${r.dbd_record_id}`} className="staff-link">
                      {r.dbd_records?.company_name_th ?? '—'}
                    </Link>
                  </td>
                  <td>{tk(r.kind as 'missing')}</td>
                  <td className="font-mono text-sm">{r.field}</td>
                  <td>{t(`blocks.${r.blocks as 'acceptance'}`)}</td>
                  <td className="whitespace-nowrap tabular-nums">
                    {format.dateTime(new Date(r.created_at), { dateStyle: 'medium' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
