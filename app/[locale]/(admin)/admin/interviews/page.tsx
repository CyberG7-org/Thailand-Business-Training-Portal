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
      <h1 className="staff-title">{t('title')}</h1>
      <p className="staff-intro">{t('intro')}</p>
      {rows.length === 0 ? (
        <p data-testid="admin-interviews-empty" className="text-sm text-ink-700">
          {t('empty')}
        </p>
      ) : (
        <div className="staff-table-wrap">
          <table className="staff-table">
            <thead>
              <tr>
                <th>{t('learner')}</th>
                <th>{t('company')}</th>
                <th>{t('started')}</th>
                <th>{t('status')}</th>
                <th>{t('verdict')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const verdict = verdictOf(s.verdict);
                return (
                  <tr key={s.id} data-testid={'admin-interview-' + s.id} className="align-top">
                    <td>
                      {displayLoginId(s.profiles.login_id)}
                      {s.profiles.display_name ? ' · ' + s.profiles.display_name : ''}
                    </td>
                    <td>{s.dbd_records?.company_name_th ?? '—'}</td>
                    <td className="pr-3 whitespace-nowrap">
                      {dates.format(new Date(s.started_at))}
                    </td>
                    <td>{t(`statuses.${statusOf(s.status)}`)}</td>
                    <td data-verdict={verdict ?? undefined}>
                      {verdict ? t(`verdicts.${verdict}`) : t('noVerdict')}
                    </td>
                    <td>
                      <Link href={'/admin/interviews/' + s.id} className="staff-link">
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
