import { displayLoginId } from '@/lib/domain/login-id';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireStaff } from '@/lib/auth/session';
import { listAllCallSessions } from '@/lib/db/calls';
import { createSupabaseServerClient } from '@/lib/db/server';

export default async function AdminCallsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireStaff(locale);
  const rows = await listAllCallSessions(await createSupabaseServerClient());
  const t = await getTranslations('admin.calls');
  return (
    <section className="grid gap-4">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-600">{t('empty')}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">{t('learner')}</th>
              <th>{t('company')}</th>
              <th>{t('modality')}</th>
              <th>{t('status')}</th>
              <th>{t('started')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-b" data-testid={`admin-call-${s.id}`}>
                <td className="py-2">
                  {s.profiles.display_name ?? displayLoginId(s.profiles.login_id)}
                </td>
                <td>{s.dbd_records?.company_name_th ?? '—'}</td>
                <td>{s.modality}</td>
                <td data-testid="admin-call-status">{s.status}</td>
                <td>{new Date(s.started_at).toLocaleString(locale)}</td>
                <td>
                  <Link href={`/admin/calls/${s.id}`} className="underline">
                    {t('open')}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
