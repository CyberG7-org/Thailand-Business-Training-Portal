import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireStaff } from '@/lib/auth/session';
import { loadLearnerRecords } from '@/lib/db/learner-record';
import { createSupabaseServerClient } from '@/lib/db/server';
import { bangkokDateOf } from '@/lib/domain/appointments/slots';
import { displayLoginId } from '@/lib/domain/login-id';
import { formatDate, type Locale } from '@/lib/domain/thai-date';
import { ResultTag } from './result-tag';

/**
 * Learner Record (D82): one row per learner the caller can see — who, their company and its DBD
 * issue date, the MCQ and Chatbot results with their histories a click away, and the next
 * appointment. RLS narrows it to the caller's team; the admin sees every team.
 */
export default async function LearnerRecordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const staff = await requireStaff(locale);
  const [rows, t] = await Promise.all([
    loadLearnerRecords(await createSupabaseServerClient()),
    getTranslations('admin.learners'),
  ]);

  return (
    <section className="grid gap-6">
      <div>
        <h1 className="staff-title">{t('title')}</h1>
        <p className="staff-intro mt-1">
          {t('intro')}{' '}
          <Link href="/admin/users" className="staff-link">
            {t('toCreate')}
          </Link>
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-700">{t('empty')}</p>
      ) : (
        <div className="staff-table-wrap">
          <table className="staff-table" data-testid="learner-record">
            <thead>
              <tr>
                <th>{t('columns.loginId')}</th>
                <th>{t('columns.company')}</th>
                <th>{t('columns.issuedOn')}</th>
                <th>{t('columns.mcq')}</th>
                <th>{t('columns.chatbot')}</th>
                <th>{t('columns.appointment')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ready = r.mcq === 'pass' && r.chatbot === 'pass';
                const date = r.appointmentAt
                  ? formatDate(bangkokDateOf(r.appointmentAt), locale as Locale)
                  : null;
                return (
                  <tr key={r.id} data-testid={`learner-${r.loginId}`}>
                    <td className="whitespace-nowrap">
                      <Link href={`/admin/users/${r.id}`} className="staff-link">
                        {displayLoginId(r.loginId)}
                      </Link>
                    </td>
                    <td data-testid={`company-${r.loginId}`}>
                      {r.company ? (
                        <Link href={`/admin/dbd-records/${r.company.id}`} className="staff-link">
                          {r.company.nameTh ?? '—'}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td data-testid={`issued-${r.loginId}`} className="whitespace-nowrap">
                      {r.company?.issuedOn ? formatDate(r.company.issuedOn, locale as Locale) : '—'}
                    </td>
                    <td data-testid={`mcq-${r.loginId}`}>
                      <ResultTag
                        result={r.mcq}
                        href={r.mcqAttempts > 0 ? `/admin/learners/${r.id}/mcq` : null}
                      />
                    </td>
                    <td data-testid={`chatbot-${r.loginId}`}>
                      <ResultTag
                        result={r.chatbot}
                        href={r.chatbotSessions > 0 ? `/admin/learners/${r.id}/chatbot` : null}
                      />
                    </td>
                    <td data-testid={`appointment-${r.loginId}`} className="whitespace-nowrap">
                      {staff.role === 'manager' && ready ? (
                        <Link
                          href={{ pathname: '/admin/appointments', query: { learner: r.id } }}
                          className="staff-link"
                        >
                          {date ? `${date} · ${t('appointment.change')}` : t('appointment.book')}
                        </Link>
                      ) : date ? (
                        date
                      ) : staff.role === 'manager' ? (
                        r.mcq !== 'pass' ? (
                          t('appointment.needsQuiz')
                        ) : (
                          t('appointment.needsInterview')
                        )
                      ) : (
                        '—'
                      )}
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
