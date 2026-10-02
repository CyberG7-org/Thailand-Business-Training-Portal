import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AnswerReview } from '@/components/answer-review';
import type { AppLocale } from '@/i18n/routing';
import { requireStaff } from '@/lib/auth/session';
import { getAttemptWithAnswers, localizeAttemptAnswers } from '@/lib/db/assessment';
import { getLearnerHeader } from '@/lib/db/learner-record';
import { createSupabaseServerClient } from '@/lib/db/server';
import { dateTimeLabel } from '@/lib/domain/learner-record';
import type { Locale } from '@/lib/domain/thai-date';
import { ResultTag } from '../../../result-tag';
import { HistoryHeader } from '../../history-header';

/**
 * One MCQ attempt in full (D82): every question, all its options, the correct one marked and the
 * learner's pick — the same review the learner sees (D51). Read under the caller's RLS; the
 * question texts come from the bank after that read, as on the learner's own result page.
 */
export default async function McqReviewPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; attemptId: string }>;
}) {
  const { locale, id, attemptId } = await params;
  await requireStaff(locale);
  const db = await createSupabaseServerClient();
  const [learner, attempt] = await Promise.all([
    getLearnerHeader(db, id),
    getAttemptWithAnswers(db, attemptId),
  ]);
  if (
    !learner ||
    !attempt ||
    attempt.user_id !== id ||
    attempt.kind !== 'exam' ||
    attempt.status !== 'submitted'
  ) {
    notFound();
  }
  const [texts, t, tq] = await Promise.all([
    localizeAttemptAnswers(attempt, locale as AppLocale),
    getTranslations('admin.learners'),
    getTranslations('quiz'),
  ]);

  return (
    <section className="grid gap-6">
      <HistoryHeader
        back={{ href: `/admin/learners/${id}/mcq`, label: t('mcq.backToHistory') }}
        title={t('mcq.reviewTitle', { no: attempt.attempt_no })}
        learner={learner}
      />
      <p className="flex flex-wrap items-center gap-3 text-sm text-ink-700">
        <ResultTag
          result={
            attempt.result === 'pass' || attempt.result === 'retest' ? attempt.result : 'fail'
          }
        />
        <span className="tabular-nums" data-testid="mcq-review-score">
          {t('mcq.score')}: {attempt.score ?? 0} / {attempt.max_score ?? 0}
        </span>
        {attempt.submitted_at && (
          <span>{dateTimeLabel(attempt.submitted_at, locale as Locale)}</span>
        )}
      </p>
      <AnswerReview
        answers={attempt.assessment_answers}
        texts={texts}
        heading={t('mcq.reviewHeading')}
        labels={{ correct: tq('correct'), incorrect: tq('reviewIncorrect') }}
      />
    </section>
  );
}
