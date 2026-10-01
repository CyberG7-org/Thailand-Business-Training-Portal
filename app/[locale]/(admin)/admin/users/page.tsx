import { getTranslations } from 'next-intl/server';
import { requireStaff } from '@/lib/auth/session';
import { listDbdRecords, readingStatesOf } from '@/lib/db/dbd-records';
import { suggestSuffix } from '@/lib/db/provisioning';
import { createSupabaseServerClient } from '@/lib/db/server';
import { companyStatus } from '@/lib/domain/auto-confirm';
import { displayLoginId, learnerPrefix } from '@/lib/domain/login-id';
import { formatDate, type Locale } from '@/lib/domain/thai-date';
import { getDbdExtractor } from '@/lib/integrations/extraction';
import type { CompanyRow } from './companies-panel';
import { CreateLearnerTabs } from './create-learner-tabs';
import type { CompanyOption, TeamOption } from './new-user-form';

/**
 * "Create learner & DBD" (D80): the two things a manager creates, in one place, as two tabs —
 * the learner form, and the companies (DBD records) with where each stands and a way to add
 * one. `?tab=companies` opens the second tab, and `&add=1` its upload form as well. The
 * learners themselves are listed on their own page.
 */
export default async function CreateLearnerAndDbdPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string; add?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const staff = await requireStaff(locale);
  const supabase = await createSupabaseServerClient();

  // Only the admin chooses a team; a manager creates inside their own (spec §7).
  const { data: managers } =
    staff.role === 'admin'
      ? await supabase
          .from('profiles')
          .select('id, login_id, display_name, status')
          .eq('role', 'manager')
          .order('login_id')
      : { data: null };
  // The code field comes prefilled with a free suffix (D69): straight away for a manager, whose
  // team is implied; for the admin once a team is chosen, as the prefix depends on it.
  const initialSuffix = managers
    ? null
    : await suggestSuffix('learner', learnerPrefix(staff.loginId));
  const teams: TeamOption[] | null = managers
    ? managers
        .filter((m) => m.status === 'active')
        .map((m) => ({
          id: m.id,
          code: displayLoginId(m.login_id),
          name: m.display_name,
          loginId: m.login_id,
        }))
    : null;
  const t = await getTranslations('admin.users');

  // RLS narrows the records to the caller's team; the picker offers them, confirmed ones
  // selectable, and the companies tab shows where each stands.
  const records = await listDbdRecords(supabase);
  const reading = await readingStatesOf(
    supabase,
    records.filter((r) => r.extraction_status !== 'confirmed').map((r) => r.id),
  );
  const companies: CompanyOption[] = [...records]
    .sort((a, b) => (a.company_name_th ?? '').localeCompare(b.company_name_th ?? '', 'th'))
    .map((r) => ({
      id: r.id,
      name: r.company_name_th ?? t('untitledCompany'),
      status: r.extraction_status,
      confirmed: r.extraction_status === 'confirmed',
      // The picker narrows to the chosen team: pairing a learner with another team's company
      // leaves them studying data their own manager cannot see.
      teamId: r.team_id,
    }));
  const teamCodeOf = managers
    ? new Map(managers.map((m) => [m.id, displayLoginId(m.login_id)]))
    : null;
  const rows: CompanyRow[] = records.map((r) => ({
    id: r.id,
    name: r.company_name_th,
    juristicId: r.juristic_id,
    issuedOn: r.issued_on ? formatDate(r.issued_on, locale as Locale) : null,
    status: companyStatus(r, reading.get(r.id) ?? null),
    teamCode: r.team_id ? (teamCodeOf?.get(r.team_id) ?? null) : null,
  }));

  return (
    <section className="grid gap-5">
      <h1 className="staff-title">{t('title')}</h1>
      <CreateLearnerTabs
        companies={companies}
        rows={rows}
        teams={teams}
        ownLoginId={teams ? null : staff.loginId}
        initialSuffix={initialSuffix}
        extractionAvailable={getDbdExtractor() !== null}
        initialTab={query.tab === 'companies' || query.add === '1' ? 'companies' : 'learner'}
        initialAddOpen={query.add === '1'}
      />
    </section>
  );
}
