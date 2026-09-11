import { getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/auth/session';
import { listNotifications } from '@/lib/db/notifications';
import { createSupabaseServerClient } from '@/lib/db/server';
import { requeueAction } from './actions';

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireAdmin(locale);
  const rows = await listNotifications(await createSupabaseServerClient());
  const t = await getTranslations('admin.notifications');
  return (
    <section className="grid gap-4">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">{t('event')}</th>
            <th>{t('channel')}</th>
            <th>{t('destination')}</th>
            <th>{t('status')}</th>
            <th>{t('attempts')}</th>
            <th>{t('lastError')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((n) => (
            <tr key={n.id} className="border-b" data-testid={`notification-${n.idempotency_key}`}>
              <td className="py-2">{n.event_type}</td>
              <td>{n.channel}</td>
              <td>{n.destination_ref ?? '—'}</td>
              <td data-testid="notification-status">{n.status}</td>
              <td>{n.attempts}</td>
              <td className="max-w-xs truncate text-red-700">{n.last_error ?? ''}</td>
              <td>
                {n.status !== 'sent' && (
                  <form action={requeueAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="id" value={n.id} />
                    <button type="submit" className="rounded border px-2 py-0.5 text-xs">
                      {t('requeue')}
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
