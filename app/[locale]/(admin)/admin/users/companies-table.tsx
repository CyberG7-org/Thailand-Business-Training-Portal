import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { DbdRecordRow } from '@/lib/db/dbd-records';
import { companyStatus, type CompanyStatus } from '@/lib/domain/auto-confirm';
import { formatDate, type Locale } from '@/lib/domain/thai-date';

const TONE: Record<CompanyStatus, string> = {
  confirmed_auto: 'bg-ok-50 text-ok-600',
  confirmed: 'bg-ok-50 text-ok-600',
  reading: 'bg-brand-100 text-brand-700',
  unread: 'bg-warn-50 text-warn-700',
  attention: 'bg-warn-50 text-warn-700',
};

/**
 * The companies (DBD records) the caller can see, newest first, with where each stands (D80):
 * confirmed by a person or by the reader, still being read, or waiting for a person. RLS has
 * already narrowed the rows to the caller's team.
 */
export async function CompaniesTable({
  records,
  reading,
  teamCodeOf,
  locale,
}: {
  records: DbdRecordRow[];
  reading: Map<string, 'open' | 'failed'>;
  /** Only the admin sees more than one team, so only the admin gets the column (spec §11). */
  teamCodeOf: Map<string, string> | null;
  locale: string;
}) {
  const t = await getTranslations('admin.createDbd');
  const td = await getTranslations('admin.dbd');
  return (
    <section className="grid gap-3" data-testid="companies">
      <h2>{t('companies')}</h2>
      {records.length === 0 ? (
        <p className="text-sm text-ink-700">{t('noCompanies')}</p>
      ) : (
        <div className="staff-table-wrap">
          <table className="staff-table">
            <thead>
              <tr>
                <th>{td('fields.companyNameTh')}</th>
                {teamCodeOf && <th>{td('team')}</th>}
                <th>{td('fields.juristicId')}</th>
                <th>{td('fields.issuedOn')}</th>
                <th>{td('status')}</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const status = companyStatus(r, reading.get(r.id) ?? null);
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/admin/dbd-records/${r.id}`} className="staff-link">
                        {r.company_name_th ?? t('unnamed')}
                      </Link>
                    </td>
                    {teamCodeOf && (
                      <td data-testid={`record-team-${r.id}`}>
                        {r.team_id ? (teamCodeOf.get(r.team_id) ?? '—') : '—'}
                      </td>
                    )}
                    <td className="tabular-nums">{r.juristic_id ?? '—'}</td>
                    <td>{r.issued_on ? formatDate(r.issued_on, locale as Locale) : '—'}</td>
                    <td>
                      <span
                        data-testid={`company-status-${r.id}`}
                        data-status={status}
                        className={`staff-tag text-sm whitespace-nowrap ${TONE[status]}`}
                      >
                        {t(`statuses.${status}`)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
