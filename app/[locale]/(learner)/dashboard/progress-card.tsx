const CIRCUMFERENCE = 2 * Math.PI * 52;

/**
 * The progress card in the hero (handoff, Dashboard): a ring of the learner's steps done, then
 * the two evaluations one under the other — the Business Knowledge Quiz (last score, with the
 * pass mark under it) and the Bank Readiness Interview (where it stands). Glass-strong on the
 * band, ink text.
 */
export function ProgressCard({
  done,
  total,
  ringLabel,
  stepsDoneLabel,
  quizLabel,
  quizValue,
  quizNote,
  interviewLabel,
  interviewValue,
}: {
  done: number;
  total: number;
  ringLabel: string;
  stepsDoneLabel: string;
  quizLabel: string;
  /** "score / max", or the not-taken text. */
  quizValue: string;
  /** The pass mark, under the score. */
  quizNote: string;
  interviewLabel: string;
  /** Ready, in progress, not started, or when it opens. */
  interviewValue: string;
}) {
  const filled = (done / total) * CIRCUMFERENCE;
  const value =
    'font-display text-xl leading-[1.45] font-semibold text-brand-900 tabular-nums md:text-[22px]';
  return (
    <div className="glass-strong grid grid-cols-[76px_minmax(0,1fr)] items-center gap-4 rounded-sheet p-4 text-ink-900 shadow-[0_12px_32px_rgb(12_26_58/0.25)] md:grid-cols-[120px_minmax(0,1fr)] md:gap-5 md:p-5">
      <div role="img" aria-label={ringLabel} className="relative size-[76px] md:size-[120px]">
        <svg viewBox="0 0 120 120" className="size-full">
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            className="stroke-brand-100"
            strokeWidth="10"
          />
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            className="ring-fill stroke-brand-600"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="font-display text-xl leading-none font-semibold text-brand-900 tabular-nums md:text-[26px]">
              {done}/{total}
            </div>
            <div className="hidden text-xs leading-[1.6] text-ink-700 md:block">
              {stepsDoneLabel}
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-1 md:gap-2.5">
        <div>
          <div className="text-sm leading-[1.7] text-ink-700">{quizLabel}</div>
          <div data-testid="exam-score" className={value}>
            {quizValue}
          </div>
          <div className="text-sm leading-[1.7] text-ink-500" data-testid="quiz-pass-mark">
            {quizNote}
          </div>
        </div>
        <div className="hidden h-px bg-brand-700/15 md:block" />
        <div>
          <div className="text-sm leading-[1.7] text-ink-700">{interviewLabel}</div>
          <div data-testid="interview-status" className={value}>
            {interviewValue}
          </div>
        </div>
      </div>
    </div>
  );
}
