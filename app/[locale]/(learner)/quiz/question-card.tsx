'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useEffect } from 'react';
import { optionLabel, type QuestionOption } from '@/lib/domain/assessment/engine';
import { answerQuizAction, type AnswerState } from './actions';

type AnswerAction = (prev: AnswerState, formData: FormData) => Promise<AnswerState>;

/** What an already-answered quiz question reveals on a reload; the exam never sends this. */
export type Revealed = { correctKey: string; explanation: string | null };

const initial: AnswerState = { feedback: null, selectedKey: null, error: null };

export function QuestionCard({
  attemptId,
  questionId,
  position,
  total,
  prompt,
  options,
  instantFeedback,
  answeredKey = null,
  revealed = null,
  onAnswered,
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
  /** The answer already stored for this question, so a reload shows it. */
  answeredKey?: string | null;
  /** Quiz only: the correct key and explanation for a question already answered. */
  revealed?: Revealed | null;
  /** Lets the page count progress without a round trip. */
  onAnswered?: (questionId: string) => void;
  /** Defaults to the quiz action; the exam passes its non-revealing action. */
  action?: AnswerAction;
}) {
  const locale = useLocale();
  const t = useTranslations('quiz');
  const [state, formAction, pending] = useActionState(action, initial);

  // The answer this card shows: the one just given, or the one the server already had.
  const selectedKey = state.selectedKey ?? answeredKey;
  const answered = selectedKey !== null;
  // Correctness is painted only where it is allowed to be seen, whatever the action returns.
  const reveal: Revealed | null = !instantFeedback
    ? null
    : state.feedback
      ? { correctKey: state.feedback.correctKey, explanation: state.feedback.explanation }
      : revealed;
  const isCorrect = reveal ? reveal.correctKey === selectedKey : null;

  const justAnswered = state.selectedKey !== null;
  useEffect(() => {
    if (justAnswered) onAnswered?.(questionId);
  }, [justAnswered, onAnswered, questionId]);

  const optionClass = (key: string) => {
    if (!reveal) {
      return selectedKey === key ? 'border-gray-900' : 'border-gray-300 hover:bg-gray-50';
    }
    if (key === reveal.correctKey) return 'border-green-600 bg-green-50';
    if (key === selectedKey) return 'border-red-600 bg-red-50';
    return 'border-gray-200 opacity-70';
  };

  return (
    <div
      id={`q-${position}`}
      data-testid={`question-card-${position}`}
      data-answered={answered}
      className={`grid gap-4 rounded border p-4 ${answered ? 'border-gray-200' : 'border-gray-400'}`}
    >
      <p className="text-sm text-gray-500">{t('progress', { position: position + 1, total })}</p>
      <h2 className="text-lg font-semibold" data-testid="question-prompt">
        {prompt}
      </h2>
      <form action={formAction} className="grid gap-2">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="attemptId" value={attemptId} />
        <input type="hidden" name="questionId" value={questionId} />
        {options.map((o, i) => (
          <button
            key={o.key}
            type="submit"
            name="selectedKey"
            value={o.key}
            disabled={answered || pending}
            data-testid={`option-${o.key}`}
            data-state={
              !reveal
                ? 'idle'
                : o.key === reveal.correctKey
                  ? 'correct'
                  : o.key === selectedKey
                    ? 'incorrect'
                    : 'other'
            }
            className={`rounded border px-4 py-3 text-left text-sm disabled:cursor-default ${optionClass(o.key)}`}
          >
            <span className="mr-2 font-semibold">{optionLabel(i)}.</span>
            {o.text}
          </button>
        ))}
      </form>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {t(`errors.${state.error}` as never)}
        </p>
      )}
      {answered && instantFeedback && reveal && (
        <div
          className={`rounded border p-3 text-sm ${isCorrect ? 'border-green-600 bg-green-50' : 'border-red-600 bg-red-50'}`}
          data-testid="feedback"
          data-correct={isCorrect}
        >
          <p className="font-semibold">
            {isCorrect
              ? t('correct')
              : t('incorrect', {
                  key: optionLabel(options.findIndex((o) => o.key === reveal.correctKey)),
                })}
          </p>
          {!isCorrect && reveal.explanation && <p className="mt-1">{reveal.explanation}</p>}
        </div>
      )}
      {answered && !instantFeedback && (
        <p className="text-sm text-gray-600" data-testid="saved">
          {t('saved')}
        </p>
      )}
    </div>
  );
}
