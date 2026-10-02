import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireStaff } from '@/lib/auth/session';
import { getLearnerHeader, listExamAttempts } from '@/lib/db/learner-record';
import { createSupabaseServerClient } from '@/lib/db/server';
import { dateTimeLabel } from '@/lib/domain/learner-record';
import type { Locale } from '@/lib/domain/thai-date';
import { ResultTag } from '../../result-tag';
import { HistoryHeader } from '../history-header';

/**
 * A learner's MCQ history (D82; the exam until P17's MCQ ships): every attempt, newest first,
 * with when it was taken, its result and score, and the way to its full review.
 */
export default async function McqHistoryPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  await requireStaff(locale);
  const db = await createSupabaseServerClient();
  const learner = await getLearnerHeader(db, id);
  if (!learner) notFound();
  const [attempts, t] = await Promise.all([
    listExamAttempts(db, id),
    getTranslations('admin.learners'),
  ]);

  return (
    <section className="grid gap-6">
      <HistoryHeader
        back={{ href: '/admin/learners', label: t('backToRecord') }}
        title={t('mcq.title')}
        learner={learner}
      />
      {attempts.length === 0 ? (
        <p className="text-sm text-ink-700">{t('mcq.empty')}</p>
      ) : (
        <div className="staff-table-wrap">
          <table className="staff-table" data-testid="mcq-history">
            <thead>
              <tr>
                <th>{t('history.attempt')}</th>
                <th>{t('history.date')}</th>
                <th>{t('history.result')}</th>
                <th>{t('mcq.score')}</th>
                <th>
                  <span className="sr-only">{t('mcq.review')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => {
                const submitted = a.status === 'submitted';
                return (
                  <tr key={a.id} data-testid={`mcq-attempt-${a.attemptNo}`}>
                    <td className="tabular-nums">{a.attemptNo}</td>
                    <td className="whitespace-nowrap">
                      {dateTimeLabel(a.submittedAt ?? a.startedAt, locale as Locale)}
                    </td>
                    <td>
                      <ResultTag
                        result={
                          !submitted
                            ? 'in_progress'
                            : a.result === 'pass' || a.result === 'retest'
                              ? a.result
                              : 'fail'
                        }
                      />
                    </td>
                    <td className="tabular-nums">
                      {submitted ? `${a.score ?? 0} / ${a.maxScore ?? 0}` : '—'}
                    </td>
                    <td>
                      {submitted && (
                        <Link
                          href={`/admin/learners/${id}/mcq/${a.id}`}
                          className="staff-btn-ghost staff-btn-sm"
                        >
                          {t('mcq.review')}
                        </Link>
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
