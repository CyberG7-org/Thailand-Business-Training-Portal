import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { requireStaff } from '@/lib/auth/session';
import { listInterviewsForStaff } from '@/lib/db/interviews';
import { createSupabaseServerClient } from '@/lib/db/server';
import { displayLoginId } from '@/lib/domain/login-id';

const DATE_LOCALES: Record<AppLocale, string> = { th: 'th-TH', en: 'en-GB', zh: 'zh-CN' };

const statusOf = (s: string) =>
  s === 'in_progress' || s === 'completed' || s === 'abandoned' ? s : 'abandoned';
const verdictOf = (v: string | null) => (v === 'ready' || v === 'not_ready' ? v : null);

/** Every session RLS lets the caller see: a manager's team, or everything for the admin. */
export default async function InterviewsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireStaff(locale);
  const [db, t] = await Promise.all([
    createSupabaseServerClient(),
    getTranslations('admin.interviews'),
  ]);
  const rows = await listInterviewsForStaff(db);
  const dates = new Intl.DateTimeFormat(DATE_LOCALES[locale as AppLocale], {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  });
  return (
    <section className="grid gap-4">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="max-w-2xl text-sm text-gray-700">{t('intro')}</p>
      {rows.length === 0 ? (
        <p data-testid="admin-interviews-empty" className="text-sm text-gray-700">
          {t('empty')}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-3">{t('learner')}</th>
                <th className="pr-3">{t('company')}</th>
                <th className="pr-3">{t('started')}</th>
                <th className="pr-3">{t('status')}</th>
                <th className="pr-3">{t('verdict')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const verdict = verdictOf(s.verdict);
                return (
                  <tr
                    key={s.id}
                    data-testid={'admin-interview-' + s.id}
                    className="border-b align-top"
                  >
                    <td className="py-2 pr-3">
                      {displayLoginId(s.profiles.login_id)}
                      {s.profiles.display_name ? ' · ' + s.profiles.display_name : ''}
                    </td>
                    <td className="pr-3">{s.dbd_records?.company_name_th ?? '—'}</td>
                    <td className="pr-3 whitespace-nowrap">
                      {dates.format(new Date(s.started_at))}
                    </td>
                    <td className="pr-3">{t(`statuses.${statusOf(s.status)}`)}</td>
                    <td className="pr-3" data-verdict={verdict ?? undefined}>
                      {verdict ? t(`verdicts.${verdict}`) : t('noVerdict')}
                    </td>
                    <td>
                      <Link href={'/admin/interviews/' + s.id} className="underline">
                        {t('open')}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
