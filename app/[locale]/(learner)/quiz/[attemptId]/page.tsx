import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireUser } from '@/lib/auth/session';
import type { AppLocale } from '@/i18n/routing';
import { getAttemptWithAnswers, localizeAttemptAnswers } from '@/lib/db/assessment';
import { createSupabaseServerClient } from '@/lib/db/server';
import { submitQuizAction } from '../actions';
import { QuestionCard } from '../question-card';

export default async function QuizAttemptPage({
  params,
}: {
  params: Promise<{ locale: string; attemptId: string }>;
}) {
  const { locale, attemptId } = await params;
  await requireUser(locale);
  const attempt = await getAttemptWithAnswers(await createSupabaseServerClient(), attemptId);
  if (!attempt || attempt.kind !== 'quiz') notFound();
  if (attempt.status !== 'in_progress') redirect(`/${locale}/quiz/${attemptId}/review`);
  const t = await getTranslations('quiz');

  const next = attempt.assessment_answers.find((a) => a.selected_key === null);
  const texts = next ? await localizeAttemptAnswers(attempt, locale as AppLocale) : null;
  const shown = next && texts ? texts.get(next.question_id)! : null;
  if (!next || !shown) {
    return (
      <section className="grid gap-4">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p>{t('allAnswered')}</p>
        <form action={submitQuizAction}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="attemptId" value={attempt.id} />
          <button
            type="submit"
            data-testid="submit-quiz"
            className="rounded bg-gray-900 px-4 py-2 text-white"
          >
            {t('submit')}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="grid gap-4">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <QuestionCard
        key={next.question_id}
        attemptId={attempt.id}
        questionId={next.question_id}
        position={next.position}
        total={attempt.assessment_answers.length}
        prompt={shown.prompt}
        options={shown.options}
        instantFeedback
      />
    </section>
  );
}
