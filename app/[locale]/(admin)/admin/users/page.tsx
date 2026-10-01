import { getTranslations } from 'next-intl/server';
import { requireStaff } from '@/lib/auth/session';
import { listDbdRecords, readingStatesOf } from '@/lib/db/dbd-records';
import { suggestSuffix } from '@/lib/db/provisioning';
import { createSupabaseServerClient } from '@/lib/db/server';
import { displayLoginId, learnerPrefix } from '@/lib/domain/login-id';
import { getDbdExtractor } from '@/lib/integrations/extraction';
import { CompaniesTable } from './companies-table';
import { CreateDbdForm } from './create-dbd-form';
import { NewUserForm, type CompanyOption, type TeamOption } from './new-user-form';

/**
 * "Create learner & DBD" (D80): the two things a manager creates, in one place — a learner at
 * the top, a company (its DBD pack and four details) below it, then the companies with where
 * each stands. The learners themselves are listed on their own page.
 */
export default async function CreateLearnerAndDbdPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
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
  // selectable, and the table below shows where each stands.
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

  return (
    <section className="grid gap-6">
      <h1 className="staff-title">{t('title')}</h1>
      <NewUserForm
        companies={companies}
        teams={teams}
        ownLoginId={teams ? null : staff.loginId}
        initialSuffix={initialSuffix}
      />
      <CreateDbdForm extractionAvailable={getDbdExtractor() !== null} />
      <CompaniesTable records={records} reading={reading} teamCodeOf={teamCodeOf} locale={locale} />
    </section>
  );
}
