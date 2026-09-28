import type { CSSProperties } from 'react';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AnswerReview } from '@/components/answer-review';
import { LearnerShell } from '@/components/shell/learner-shell';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { requireUser } from '@/lib/auth/session';
import { getAttemptWithAnswers, localizeAttemptAnswers } from '@/lib/db/assessment';
import { createSupabaseServerClient } from '@/lib/db/server';

const rise = (delay: string) => ({ '--rise-delay': delay }) as CSSProperties;

export default async function QuizReviewPage({
  params,
}: {
  params: Promise<{ locale: string; attemptId: string }>;
}) {
  const { locale, attemptId } = await params;
  await requireUser(locale);
  const attempt = await getAttemptWithAnswers(await createSupabaseServerClient(), attemptId);
  if (!attempt || attempt.kind !== 'quiz') notFound();
  if (attempt.status === 'in_progress') redirect('/' + locale + '/quiz/' + attemptId);
  const [t, td, texts] = await Promise.all([
    getTranslations('quiz'),
    getTranslations('dashboard'),
    localizeAttemptAnswers(attempt, locale as AppLocale),
  ]);

  return (
    <LearnerShell
      step="quiz"
      back={{ href: '/quiz', label: t('title') }}
      hero={
        <div className="mt-6">
          <h1
            className="rise font-display text-[26px] leading-[1.35] font-medium text-white md:text-[32px]"
            style={rise('0ms')}
          >
            {t('reviewTitle')}
          </h1>
          <p
            data-testid="quiz-score"
            className="rise mt-2 font-display text-[22px] leading-[1.45] font-semibold text-gold-100 tabular-nums"
            style={rise('80ms')}
          >
            {t('scoreLine', { score: attempt.score ?? 0, max: attempt.max_score ?? 0 })}
          </p>
          <div className="rise mt-6 flex flex-wrap gap-3" style={rise('160ms')}>
            <Link
              href="/quiz"
              className="inline-flex min-h-12 items-center rounded-control bg-white px-6 text-base font-semibold text-brand-900 shadow-[0_6px_20px_rgb(0_0_0/0.2)] transition-[transform,box-shadow] hover:-translate-y-0.5 focus-visible:outline-gold-100"
            >
              {td('cta.open', { step: t('title') })}
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex min-h-12 items-center rounded-control border border-white/35 px-5 text-base font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-gold-100"
            >
              {td('title')}
            </Link>
          </div>
        </div>
      }
    >
      <AnswerReview
        answers={attempt.assessment_answers}
        texts={texts}
        heading={t('reviewHeading')}
        labels={{ correct: t('correct'), incorrect: t('reviewIncorrect') }}
      />
    </LearnerShell>
  );
}
