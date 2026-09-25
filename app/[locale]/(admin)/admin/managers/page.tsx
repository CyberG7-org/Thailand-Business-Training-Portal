import { getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/db/server';
import { displayLoginId } from '@/lib/domain/login-id';
import { NewManagerForm } from './new-manager-form';
import { ManagerRowControls } from './row-controls';

/** Admin only: managers are the one thing a manager may not create (spec §4). */
export default async function ManagersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireAdmin(locale);
  const db = await createSupabaseServerClient();
  const t = await getTranslations('admin.managers');

  const { data: managers } = await db
    .from('profiles')
    .select('id, login_id, display_name, status, created_at')
    .eq('role', 'manager')
    .order('login_id');
  // Counted from a plain select rather than `.in(ids)`: a filter listing every manager's uuid
  // grows the request URL until PostgREST refuses it ("URI too long").
  const { data: learners } = await db
    .from('profiles')
    .select('manager_id')
    .not('manager_id', 'is', null);
  const { data: records } = await db
    .from('dbd_records')
    .select('team_id')
    .not('team_id', 'is', null);
  const count = (rows: { [k: string]: string | null }[] | null, key: string, id: string) =>
    (rows ?? []).filter((r) => r[key] === id).length;

  return (
    <section className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <NewManagerForm />
      <p className="text-xs text-gray-600">{t('suspendHint')}</p>
      {(managers ?? []).length === 0 ? (
        <p className="text-sm">{t('empty')}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">{t('code')}</th>
              <th>{t('displayName')}</th>
              <th>{t('learners')}</th>
              <th>{t('records')}</th>
              <th>{t('status')}</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {(managers ?? []).map((m) => (
              <tr key={m.id} className="border-b" data-testid={`manager-${m.login_id}`}>
                <td className="py-2 font-mono">{displayLoginId(m.login_id)}</td>
                <td>{m.display_name ?? '—'}</td>
                <td data-testid="learner-count">{count(learners, 'manager_id', m.id)}</td>
                <td data-testid="record-count">{count(records, 'team_id', m.id)}</td>
                <td>{m.status}</td>
                <td>
                  <ManagerRowControls id={m.id} status={m.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
