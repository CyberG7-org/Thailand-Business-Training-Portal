import type { CSSProperties } from 'react';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AnswerReview } from '@/components/answer-review';
import { CheckIcon } from '@/components/icons';
import { LearnerShell } from '@/components/shell/learner-shell';
import { cachedStageStatuses } from '@/components/shell/stage-status';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { requireUser } from '@/lib/auth/session';
import { getAttemptWithAnswers, localizeAttemptAnswers } from '@/lib/db/assessment';
import { createSupabaseServerClient } from '@/lib/db/server';

const rise = (delay: string) => ({ '--rise-delay': delay }) as CSSProperties;

/**
 * Score, pass/fail and the full review — every option with the correct one marked (D51). The
 * handoff (05) gives a pass the gold band and the medallion, and either outcome its next step.
 */
export default async function ExamResultPage({
  params,
}: {
  params: Promise<{ locale: string; attemptId: string }>;
}) {
  const { locale, attemptId } = await params;
  const user = await requireUser(locale);
  const attempt = await getAttemptWithAnswers(await createSupabaseServerClient(), attemptId);
  if (!attempt || attempt.kind !== 'exam') notFound();
  if (attempt.status === 'in_progress') redirect('/' + locale + '/exam/' + attemptId);
  const [t, tq, td, ts, texts, stages] = await Promise.all([
    getTranslations('exam'),
    getTranslations('quiz'),
    getTranslations('dashboard'),
    getTranslations('stages'),
    localizeAttemptAnswers(attempt, locale as AppLocale),
    cachedStageStatuses(user.id),
  ]);
  const passed = attempt.result === 'pass';
  const interviewOpen = ['available', 'in_progress', 'done'].includes(stages.interview.status);

  // What comes next: the readiness interview when it is open, the name card until then, or
  // another try.
  const line = passed ? t('passedNext') : t('notPassedNext');
  const primary = passed
    ? interviewOpen
      ? { href: '/interview', label: t('toInterview') }
      : { href: '/name-card', label: td('cta.open', { step: ts('titles.nameCard') }) }
    : { href: '/exam', label: t('retake') };
  const score = (attempt.score ?? 0) + ' / ' + (attempt.max_score ?? 0);

  return (
    <LearnerShell
      step="exam"
      tone={passed ? 'gold' : 'blue'}
      hero={
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-center lg:gap-12">
          <div>
            <h1
              className="rise font-display text-[26px] leading-[1.35] font-medium text-white md:text-[32px]"
              style={rise('0ms')}
            >
              {t('resultTitle')}
            </h1>
            <p
              className="rise mt-2 max-w-[560px] text-base leading-[1.75] text-brand-100"
              style={rise('80ms')}
            >
              {line}
            </p>
            <div className="rise mt-6 flex flex-wrap gap-3" style={rise('160ms')}>
              <Link
                data-testid="exam-next"
                href={primary.href}
                className="inline-flex min-h-12 items-center gap-2.5 rounded-control bg-white px-6 text-base font-semibold text-brand-900 shadow-[0_6px_20px_rgb(0_0_0/0.2)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgb(0_0_0/0.28)] focus-visible:outline-gold-100"
              >
                {primary.label}
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex min-h-12 items-center rounded-control border border-white/35 px-5 text-base font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-gold-100"
              >
                {td('title')}
              </Link>
            </div>
          </div>
          <div
            data-testid="exam-result"
            data-result={attempt.result}
            className={
              'glass-strong rise grid grid-cols-[88px_minmax(0,1fr)] items-center gap-5 rounded-sheet p-5 text-ink-900 md:grid-cols-[112px_minmax(0,1fr)] ' +
              (passed
                ? 'border-gold-100/90 shadow-[0_12px_32px_rgb(12_26_58/0.25),inset_0_0_0_1px_rgb(200_150_62/0.35)]'
                : 'shadow-[0_12px_32px_rgb(12_26_58/0.25)]')
            }
            style={rise('120ms')}
          >
            {passed ? (
              <div
                data-testid="medallion"
                className="medallion pop grid size-[88px] place-items-center rounded-full text-brand-900 md:size-28"
              >
                <CheckIcon size={44} />
              </div>
            ) : (
              <div
                aria-hidden="true"
                className="grid size-[88px] place-items-center rounded-full bg-warn-50 text-warn-700 md:size-28"
              >
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v6M12 16.5v.5" />
                </svg>
              </div>
            )}
            <div>
              <span
                className={
                  'inline-block rounded-full px-3 py-px text-sm leading-[1.7] font-semibold ' +
                  (passed ? 'bg-gold-100 text-gold-700' : 'bg-warn-50 text-warn-700')
                }
              >
                {passed ? t('pass') : t('fail')}
              </span>
              <div
                data-testid="exam-score"
                className="mt-1.5 font-display text-[32px] leading-[1.3] font-semibold text-brand-900 tabular-nums"
              >
                {score}
              </div>
              <div className="text-sm leading-[1.7] text-ink-700 tabular-nums">
                {t('scoreLine', {
                  score: attempt.score ?? 0,
                  max: attempt.max_score ?? 0,
                  passingMark: Number(attempt.passing_mark_snapshot ?? 0),
                })}
              </div>
            </div>
          </div>
        </div>
      }
    >
      <AnswerReview
        answers={attempt.assessment_answers}
        texts={texts}
        heading={t('reviewHeading')}
        note={t('resultNote')}
        labels={{ correct: tq('correct'), incorrect: tq('reviewIncorrect') }}
      />
    </LearnerShell>
  );
}
