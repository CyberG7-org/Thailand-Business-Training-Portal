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
 * so a reload resumes exactly, and a panel that tracks progress and holds Submit. The panel is a
 * sticky glass bar on a phone and a card beside the questions on a desktop (handoff, 03/04).
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
  const bar = instantFeedback ? 'bg-brand-600' : 'bg-brand-700';

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,780px)_16rem] xl:items-start xl:justify-center xl:gap-8">
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
        className="glass-strong sticky top-2 z-10 order-first grid gap-3 rounded-card px-4 py-3 text-ink-900 xl:sticky xl:top-6 xl:order-last xl:bg-white xl:p-5 xl:shadow-raised"
      >
        <p className="text-sm font-semibold tabular-nums">
          {t('answeredOf', { answered: done, total })}
        </p>
        <div
          className="h-1.5 w-full overflow-hidden rounded-[3px] bg-ink-100"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={'h-full rounded-[3px] transition-[width] duration-300 ' + bar}
            style={{ width: percent + '%' }}
          />
        </div>
        <p className="text-sm leading-[1.7] text-ink-700 tabular-nums">
          {t('percentDone', { percent })}
        </p>
        {nextUnanswered && (
          <a
            href={'#q-' + nextUnanswered.position}
            className="text-sm font-medium text-brand-700 underline underline-offset-[3px]"
          >
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
            className="flex min-h-12 w-full items-center justify-center rounded-control bg-brand-600 px-6 text-base font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </form>
      </aside>
    </div>
  );
}
