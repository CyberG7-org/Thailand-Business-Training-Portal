'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useEffect } from 'react';
import { optionLabel, type QuestionOption } from '@/lib/domain/assessment/engine';
import { answerQuizAction, type AnswerState } from './actions';

type AnswerAction = (prev: AnswerState, formData: FormData) => Promise<AnswerState>;

/** What an already-answered quiz question reveals on a reload; the exam never sends this. */
export type Revealed = { correctKey: string; explanation: string | null };

type OptionState = 'idle' | 'selected' | 'correct' | 'incorrect' | 'other';

const initial: AnswerState = { feedback: null, selectedKey: null, error: null };

/**
 * Handoff, 03/04: an idle option wears an ink ring; once answered the quiz paints the correct
 * option green and a wrong pick red, the exam only outlines the pick in navy.
 */
const OPTION: Record<OptionState, string> = {
  idle: 'border border-ink-300 bg-white text-ink-700 hover:border-brand-600 hover:bg-brand-50',
  selected: 'border-2 border-brand-900 bg-brand-50 font-medium text-brand-900',
  correct: 'border-2 border-ok-600 bg-ok-50 font-medium text-ink-900',
  incorrect: 'border-2 border-bad-600 bg-bad-50 font-medium text-ink-900',
  other: 'border border-ink-100 bg-white text-ink-500',
};
const LETTER: Record<OptionState, string> = {
  idle: '',
  selected: '',
  correct: 'text-ok-600',
  incorrect: 'text-bad-600',
  other: '',
};

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

  const tone = instantFeedback ? 'quiz' : 'exam';
  const percent = total === 0 ? 0 : Math.round(((position + 1) / total) * 100);
  const stateOf = (key: string): OptionState => {
    if (reveal) {
      if (key === reveal.correctKey) return 'correct';
      if (key === selectedKey) return 'incorrect';
      return 'other';
    }
    return selectedKey === key ? 'selected' : 'idle';
  };

  return (
    <div
      id={'q-' + position}
      data-testid={'question-card-' + position}
      data-answered={answered}
      className="rounded-card bg-white px-5 pt-5 pb-6 shadow-raised md:px-8 md:pt-7 md:pb-8"
    >
      <div className="mb-4 flex items-center gap-4 md:mb-[18px]">
        <span className="text-sm leading-[1.7] font-medium whitespace-nowrap text-ink-700 tabular-nums">
          {t('progress', { position: position + 1, total })}
        </span>
        <div
          data-testid="question-bar"
          data-tone={tone}
          className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-ink-100"
        >
          <div
            className={
              'h-full rounded-[3px] ' + (tone === 'quiz' ? 'bg-brand-600' : 'bg-brand-700')
            }
            style={{ width: percent + '%' }}
          />
        </div>
      </div>
      <h2
        className="mb-5 font-display text-[20px] leading-[1.7] font-semibold text-pretty text-brand-900 md:text-[22px] md:leading-[1.45]"
        data-testid="question-prompt"
      >
        {prompt}
      </h2>
      <form action={formAction} className="flex flex-col gap-2 md:gap-2.5">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="attemptId" value={attemptId} />
        <input type="hidden" name="questionId" value={questionId} />
        {options.map((o, i) => {
          const s = stateOf(o.key);
          return (
            <button
              key={o.key}
              type="submit"
              name="selectedKey"
              value={o.key}
              disabled={answered || pending}
              data-testid={'option-' + o.key}
              data-state={s}
              className={
                'grid min-h-14 grid-cols-[28px_minmax(0,1fr)_20px] items-center gap-2.5 rounded-control px-3.5 py-2 text-left text-base leading-[1.6] tabular-nums transition-colors disabled:cursor-default md:grid-cols-[32px_minmax(0,1fr)_20px] md:gap-3 md:px-4 ' +
                OPTION[s]
              }
            >
              <span className={'font-semibold ' + LETTER[s]}>{optionLabel(i)}.</span>
              {o.text}
              {s === 'correct' && (
                <svg
                  aria-hidden="true"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className="text-ok-600"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
              {s === 'incorrect' && (
                <svg
                  aria-hidden="true"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className="text-bad-600"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              )}
              {s === 'selected' && (
                <i
                  aria-hidden="true"
                  className="block size-[18px] rounded-full border-[5px] border-brand-900"
                />
              )}
            </button>
          );
        })}
      </form>
      {state.error && (
        <p
          role="alert"
          className="mt-4 rounded-control bg-bad-50 px-3.5 py-2.5 text-sm font-medium text-bad-600"
        >
          {t(('errors.' + state.error) as never)}
        </p>
      )}
      {answered && instantFeedback && reveal && (
        <div
          role="status"
          data-testid="feedback"
          data-correct={isCorrect}
          className={
            'mt-4 rounded-control px-4 py-3.5 md:mt-[18px] ' +
            (isCorrect ? 'bg-ok-50' : 'bg-bad-50')
          }
        >
          <p
            className={
              'text-base leading-[1.6] font-semibold ' +
              (isCorrect ? 'text-ok-600' : 'text-bad-600')
            }
          >
            {isCorrect
              ? t('correct')
              : t('incorrect', {
                  key: optionLabel(options.findIndex((o) => o.key === reveal.correctKey)),
                })}
          </p>
          {!isCorrect && reveal.explanation && (
            <p className="mt-0.5 text-sm leading-[1.7] text-ink-900">{reveal.explanation}</p>
          )}
        </div>
      )}
      {answered && !instantFeedback && (
        <p
          role="status"
          data-testid="saved"
          className="mt-5 inline-flex items-center gap-2 text-sm leading-[1.7] text-ink-700"
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="text-brand-700"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
          {t('saved')}
        </p>
      )}
    </div>
  );
}
