import { STAGE_KEYS } from '@/lib/domain/progression';
import { StageCircle, StatusTag } from './stage-marks';
import type { StageRow } from './stage-row';

/**
 * The stepper on the band (handoff, Dashboard): a glass card with a connecting line whose filled
 * part reaches the current step. Titles give way to short labels on a phone. The geometry follows
 * the number of steps: the line runs between the first and the last circle centres.
 */
export function Stepper({ rows }: { rows: StageRow[] }) {
  const currentIndex = Math.max(
    0,
    rows.findIndex((r) => r.current),
  );
  const n = rows.length;
  const inset = 100 / (2 * n);
  const step = 100 / n;
  const mobileRows = rows.filter((row) => row.key !== 'appointment');
  const mobileCurrentIndex = Math.max(
    0,
    mobileRows.findIndex((row) => row.current),
  );
  const mobileFilled = rows.find((row) => row.key === 'appointment')?.current
    ? mobileRows.length - 1
    : mobileCurrentIndex;
  return (
    <ol
      data-testid="stepper"
      className="mt-4 rounded-card border border-brand-100 bg-white px-2.5 pt-3 pb-2.5 text-ink-900 shadow-glass md:mt-9 md:rounded-sheet md:px-7 md:pt-6 md:pb-5"
    >
      <div className="relative grid grid-cols-4 md:grid-cols-5">
        <span
          aria-hidden="true"
          className="absolute top-[16px] right-[12.5%] left-[12.5%] h-0.5 bg-brand-700/15 md:hidden"
        />
        <span
          aria-hidden="true"
          className="line-fill absolute top-[16px] left-[12.5%] h-0.5 bg-brand-600 md:hidden"
          style={{ width: mobileFilled * 25 + '%' }}
        />
        <span
          aria-hidden="true"
          className="absolute top-[22px] hidden h-0.5 bg-brand-700/20 md:block"
          style={{ left: inset + '%', right: inset + '%' }}
        />
        <span
          aria-hidden="true"
          className="line-fill absolute top-[22px] hidden h-0.5 bg-brand-700 md:block"
          style={{ left: inset + '%', width: currentIndex * step + '%' }}
        />
        {rows.map((row, i) => (
          <li
            key={row.key}
            aria-current={row.current ? 'step' : undefined}
            className={`relative flex-col items-center gap-1 text-center md:flex md:gap-2 ${row.key === 'appointment' ? 'hidden' : 'flex'}`}
          >
            <StageCircle
              index={i}
              status={row.info.status}
              current={row.current}
              className="size-8 text-xs md:size-11 md:text-[15px]"
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
