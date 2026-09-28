import { Link } from '@/i18n/navigation';
import { ChevronIcon, StageCircle, StatusTag } from './stage-marks';
import type { StageRow } from './stage-row';

/**
 * "Your steps" (handoff, Dashboard): one row per step, at least 76px tall. The current row is
 * tinted with a brand bar on its left, a locked row is hatched; an open row is a link over its
 * whole area. The test ids on the row and its tag are what the suite reads.
 */
export function StepsList({
  rows,
  title,
  hint,
  openLabel,
}: {
  rows: StageRow[];
  title: string;
  hint: string;
  openLabel: string;
}) {
  return (
    <section className="rise overflow-hidden rounded-card bg-white shadow-raised">
      <div className="flex items-center justify-between gap-3 border-b border-brand-100 bg-brand-50 px-4 py-3 md:px-6 md:py-4">
        <h2 className="font-display text-[18px] leading-[1.45] font-semibold text-brand-900 md:text-[22px]">
          {title}
        </h2>
        <span className="text-sm text-ink-700">{hint}</span>
      </div>
      <ol>
        {rows.map((row, i) => {
          const locked = row.info.status === 'locked' || row.info.status === 'pending';
          const tone = row.current
            ? 'bg-gradient-to-r from-brand-100 to-brand-50 shadow-[inset_4px_0_0_var(--color-brand-700)]'
            : locked
              ? 'hatch'
              : 'transition-colors hover:bg-brand-50';
          return (
            <li
              key={row.key}
              data-testid={`stage-${row.key}`}
              data-locked={locked || undefined}
              className={`relative grid min-h-16 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 border-b border-ink-100 px-4 py-2.5 last:border-b-0 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-brand-600 md:min-h-[76px] md:grid-cols-[40px_minmax(0,1fr)_auto] md:gap-4 md:px-6 ${tone}`}
            >
              <StageCircle
                index={i}
                status={row.info.status}
                current={row.current}
                className="size-9 md:size-10"
              />
              <div>
                <div
                  className={`text-base leading-[1.5] font-semibold ${
                    row.current ? 'text-brand-900' : locked ? 'text-ink-700' : 'text-ink-900'
                  }`}
                >
                  {row.title}
                </div>
                {row.detail && (
                  <div
                    className={`text-sm leading-[1.7] ${row.current ? 'text-ink-700' : 'text-ink-500'}`}
                  >
                    {row.detail}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <StatusTag status={row.info.status} testId={`stage-${row.key}-status`}>
                  {row.statusLabel}
                </StatusTag>
                {row.href && (
                  <Link
                    href={row.href}
                    className={`inline-flex min-h-11 items-center gap-1 text-sm font-medium outline-none after:absolute after:inset-0 after:content-[''] ${
                      row.current ? 'text-brand-700' : 'text-ink-500'
                    }`}
                  >
                    {openLabel}
                    <ChevronIcon />
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
