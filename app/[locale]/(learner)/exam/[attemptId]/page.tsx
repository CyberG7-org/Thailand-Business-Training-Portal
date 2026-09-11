import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireUser } from '@/lib/auth/session';
import { getAttemptWithAnswers } from '@/lib/db/assessment';
import { createSupabaseServerClient } from '@/lib/db/server';
import type { QuestionOption } from '@/lib/domain/assessment/engine';
import { QuestionCard } from '../../quiz/question-card';
import { answerExamAction, submitExamAction } from '../actions';

export default async function ExamAttemptPage({
  params,
}: {
  params: Promise<{ locale: string; attemptId: string }>;
}) {
  const { locale, attemptId } = await params;
  await requireUser(locale);
  const attempt = await getAttemptWithAnswers(await createSupabaseServerClient(), attemptId);
  if (!attempt || attempt.kind !== 'exam') notFound();
  if (attempt.status !== 'in_progress') redirect(`/${locale}/exam/${attemptId}/result`);
  const t = await getTranslations('exam');

  const next = attempt.assessment_answers.find((a) => a.selected_key === null);
  if (!next) {
    return (
      <section className="grid gap-4">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p>{t('allAnswered')}</p>
        <form action={submitExamAction}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="attemptId" value={attempt.id} />
          <button
            type="submit"
            data-testid="submit-exam"
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
      <p className="text-sm text-gray-600">{t('noFeedbackNote')}</p>
      <QuestionCard
        key={next.question_id}
        attemptId={attempt.id}
        questionId={next.question_id}
        position={next.position}
        total={attempt.assessment_answers.length}
        prompt={next.rendered_prompt}
        options={next.rendered_options as unknown as QuestionOption[]}
        instantFeedback={false}
        action={answerExamAction}
      />
    </section>
  );
}
