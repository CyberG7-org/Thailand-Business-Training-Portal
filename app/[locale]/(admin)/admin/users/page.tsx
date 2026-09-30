import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { requireStaff } from '@/lib/auth/session';
import { loadProgressionFactsForUsers } from '@/lib/db/progression';
import { suggestLoginSuffix } from '@/lib/db/provisioning';
import { createSupabaseServerClient } from '@/lib/db/server';
import { bangkokDateOf, bangkokTimeLabel } from '@/lib/domain/appointments/slots';
import { deriveProgression } from '@/lib/domain/progression';
import { formatDate } from '@/lib/domain/thai-date';
import { displayLoginId, learnerPrefix } from '@/lib/domain/login-id';
import { NewUserForm, type CompanyOption, type TeamOption } from './new-user-form';

export default async function UsersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const staff = await requireStaff(locale);
  const supabase = await createSupabaseServerClient();
  // Learners only: managers have their own screen, and a manager would otherwise find their own
  // row sitting in the list of people they manage. RLS narrows it to the caller's team.
  const { data: users } = await supabase
    .from('profiles')
    .select('id, login_id, role, display_name, status, created_at, manager_id')
    .neq('role', 'manager')
    .order('created_at', { ascending: false });

  // Only the admin chooses a team; a manager creates inside their own (spec §7).
  const { data: managers } =
    staff.role === 'admin'
      ? await supabase
          .from('profiles')
          .select('id, login_id, display_name')
          .eq('role', 'manager')
          .eq('status', 'active')
          .order('login_id')
      : { data: null };
  // The code field comes prefilled with a free suffix (D69): straight away for a manager, whose
  // team is implied; for the admin once a team is chosen, as the prefix depends on it.
  const initialSuffix = managers ? null : await suggestLoginSuffix(learnerPrefix(staff.loginId));
  const teams: TeamOption[] | null = managers
    ? managers.map((m) => ({
        id: m.id,
        code: displayLoginId(m.login_id),
        name: m.display_name,
        loginId: m.login_id,
      }))
    : null;
  const teamCodeOf = new Map((managers ?? []).map((m) => [m.id, displayLoginId(m.login_id)]));
  const t = await getTranslations('admin.users');
  const tp = await getTranslations('progression');

  const learnerIds = (users ?? []).filter((u) => u.role === 'learner').map((u) => u.id);
  const facts = await loadProgressionFactsForUsers(supabase, learnerIds);

  // Every learner belongs to one company (their active assignment); the picker offers the
  // records, confirmed ones selectable.
  const { data: records } = await supabase
    .from('dbd_records')
    .select('id, company_name_th, extraction_status, team_id')
    .order('company_name_th');
  const companies: CompanyOption[] = (records ?? []).map((r) => ({
    id: r.id,
    name: r.company_name_th ?? t('untitledCompany'),
    status: r.extraction_status,
    confirmed: r.extraction_status === 'confirmed',
    // The picker narrows to the chosen team: pairing a learner with another team's company
    // leaves them studying data their own manager cannot see.
    teamId: r.team_id,
  }));
  const { data: assignments } = learnerIds.length
    ? await supabase
        .from('user_dbd_assignments')
        .select('user_id, dbd_records(company_name_th)')
        .eq('active', true)
        .in('user_id', learnerIds)
    : { data: [] };
  // Each learner's next booking (spec §5.3), read under the caller's RLS.
  const { data: upcoming } = learnerIds.length
    ? await supabase
        .from('appointments')
        .select('user_id, starts_at')
        .in('user_id', learnerIds)
        .eq('status', 'booked')
        .gte('starts_at', new Date().toISOString())
        .order('starts_at')
    : { data: [] };
  const bookingOf = new Map<string, string>();
  for (const b of upcoming ?? [])
    if (!bookingOf.has(b.user_id)) bookingOf.set(b.user_id, b.starts_at);
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
      booking: bookingOf.get(u.id) ?? null,
    };
  });

  return (
    <section className="grid gap-6">
      <h1 className="staff-title">{t('title')}</h1>
      <NewUserForm
        companies={companies}
        teams={teams}
        ownLoginId={teams ? null : staff.loginId}
        initialSuffix={initialSuffix}
      />
      <div className="staff-table-wrap">
        <table className="staff-table">
          <thead>
            <tr>
              <th>{t('loginId')}</th>
              <th>{t('displayName')}</th>
              <th>{t('company')}</th>
              <th>{t('team')}</th>
              <th>{t('role')}</th>
              <th>{t('status')}</th>
              <th>{t('progression')}</th>
              <th>{t('appointment')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>
                  <Link href={`/admin/users/${u.id}`} className="staff-link">
                    {displayLoginId(u.login_id)}
                  </Link>
                </td>
                <td>{u.display_name ?? '—'}</td>
                <td data-testid={`company-${u.login_id}`}>{u.company ?? '—'}</td>
                <td data-testid={`team-${u.login_id}`}>
                  {u.manager_id ? (teamCodeOf.get(u.manager_id) ?? '—') : '—'}
                </td>
                <td>{u.role}</td>
                <td>{u.status}</td>
                <td data-testid={`progression-${u.login_id}`}>
                  {u.progression ? tp(u.progression) : '—'}
                </td>
                <td data-testid={`appointment-${u.login_id}`} className="whitespace-nowrap">
                  {u.booking
                    ? `${formatDate(bangkokDateOf(u.booking), locale as AppLocale)} ${bangkokTimeLabel(u.booking)}`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
