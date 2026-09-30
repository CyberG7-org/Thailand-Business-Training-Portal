import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireStaff } from '@/lib/auth/session';
import { getLearnerHeader, listInterviewSessions } from '@/lib/db/learner-record';
import { createSupabaseServerClient } from '@/lib/db/server';
import { chatbotSessionResult, dateTimeLabel } from '@/lib/domain/learner-record';
import type { Locale } from '@/lib/domain/thai-date';
import { ResultTag } from '../../result-tag';
import { HistoryHeader } from '../history-header';

/**
 * A learner's Chatbot history (D82; the readiness interview until P17's chatbot ships): every
 * session, newest first, with when it started, its result, and the way to the whole conversation.
 */
export default async function ChatbotHistoryPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  await requireStaff(locale);
  const db = await createSupabaseServerClient();
  const learner = await getLearnerHeader(db, id);
  if (!learner) notFound();
  const [sessions, t] = await Promise.all([
    listInterviewSessions(db, id),
    getTranslations('admin.learners'),
  ]);

  return (
    <section className="grid gap-6">
      <HistoryHeader
        back={{ href: '/admin/learners', label: t('backToRecord') }}
        title={t('chatbot.title')}
        learner={learner}
      />
      {sessions.length === 0 ? (
        <p className="text-sm text-ink-700">{t('chatbot.empty')}</p>
      ) : (
        <div className="staff-table-wrap">
          <table className="staff-table" data-testid="chatbot-history">
            <thead>
              <tr>
                <th>{t('history.attempt')}</th>
                <th>{t('history.date')}</th>
                <th>{t('history.result')}</th>
                <th>
                  <span className="sr-only">{t('chatbot.review')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} data-testid={`chatbot-attempt-${s.attemptNo}`}>
                  <td className="tabular-nums">{s.attemptNo}</td>
                  <td className="whitespace-nowrap">
                    {dateTimeLabel(s.startedAt, locale as Locale)}
                  </td>
                  <td>
                    <ResultTag result={chatbotSessionResult(s)} />
                  </td>
                  <td>
                    <Link
                      href={`/admin/learners/${id}/chatbot/${s.id}`}
                      className="staff-btn-ghost staff-btn-sm"
                    >
                      {t('chatbot.review')}
                    </Link>
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
