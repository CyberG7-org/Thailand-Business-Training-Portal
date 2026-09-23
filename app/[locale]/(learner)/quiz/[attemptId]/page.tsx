import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { requireUser } from '@/lib/auth/session';
import { getAttemptWithAnswers, localizeAttemptAnswers } from '@/lib/db/assessment';
import { createSupabaseServerClient } from '@/lib/db/server';
import { answerQuizAction, submitQuizAction } from '../actions';
import { AttemptBoard, type BoardQuestion } from '../attempt-board';

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
  const texts = await localizeAttemptAnswers(attempt, locale as AppLocale);

  // The quiz reveals correctness as you answer, so a question already answered keeps showing it
  // after a reload. Unanswered questions carry no correct key.
  const questions: BoardQuestion[] = attempt.assessment_answers.map((a) => {
    const shown = texts.get(a.question_id)!;
    return {
      questionId: a.question_id,
      position: a.position,
      prompt: shown.prompt,
      options: shown.options,
      answeredKey: a.selected_key,
      revealed:
        a.selected_key !== null && shown.correctKey !== null
          ? { correctKey: shown.correctKey, explanation: shown.explanation }
          : null,
    };
  });

  return (
    <section className="grid gap-4">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <AttemptBoard
        attemptId={attempt.id}
        questions={questions}
        instantFeedback
        answerAction={answerQuizAction}
        submitAction={submitQuizAction}
        submitTestId="submit-quiz"
        submitLabel={t('submit')}
      />
    </section>
  );
}
