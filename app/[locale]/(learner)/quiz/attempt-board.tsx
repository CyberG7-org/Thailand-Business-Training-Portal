'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import type { QuestionOption } from '@/lib/domain/assessment/engine';
import { QuestionCard, type Revealed } from './question-card';
import type { AnswerState } from './actions';

export type BoardQuestion = {
  questionId: string;
  position: number;
  prompt: string;
  options: QuestionOption[];
  answeredKey: string | null;
  /** Quiz only, and only for questions already answered. */
  revealed: Revealed | null;
};

/**
 * The whole attempt on one page (D57): every question in order, answers posted as they are given
 * so a reload resumes exactly, and a panel that tracks progress and holds Submit.
 */
export function AttemptBoard({
  attemptId,
  questions,
  instantFeedback,
  answerAction,
  submitAction,
  submitTestId,
  submitLabel,
}: {
  attemptId: string;
  questions: BoardQuestion[];
  instantFeedback: boolean;
  answerAction: (prev: AnswerState, formData: FormData) => Promise<AnswerState>;
  submitAction: (formData: FormData) => Promise<void>;
  submitTestId: string;
  submitLabel: string;
}) {
  const locale = useLocale();
  const t = useTranslations('quiz');
  const [answered, setAnswered] = useState<Set<string>>(
    () => new Set(questions.filter((q) => q.answeredKey !== null).map((q) => q.questionId)),
  );
  const markAnswered = useCallback((questionId: string) => {
    setAnswered((current) =>
      current.has(questionId) ? current : new Set(current).add(questionId),
    );
  }, []);

  const total = questions.length;
  const done = answered.size;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const nextUnanswered = questions.find((q) => !answered.has(q.questionId));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
      <ol className="grid gap-4">
        {questions.map((q) => (
          <li key={q.questionId}>
            <QuestionCard
              attemptId={attemptId}
              questionId={q.questionId}
              position={q.position}
              total={total}
              prompt={q.prompt}
              options={q.options}
              answeredKey={q.answeredKey}
              revealed={q.revealed}
              instantFeedback={instantFeedback}
              onAnswered={markAnswered}
              action={answerAction}
            />
          </li>
        ))}
      </ol>

      <aside
        data-testid="attempt-progress"
        data-answered={done}
        data-total={total}
        className="sticky top-0 z-10 order-first grid gap-3 border-b bg-white py-3 lg:top-6 lg:order-last lg:rounded lg:border lg:p-4"
      >
        <p className="text-sm font-semibold">{t('answeredOf', { answered: done, total })}</p>
        <div
          className="h-2 w-full overflow-hidden rounded bg-gray-200"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full bg-gray-900" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-xs text-gray-600">{t('percentDone', { percent })}</p>
        {nextUnanswered && (
          <a href={`#q-${nextUnanswered.position}`} className="text-sm underline">
            {t('jumpNext')}
          </a>
        )}
        <form action={submitAction}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="attemptId" value={attemptId} />
          <button
            type="submit"
            disabled={done < total}
            data-testid={submitTestId}
            className="w-full rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </form>
      </aside>
    </div>
  );
}
