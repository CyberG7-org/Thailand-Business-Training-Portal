import { LearnerShell } from '@/components/shell/learner-shell';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { requireUser } from '@/lib/auth/session';
import { getAttemptWithAnswers, localizeAttemptAnswers } from '@/lib/db/assessment';
import { createSupabaseServerClient } from '@/lib/db/server';
import { AttemptBoard, type BoardQuestion } from '../../quiz/attempt-board';
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
  const texts = await localizeAttemptAnswers(attempt, locale as AppLocale);

  // An open exam reveals nothing (EXAM-002): the correct keys never leave the server, so the
  // page carries only the prompt, the options and which one the learner picked.
  const questions: BoardQuestion[] = attempt.assessment_answers.map((a) => {
    const shown = texts.get(a.question_id)!;
    return {
      questionId: a.question_id,
      position: a.position,
      prompt: shown.prompt,
      options: shown.options,
      answeredKey: a.selected_key,
      revealed: null,
    };
  });

  return (
    <LearnerShell title={t('title')} step="exam">
      <section className="grid gap-4">
        <p className="text-sm text-gray-600">{t('noFeedbackNote')}</p>
        <AttemptBoard
          attemptId={attempt.id}
          questions={questions}
          instantFeedback={false}
          answerAction={answerExamAction}
          submitAction={submitExamAction}
          submitTestId="submit-exam"
          submitLabel={t('submit')}
        />
      </section>
    </LearnerShell>
  );
}
