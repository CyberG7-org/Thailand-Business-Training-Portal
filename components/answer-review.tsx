import type { DisplayedQuestion } from '@/lib/db/assessment';
import { optionLabel } from '@/lib/domain/assessment/engine';

export type ReviewedAnswer = {
  id: string;
  question_id: string;
  selected_key: string | null;
  is_correct: boolean | null;
};

/**
 * One card per question of a closed attempt: every option with the correct one ticked, the
 * learner's wrong pick struck through, and the explanation. Shared by the quiz review and the
 * exam result (D51).
 */
export function AnswerReview({
  answers,
  texts,
}: {
  answers: ReviewedAnswer[];
  texts: Map<string, DisplayedQuestion>;
}) {
  return (
    <ol className="grid max-w-2xl gap-4">
      {answers.map((a, i) => {
        const shown = texts.get(a.question_id);
        if (!shown) return null;
        return (
          <li
            key={a.id}
            className="rounded border p-4"
            data-testid={`review-${i}`}
            data-correct={a.is_correct ?? undefined}
          >
            <p className="font-semibold">
              <span className={a.is_correct ? 'text-green-700' : 'text-red-700'} aria-hidden>
                {a.is_correct ? '✓' : '✗'}
              </span>{' '}
              {i + 1}. {shown.prompt}
            </p>
            <ul className="mt-2 grid gap-1 text-sm">
              {shown.options.map((o, oi) => {
                const isCorrect = o.key === shown.correctKey;
                const isSelected = o.key === a.selected_key;
                return (
                  <li
                    key={o.key}
                    data-state={isCorrect ? 'correct' : isSelected ? 'incorrect' : 'other'}
                    className={
                      isCorrect
                        ? 'text-green-700'
                        : isSelected
                          ? 'text-red-700 line-through'
                          : 'text-gray-600'
                    }
                  >
                    {optionLabel(oi)}. {o.text}
                    {isCorrect ? ' ✓' : ''}
                    {isSelected && !isCorrect ? ' ✗' : ''}
                  </li>
                );
              })}
            </ul>
            {shown.explanation && <p className="mt-2 text-sm text-gray-700">{shown.explanation}</p>}
          </li>
        );
      })}
    </ol>
  );
}
