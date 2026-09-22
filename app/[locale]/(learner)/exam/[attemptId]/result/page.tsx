import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireUser } from '@/lib/auth/session';
import type { AppLocale } from '@/i18n/routing';
import { getAttemptWithAnswers, localizeAttemptAnswers } from '@/lib/db/assessment';
import { createSupabaseServerClient } from '@/lib/db/server';
import { AnswerReview } from '@/components/answer-review';

/** Score, pass/fail and the full review — every option with the correct one marked (D51). */
export default async function ExamResultPage({
  params,
}: {
  params: Promise<{ locale: string; attemptId: string }>;
}) {
  const { locale, attemptId } = await params;
  await requireUser(locale);
  const attempt = await getAttemptWithAnswers(await createSupabaseServerClient(), attemptId);
  if (!attempt || attempt.kind !== 'exam') notFound();
  if (attempt.status === 'in_progress') redirect(`/${locale}/exam/${attemptId}`);
  const t = await getTranslations('exam');
  const texts = await localizeAttemptAnswers(attempt, locale as AppLocale);
  const passed = attempt.result === 'pass';

  return (
    <section className="grid gap-6">
      <Link href="/exam" className="text-sm underline">
        ← {t('title')}
      </Link>
      <h1 className="text-2xl font-semibold">{t('resultTitle')}</h1>
      <p
        className={`inline-block w-fit rounded px-3 py-1 text-lg font-semibold ${passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
        data-testid="exam-result"
        data-result={attempt.result}
      >
        {passed ? t('pass') : t('fail')}
      </p>
      <p data-testid="exam-score">
        {t('scoreLine', {
          score: attempt.score ?? 0,
          max: attempt.max_score ?? 0,
          passingMark: Number(attempt.passing_mark_snapshot ?? 0),
        })}
      </p>
      <p className="text-sm text-gray-600">{t('resultNote')}</p>
      <AnswerReview answers={attempt.assessment_answers} texts={texts} />
    </section>
  );
}
