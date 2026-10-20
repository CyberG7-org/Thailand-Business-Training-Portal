import { getTranslations } from 'next-intl/server';
import { requireStaff } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/db/admin';
import { displayLoginId } from '@/lib/domain/login-id';
import { NewSubmanagerForm, SubmanagerControls } from './forms';

export default async function SubmanagersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const actor = await requireStaff(locale);
  // The Owner sees every team's Submanagers read-only; only the parent Manager manages them.
  const owner = actor.role === 'admin';
  const t = await getTranslations('admin.submanagers');
  const db = createSupabaseAdminClient();
  // Service client only after the role guard, with an explicit parent filter for a Manager.
  let query = db
    .from('profiles')
    .select('id, login_id, display_name, status, manager_id')
    .eq('role', 'submanager')
    .is('archived_at', null)
    .order('login_id');
  if (!owner) query = query.eq('manager_id', actor.id);
  const { data: accounts, error } = await query;
  if (error) throw error;
  const managerIds = [...new Set((accounts ?? []).map((a) => a.manager_id).filter(Boolean))];
  const managerCodes = new Map<string, string>();
  if (owner && managerIds.length) {
    const { data: managers, error: managersError } = await db
      .from('profiles')
      .select('id, login_id')
      .in('id', managerIds as string[]);
    if (managersError) throw managersError;
    for (const m of managers) managerCodes.set(m.id, m.login_id);
  }
  return (
    <section className="grid gap-6">
      <h1 className="staff-title">{t('title')}</h1>
      {owner ? (
        <p className="staff-intro">{t('ownerHint')}</p>
      ) : (
        <>
          <NewSubmanagerForm prefix={`${actor.loginId}s`} />
          <p className="text-sm text-ink-500">{t('archiveHint')}</p>
        </>
      )}
      {!accounts?.length ? (
        <p>{t('empty')}</p>
      ) : (
        <div className="staff-table-wrap">
          <table className="staff-table">
            <thead>
              <tr>
                <th>{t('loginId')}</th>
                <th>{t('displayName')}</th>
                {owner && <th>{t('manager')}</th>}
                <th>{t('status')}</th>
                {!owner && <th>{t('actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} data-testid={`submanager-${account.login_id}`}>
                  <td className="font-mono">{displayLoginId(account.login_id)}</td>
                  <td>{account.display_name ?? '—'}</td>
                  {owner && (
                    <td className="font-mono" data-testid="submanager-manager">
                      {displayLoginId(managerCodes.get(account.manager_id ?? ''))}
                    </td>
                  )}
                  <td data-testid="account-status">{account.status}</td>
                  {!owner && (
                    <td>
                      <SubmanagerControls id={account.id} status={account.status} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
