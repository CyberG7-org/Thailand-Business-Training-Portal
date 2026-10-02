import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LearnerShell } from '@/components/shell/learner-shell';
import type { AppLocale } from '@/i18n/routing';
import { requireUser } from '@/lib/auth/session';
import { getPolicy } from '@/lib/config/policy';
import { getAttemptWithAnswers, localizeAttemptAnswers } from '@/lib/db/assessment';
import { createSupabaseServerClient } from '@/lib/db/server';
import { readMcqRule } from '@/lib/domain/mcq/result';
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
  if (attempt.status !== 'in_progress') redirect('/' + locale + '/exam/' + attemptId + '/result');
  const [t, texts, policyMark] = await Promise.all([
    getTranslations('exam'),
    localizeAttemptAnswers(attempt, locale as AppLocale),
    getPolicy('exam_passing_mark_percent'),
  ]);
  // An attempt from the Owner's bank marks each answer at once (D100); an earlier one reveals
  // nothing while it is open (EXAM-002).
  const rule = readMcqRule(attempt.rule_snapshot);

  // The correct key leaves the server only for a question already answered: the page carries
  // the prompt, the options, the learner's pick and, for those, what the marking was.
  const questions: BoardQuestion[] = attempt.assessment_answers.map((a) => {
    const shown = texts.get(a.question_id)!;
    const marked = rule !== null && a.selected_key !== null && shown.correctKey !== null;
    return {
      questionId: a.question_id,
      position: a.position,
      prompt: shown.prompt,
      options: shown.options,
      answeredKey: a.selected_key,
      revealed: marked ? { correctKey: shown.correctKey!, explanation: shown.explanation } : null,
    };
  });

  // Handoff, 04: what this attempt is, at a glance, beside the title.
  const meta = [
    { label: t('meta.questions'), value: String(questions.length) },
    rule
      ? { label: t('meta.toPass'), value: rule.passScore + ' / ' + questions.length }
      : {
          label: t('meta.passingMark'),
          value: (attempt.passing_mark_snapshot ?? policyMark) + '%',
        },
    { label: t('meta.attempt'), value: String(attempt.attempt_no) },
  ];

  return (
    <LearnerShell
      step="exam"
      hero={
        <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="font-display text-[26px] leading-[1.35] font-medium text-white md:text-[32px]">
              {t('title')}
            </h1>
            <p className="mt-1.5 max-w-[640px] text-base leading-[1.75] text-brand-100">
              {rule ? t('feedbackNote') : t('noFeedbackNote')}
            </p>
          </div>
          <dl
            data-testid="exam-meta"
            className="rise flex gap-6 rounded-card border border-white/20 bg-white/10 px-5 py-3 text-white"
            style={{ '--rise-delay': '120ms' } as React.CSSProperties}
          >
            {meta.map((m) => (
              <div key={m.label}>
                <dt className="text-sm leading-[1.6] text-brand-100">{m.label}</dt>
                <dd className="font-display text-[20px] font-semibold tabular-nums">{m.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      }
    >
      <AttemptBoard
        attemptId={attempt.id}
        questions={questions}
        instantFeedback={rule !== null}
        answerAction={answerExamAction}
        submitAction={submitExamAction}
        submitTestId="submit-exam"
        submitLabel={t('submit')}
      />
    </LearnerShell>
  );
}
