import type { CSSProperties } from 'react';
import type { DisplayedQuestion } from '@/lib/db/assessment';
import { optionLabel } from '@/lib/domain/assessment/engine';

export type ReviewedAnswer = {
  id: string;
  question_id: string;
  selected_key: string | null;
  is_correct: boolean | null;
};

/**
 * Every question of a closed attempt (D51), as the handoff's review list: a check or a cross,
 * the question, the correct option as a green chip and the learner's wrong pick struck through
 * in red. Shared by the quiz review and the exam result.
 */
export function AnswerReview({
  answers,
  texts,
  heading,
  note,
  labels,
}: {
  answers: ReviewedAnswer[];
  texts: Map<string, DisplayedQuestion>;
  heading: string;
  note?: string;
  /** Read by assistive technology in place of the check and the cross. */
  labels: { correct: string; incorrect: string };
}) {
  return (
    <section
      className="rise mx-auto w-full max-w-[880px] overflow-hidden rounded-card bg-white shadow-raised"
      style={{ '--rise-delay': '240ms' } as CSSProperties}
    >
      <div className="border-b border-brand-100 bg-brand-50 px-5 py-4 md:px-6">
        <h2
          data-testid="answers-heading"
          className="font-display text-[22px] leading-[1.45] font-semibold text-brand-900"
        >
          {heading}
        </h2>
        {note && <p className="mt-0.5 text-sm leading-[1.7] text-ink-700">{note}</p>}
      </div>
      <ol>
        {answers.map((a, i) => {
          const shown = texts.get(a.question_id);
          if (!shown) return null;
          return (
            <li
              key={a.id}
              data-testid={'review-' + i}
              data-correct={a.is_correct ?? undefined}
              className="grid grid-cols-[32px_minmax(0,1fr)] gap-3.5 border-b border-ink-100 px-5 py-5 last:border-b-0 md:px-6"
            >
              <span
                role="img"
                aria-label={a.is_correct ? labels.correct : labels.incorrect}
                className={
                  'grid size-7 place-items-center rounded-full ' +
                  (a.is_correct ? 'bg-ok-50 text-ok-600' : 'bg-bad-50 text-bad-600')
                }
              >
                <svg
                  aria-hidden="true"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  {a.is_correct ? <path d="M20 6 9 17l-5-5" /> : <path d="M18 6 6 18M6 6l12 12" />}
                </svg>
              </span>
              <div>
                <p className="mb-2 text-base leading-[1.6] font-semibold text-ink-900">
                  {i + 1}. {shown.prompt}
                </p>
                <ul className="flex flex-col gap-1 text-sm leading-[1.7] tabular-nums">
                  {shown.options.map((o, oi) => {
                    const isCorrect = o.key === shown.correctKey;
                    const isSelected = o.key === a.selected_key;
                    return (
                      <li
                        key={o.key}
                        data-state={isCorrect ? 'correct' : isSelected ? 'incorrect' : 'other'}
                        className={
                          isCorrect
                            ? 'w-fit rounded-[6px] bg-ok-50 px-2.5 py-0.5 font-semibold text-ok-600'
                            : isSelected
                              ? 'w-fit rounded-[6px] bg-bad-50 px-2.5 py-0.5 text-bad-600 line-through'
                              : 'text-ink-500'
                        }
                      >
                        {optionLabel(oi)}. {o.text}
                      </li>
                    );
                  })}
                </ul>
                {shown.explanation && (
                  <p className="mt-2 text-sm leading-[1.7] text-ink-700">{shown.explanation}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
