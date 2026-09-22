import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireUser } from '@/lib/auth/session';
import type { AppLocale } from '@/i18n/routing';
import { getAttemptWithAnswers, localizeAttemptAnswers } from '@/lib/db/assessment';
import { createSupabaseServerClient } from '@/lib/db/server';
import { AnswerReview } from '@/components/answer-review';

export default async function QuizReviewPage({
  params,
}: {
  params: Promise<{ locale: string; attemptId: string }>;
}) {
  const { locale, attemptId } = await params;
  await requireUser(locale);
  const attempt = await getAttemptWithAnswers(await createSupabaseServerClient(), attemptId);
  if (!attempt || attempt.kind !== 'quiz') notFound();
  if (attempt.status === 'in_progress') redirect(`/${locale}/quiz/${attemptId}`);
  const texts = await localizeAttemptAnswers(attempt, locale as AppLocale);
  const t = await getTranslations('quiz');

  return (
    <section className="grid gap-6">
      <Link href="/quiz" className="text-sm underline">
        ← {t('title')}
      </Link>
      <h1 className="text-2xl font-semibold">{t('reviewTitle')}</h1>
      <p className="text-lg" data-testid="quiz-score">
        {t('scoreLine', { score: attempt.score ?? 0, max: attempt.max_score ?? 0 })}
      </p>
      <AnswerReview answers={attempt.assessment_answers} texts={texts} />
    </section>
  );
}
