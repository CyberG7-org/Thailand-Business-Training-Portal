import { getTranslations } from 'next-intl/server';
import { requireManager } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/db/admin';
import { displayLoginId } from '@/lib/domain/login-id';
import { NewSubmanagerForm, SubmanagerControls } from './forms';

export default async function SubmanagersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const actor = await requireManager(locale);
  const t = await getTranslations('admin.submanagers');
  // Service client only after the exact-role guard, with an explicit parent filter.
  const { data: accounts, error } = await createSupabaseAdminClient()
    .from('profiles')
    .select('id, login_id, display_name, status')
    .eq('role', 'submanager')
    .eq('manager_id', actor.id)
    .is('archived_at', null)
    .order('login_id');
  if (error) throw error;
  return (
    <section className="grid gap-6">
      <h1 className="staff-title">{t('title')}</h1>
      <NewSubmanagerForm prefix={`${actor.loginId}s`} />
      <p className="text-sm text-ink-500">{t('archiveHint')}</p>
      {!accounts?.length ? (
        <p>{t('empty')}</p>
      ) : (
        <div className="staff-table-wrap">
          <table className="staff-table">
            <thead>
              <tr>
                <th>{t('loginId')}</th>
                <th>{t('displayName')}</th>
                <th>{t('status')}</th>
                <th>{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} data-testid={`submanager-${account.login_id}`}>
                  <td className="font-mono">{displayLoginId(account.login_id)}</td>
                  <td>{account.display_name ?? '—'}</td>
                  <td data-testid="account-status">{account.status}</td>
                  <td>
                    <SubmanagerControls id={account.id} status={account.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
