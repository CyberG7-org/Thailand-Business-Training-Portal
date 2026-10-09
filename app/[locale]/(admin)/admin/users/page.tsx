import { getTranslations } from 'next-intl/server';
import { requireStaff } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/db/admin';
import { learnersOfRecords } from '@/lib/db/assignments';
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
 * "Create learner & DBD" (D80): the two things a manager creates, in one place, as two tabs, in
 * the order they are made (D93) — the companies (DBD records) with where each stands, who studies
 * each and a way to add one, then the learner form. `?tab=learner` opens the second tab, and
 * `?add=1` the upload form. The learners themselves are listed on their own page.
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
  const [reading, learners] = await Promise.all([
    readingStatesOf(
      supabase,
      records.filter((r) => r.extraction_status !== 'confirmed').map((r) => r.id),
    ),
    // One learner per company (D93); read past RLS so another team's learner still counts.
    learnersOfRecords(
      createSupabaseAdminClient(),
      records.map((r) => r.id),
    ),
  ]);
  // The owner sees every learner's code; a manager only their own team's.
  const learnerOf = (recordId: string): CompanyRow['learner'] => {
    const l = learners.get(recordId);
    if (!l) return null;
    return staff.role === 'admin' || l.managerId === staff.id
      ? { id: l.userId, code: displayLoginId(l.loginId) }
      : 'other';
  };
  const companies: CompanyOption[] = [...records]
    .sort((a, b) => (a.company_name_th ?? '').localeCompare(b.company_name_th ?? '', 'th'))
    .map((r) => ({
      id: r.id,
      name: r.company_name_th ?? t('untitledCompany'),
      status: r.extraction_status,
      confirmed: r.extraction_status === 'confirmed',
      taken: learners.has(r.id),
      director: Array.isArray(r.directors)
        ? ((r.directors[0] as { name_th?: string } | undefined)?.name_th ?? null)
        : null,
      // The picker narrows to the chosen team: pairing a learner with another team's company
      // leaves them studying data their own manager cannot see.
      teamId: r.team_id,
    }));
  const teamCodeOf = managers
    ? new Map(managers.map((m) => [m.id, displayLoginId(m.login_id)]))
    : null;
  const rows: CompanyRow[] = records.map((r) => ({
    id: r.id,
    name: r.company_name_en,
    director: Array.isArray(r.directors)
      ? ((r.directors[0] as { name_th?: string } | undefined)?.name_th ?? null)
      : null,
    issuedOn: r.issued_on ? formatDate(r.issued_on, locale as Locale) : null,
    status: companyStatus(r, reading.get(r.id) ?? null),
    teamCode: r.team_id ? (teamCodeOf?.get(r.team_id) ?? null) : null,
    learner: learnerOf(r.id),
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
        initialTab={query.tab === 'learner' && query.add !== '1' ? 'learner' : 'companies'}
        initialAddOpen={query.add === '1'}
      />
    </section>
  );
}
