import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireStaff } from '@/lib/auth/session';
import { listDbdRecords } from '@/lib/db/dbd-records';
import { formatDate, type Locale } from '@/lib/domain/thai-date';
import { createSupabaseServerClient } from '@/lib/db/server';
import { displayLoginId } from '@/lib/domain/login-id';

export default async function DbdRecordsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const staff = await requireStaff(locale);
  const supabase = await createSupabaseServerClient();
  const records = await listDbdRecords(supabase);
  // Only the admin sees more than one team, so only the admin gets the column (spec §11).
  const { data: managers } =
    staff.role === 'admin'
      ? await supabase.from('profiles').select('id, login_id').eq('role', 'manager')
      : { data: null };
  const teamCodeOf = new Map((managers ?? []).map((m) => [m.id, displayLoginId(m.login_id)]));
  const showTeam = staff.role === 'admin';
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
            {showTeam && <th>{t('team')}</th>}
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
              {showTeam && (
                <td data-testid={`record-team-${r.id}`}>
                  {r.team_id ? (teamCodeOf.get(r.team_id) ?? '—') : '—'}
                </td>
              )}
              <td>{r.juristic_id ?? '—'}</td>
              <td>{r.issued_on ? formatDate(r.issued_on, locale as Locale) : '—'}</td>
              <td>{r.extraction_status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
