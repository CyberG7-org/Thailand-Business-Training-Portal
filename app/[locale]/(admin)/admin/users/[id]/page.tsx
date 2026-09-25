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
import { formatDate } from '@/lib/domain/thai-date';
import { AccountControls } from './account-controls';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import type { Director } from '@/lib/domain/dbd-record';
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
  const options = active ? [] : await listConfirmedDbdRecords(db);
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

  const t = await getTranslations('admin.users');
  return (
    <section className="grid gap-6">
      <Link href="/admin/users" className="text-sm underline">
        ← {t('title')}
      </Link>
      <h1 className="text-2xl font-semibold">{displayLoginId(user.login_id)}</h1>
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
      <AccountControls userId={user.id} status={user.status as 'active' | 'disabled'} />
    </section>
  );
}
