import { STAGE_KEYS } from '@/lib/domain/progression';
import { StageCircle, StatusTag } from './stage-marks';
import type { StageRow } from './stage-row';

/**
 * The five-step stepper on the band (handoff, Dashboard): a glass card with a connecting line
 * whose filled part reaches the current step. Titles give way to short labels on a phone.
 */
export function Stepper({ rows }: { rows: StageRow[] }) {
  const currentIndex = Math.max(
    0,
    rows.findIndex((r) => r.current),
  );
  return (
    <ol
      data-testid="stepper"
      className="glass mt-7 rounded-sheet px-3 pt-4 pb-3 text-ink-900 shadow-[0_8px_24px_rgb(12_26_58/0.18)] md:mt-9 md:px-7 md:pt-6 md:pb-5"
    >
      <div className="relative grid grid-cols-5">
        {/* The line runs between the circle centres, 10% in from either edge. */}
        <span
          aria-hidden="true"
          className="absolute top-[18px] right-[10%] left-[10%] h-0.5 bg-brand-700/20 md:top-[22px]"
        />
        <span
          aria-hidden="true"
          className="line-fill absolute top-[18px] left-[10%] h-0.5 bg-brand-700 md:top-[22px]"
          style={{ width: `${currentIndex * 20}%` }}
        />
        {rows.map((row, i) => (
          <li
            key={row.key}
            aria-current={row.current ? 'step' : undefined}
            className="relative flex flex-col items-center gap-1 text-center md:gap-2"
          >
            <StageCircle
              index={i}
              status={row.info.status}
              current={row.current}
              className="size-9 md:size-11 md:text-[15px]"
            />
            <span
              className={`hidden text-base leading-[1.5] font-semibold sm:block ${
                row.current
                  ? 'text-brand-900'
                  : row.info.status === 'locked'
                    ? 'text-ink-700'
                    : 'text-ink-900'
              }`}
            >
              {row.title}
            </span>
            <span
              className={`text-sm leading-[1.7] sm:hidden ${row.current ? 'font-semibold text-brand-900' : 'text-ink-700'}`}
            >
              {row.shortTitle}
            </span>
            <span className="hidden md:inline-flex">
              <StatusTag status={row.info.status}>{row.statusLabel}</StatusTag>
            </span>
          </li>
        ))}
      </div>
    </ol>
  );
}

export { STAGE_KEYS };
