import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { loadProgressionFactsForUsers } from '@/lib/db/progression';
import { createSupabaseServerClient } from '@/lib/db/server';
import { deriveProgression } from '@/lib/domain/progression';
import { NewUserForm, type CompanyOption } from './new-user-form';

export default async function UsersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireAdmin(locale);
  const supabase = await createSupabaseServerClient();
  const { data: users } = await supabase
    .from('profiles')
    .select('id, login_id, role, display_name, status, created_at')
    .order('created_at', { ascending: false });
  const t = await getTranslations('admin.users');
  const tp = await getTranslations('progression');

  const learnerIds = (users ?? []).filter((u) => u.role === 'learner').map((u) => u.id);
  const facts = await loadProgressionFactsForUsers(supabase, learnerIds);

  // Every learner belongs to one company (their active assignment); the picker offers the
  // records, confirmed ones selectable.
  const { data: records } = await supabase
    .from('dbd_records')
    .select('id, company_name_th, extraction_status')
    .order('company_name_th');
  const companies: CompanyOption[] = (records ?? []).map((r) => ({
    id: r.id,
    name: r.company_name_th ?? t('untitledCompany'),
    status: r.extraction_status,
    confirmed: r.extraction_status === 'confirmed',
  }));
  const { data: assignments } = learnerIds.length
    ? await supabase
        .from('user_dbd_assignments')
        .select('user_id, dbd_records(company_name_th)')
        .eq('active', true)
        .in('user_id', learnerIds)
    : { data: [] };
  const companyOf = new Map(
    (assignments ?? []).map((a) => [
      a.user_id,
      (a.dbd_records as { company_name_th: string | null } | null)?.company_name_th ?? null,
    ]),
  );
  const rows = (users ?? []).map((u) => {
    const f = facts.get(u.id);
    return {
      ...u,
      company: companyOf.get(u.id) ?? null,
      progression: f ? deriveProgression(f) : null,
    };
  });

  return (
    <section className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <NewUserForm companies={companies} />
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">{t('loginId')}</th>
            <th>{t('displayName')}</th>
            <th>{t('company')}</th>
            <th>{t('role')}</th>
            <th>{t('status')}</th>
            <th>{t('progression')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="border-b">
              <td className="py-2">
                <Link href={`/admin/users/${u.id}`} className="underline">
                  {u.login_id}
                </Link>
              </td>
              <td>{u.display_name ?? '—'}</td>
              <td data-testid={`company-${u.login_id}`}>{u.company ?? '—'}</td>
              <td>{u.role}</td>
              <td>{u.status}</td>
              <td data-testid={`progression-${u.login_id}`}>
                {u.progression ? tp(u.progression) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
