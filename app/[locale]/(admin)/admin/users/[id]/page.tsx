import { displayLoginId } from '@/lib/domain/login-id';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { requireStaff } from '@/lib/auth/session';
import {
  getActiveAssignmentForUser,
  getLatestEligibility,
  learnersOfRecords,
  listConfirmedDbdRecords,
} from '@/lib/db/assignments';
import { createSupabaseAdminClient } from '@/lib/db/admin';
import { currentAddress } from '@/lib/db/training-sheet';
import { pinnedFactsFor } from '@/lib/db/pinning';
import { getActiveVersion } from '@/lib/db/training-versions';
import { assignmentFacts } from '@/lib/domain/facts/snapshot';
import { createSupabaseServerClient } from '@/lib/db/server';
import { conceptCoverage, type Coverage } from '@/lib/domain/concepts/resolve';
import { buildFactSheet } from '@/lib/domain/facts/fact-sheet';
import { formatDate } from '@/lib/domain/thai-date';
import { AccountControls } from './account-controls';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import { dbdPeople, withStandardRole } from '@/lib/domain/standard-role';
import { CoveragePanel } from '../../dbd-records/[id]/coverage-panel';
import { AssignmentPanel } from './assignment-panel';
import { ContactForm } from './contact-form';
import { RoleForm } from './role-form';
import { VersionPanel } from './version-panel';

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  // RLS shows a manager only their own team, so another team's learner is simply not found.
  await requireStaff(locale);
  const db = await createSupabaseServerClient();
  const { data: user } = await db.from('profiles').select('*').eq('id', id).maybeSingle();
  if (!user) notFound();

  const active = await getActiveAssignmentForUser(db, user.id);
  const eligibility = active ? await getLatestEligibility(db, user.id, active.dbd_record_id) : null;
  // A learner may only study a company their own team may see: their team's, or the admin's
  // untied ones. The admin's client reads every team, so the list is narrowed here as well;
  // a company that already has its learner is not offered (D93).
  const visible = active
    ? []
    : (await listConfirmedDbdRecords(db)).filter(
        (o) => o.team_id == null || o.team_id === user.manager_id,
      );
  const taken = await learnersOfRecords(
    createSupabaseAdminClient(),
    visible.map((o) => o.id),
  );
  const options = visible.filter((o) => !taken.has(o.id));
  const current = active
    ? {
        assignmentId: active.id,
        companyNameTh: active.dbd_records.company_name_th,
        issuedOn: active.dbd_records.issued_on,
        availableFromLabel: eligibility
          ? formatDate(eligibility.available_from, locale as AppLocale)
          : null,
      }
    : null;

  // The learner's role (D95): a name from the DBD documents and three fixed answers.
  const { directors, people } = dbdPeople(active?.dbd_records ?? null);
  const role = active ? withStandardRole(active, { directors }) : null;

  // Assignment scope (spec §7.3) on the pinned version (D75): the company sheet as frozen, the
  // learner's role only once confirmed (plan decision 4). A record without a version yet is
  // read live, as before P17b.
  let coverage: Coverage | null = null;
  let pinned: Awaited<ReturnType<typeof pinnedFactsFor>> = null;
  let newest: { id: string; n: number } | null = null;
  if (active) {
    pinned = await pinnedFactsFor(createSupabaseAdminClient(), active);
    const activeVersion = await getActiveVersion(db, active.dbd_record_id);
    newest = activeVersion ? { id: activeVersion.id, n: activeVersion.version_no } : null;
    if (pinned) {
      coverage = conceptCoverage(
        assignmentFacts(pinned.snapshot, pinned.roleConfirmed ? pinned.role : null),
        'assignment',
      );
    } else {
      const structured = readStructuredData(active.dbd_records.structured_data);
      coverage = conceptCoverage(
        buildFactSheet({
          record: active.dbd_records,
          structured,
          address: await currentAddress(db, active.dbd_records, structured),
          role: {
            holder_name: active.holder_name,
            position: active.position,
            responsibilities: active.responsibilities,
            relationship_to_shareholders: active.relationship_to_shareholders,
          },
        }),
        'assignment',
      );
    }
  }

  const t = await getTranslations('admin.users');
  const tl = await getTranslations('admin.learners');
  return (
    <section className="grid gap-6">
      <Link href="/admin/learners" className="staff-link text-sm">
        ← {tl('title')}
      </Link>
      <h1 className="staff-title">{displayLoginId(user.login_id)}</h1>
      <dl className="grid max-w-md grid-cols-2 gap-1 text-sm">
        <dt>{t('displayName')}</dt>
        <dd>{user.display_name ?? '—'}</dd>
        <dt>{t('role')}</dt>
        <dd>{user.role}</dd>
        <dt>{t('status')}</dt>
        <dd data-testid="account-status">{user.status}</dd>
      </dl>
      {user.role === 'learner' && (
        <ContactForm
          userId={user.id}
          contact={{
            phone: user.phone ?? undefined,
            contactEmail: user.contact_email ?? undefined,
            website: user.website,
            facebookPage: user.facebook_page,
          }}
        />
      )}
      <AssignmentPanel userId={user.id} current={current} options={options} />
      {active && role && (
        <RoleForm
          userId={user.id}
          assignmentId={active.id}
          role={role}
          picked={Boolean(active.holder_name?.trim())}
          people={people}
        />
      )}
      {active && (
        <VersionPanel
          userId={user.id}
          assignmentId={active.id}
          pinned={pinned ? { n: pinned.version.version_no } : null}
          newest={newest}
          roleConfirmedAt={pinned?.roleConfirmedAt ?? active.role_confirmed_at}
        />
      )}
      {coverage && <CoveragePanel coverage={coverage} testId="assignment-coverage" />}
      <AccountControls userId={user.id} status={user.status as 'active' | 'disabled'} />
    </section>
  );
}
