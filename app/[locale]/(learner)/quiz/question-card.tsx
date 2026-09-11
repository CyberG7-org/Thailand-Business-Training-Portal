'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useActionState } from 'react';
import type { QuestionOption } from '@/lib/domain/assessment/engine';
import { answerQuizAction, type AnswerState } from './actions';

type AnswerAction = (prev: AnswerState, formData: FormData) => Promise<AnswerState>;

const initial: AnswerState = { feedback: null, selectedKey: null, error: null };

export function QuestionCard({
  attemptId,
  questionId,
  position,
  total,
  prompt,
  options,
  instantFeedback,
  action = answerQuizAction,
}: {
  attemptId: string;
  questionId: string;
  position: number;
  total: number;
  prompt: string;
  options: QuestionOption[];
  /** Quiz shows correctness immediately; the exam only confirms the answer was saved. */
  instantFeedback: boolean;
  /** Defaults to the quiz action; the exam passes its non-revealing action. */
  action?: AnswerAction;
}) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('quiz');
  const [state, formAction, pending] = useActionState(action, initial);
  const answered = state.feedback !== null;

  const optionClass = (key: string) => {
    if (!answered || !instantFeedback) {
      return state.selectedKey === key ? 'border-gray-900' : 'border-gray-300 hover:bg-gray-50';
    }
    if (key === state.feedback!.correctKey) return 'border-green-600 bg-green-50';
    if (key === state.selectedKey) return 'border-red-600 bg-red-50';
    return 'border-gray-200 opacity-70';
  };

  return (
    <div className="grid max-w-2xl gap-4" data-testid="question-card">
      <p className="text-sm text-gray-500">{t('progress', { position: position + 1, total })}</p>
      <h2 className="text-lg font-semibold" data-testid="question-prompt">
        {prompt}
      </h2>
      <form action={formAction} className="grid gap-2">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="attemptId" value={attemptId} />
        <input type="hidden" name="questionId" value={questionId} />
        {options.map((o) => (
          <button
            key={o.key}
            type="submit"
            name="selectedKey"
            value={o.key}
            disabled={answered || pending}
            data-testid={`option-${o.key}`}
            data-state={
              !answered || !instantFeedback
                ? 'idle'
                : o.key === state.feedback!.correctKey
                  ? 'correct'
                  : o.key === state.selectedKey
                    ? 'incorrect'
                    : 'other'
            }
            className={`rounded border px-4 py-3 text-left text-sm disabled:cursor-default ${optionClass(o.key)}`}
          >
            <span className="mr-2 font-semibold">{o.key}.</span>
            {o.text}
          </button>
        ))}
      </form>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {t(`errors.${state.error}` as never)}
        </p>
      )}
      {answered && instantFeedback && (
        <div
          className={`rounded border p-3 text-sm ${state.feedback!.isCorrect ? 'border-green-600 bg-green-50' : 'border-red-600 bg-red-50'}`}
          data-testid="feedback"
          data-correct={state.feedback!.isCorrect}
        >
          <p className="font-semibold">
            {state.feedback!.isCorrect
              ? t('correct')
              : t('incorrect', { key: state.feedback!.correctKey })}
          </p>
          {!state.feedback!.isCorrect && state.feedback!.explanation && (
            <p className="mt-1">{state.feedback!.explanation}</p>
          )}
        </div>
      )}
      {answered && !instantFeedback && (
        <p className="text-sm text-gray-600" data-testid="saved">
          {t('saved')}
        </p>
      )}
      {answered && (
        <button
          type="button"
          onClick={() => router.refresh()}
          data-testid="next-question"
          className="justify-self-start rounded bg-gray-900 px-4 py-2 text-sm text-white"
        >
          {position + 1 < total ? t('next') : t('finish')}
        </button>
      )}
    </div>
  );
}
