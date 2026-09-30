import { displayLoginId } from '@/lib/domain/login-id';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { requireStaff } from '@/lib/auth/session';
import {
  getActiveAssignmentForUser,
  getLatestEligibility,
  listConfirmedDbdRecords,
} from '@/lib/db/assignments';
import { createSupabaseServerClient } from '@/lib/db/server';
import { conceptCoverage } from '@/lib/domain/concepts/resolve';
import { buildFactSheet } from '@/lib/domain/facts/fact-sheet';
import { formatDate } from '@/lib/domain/thai-date';
import { AccountControls } from './account-controls';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import type { Director } from '@/lib/domain/dbd-record';
import { CoveragePanel } from '../../dbd-records/[id]/coverage-panel';
import { AssignmentPanel } from './assignment-panel';
import { RoleForm } from './role-form';

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
  // untied ones. The admin's client reads every team, so the list is narrowed here as well.
  const options = active
    ? []
    : (await listConfirmedDbdRecords(db)).filter(
        (o) => o.team_id == null || o.team_id === user.manager_id,
      );
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

  const people = active
    ? [
        ...((active.dbd_records.directors as unknown as Director[] | null) ?? []).map(
          (d) => d.name_th,
        ),
        ...(
          readStructuredData(active.dbd_records.structured_data).business?.shareholders ?? []
        ).map((sh) => sh.name),
      ].filter((name, i, all) => name && all.indexOf(name) === i)
    : [];

  // Assignment scope (spec §7.3): the ROLE concepts are checked for this learner.
  const coverage = active
    ? (() => {
        const structured = readStructuredData(active.dbd_records.structured_data);
        return conceptCoverage(
          buildFactSheet({
            record: active.dbd_records,
            structured,
            address: structured.address ?? null,
            role: {
              holder_name: active.holder_name,
              position: active.position,
              responsibilities: active.responsibilities,
              relationship_to_shareholders: active.relationship_to_shareholders,
            },
          }),
          'assignment',
        );
      })()
    : null;

  const t = await getTranslations('admin.users');
  return (
    <section className="grid gap-6">
      <Link href="/admin/users" className="staff-link text-sm">
        ← {t('title')}
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
      <AssignmentPanel userId={user.id} current={current} options={options} />
      {active && (
        <RoleForm
          userId={user.id}
          assignmentId={active.id}
          role={{
            holder_name: active.holder_name,
            position: active.position,
            responsibilities: active.responsibilities,
            relationship_to_shareholders: active.relationship_to_shareholders,
          }}
          people={people}
        />
      )}
      {coverage && <CoveragePanel coverage={coverage} testId="assignment-coverage" />}
      <AccountControls userId={user.id} status={user.status as 'active' | 'disabled'} />
    </section>
  );
}
