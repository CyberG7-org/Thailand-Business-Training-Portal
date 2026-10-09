import {
  BankIcon,
  BookOpenTextIcon,
  ExamIcon,
  IdentificationCardIcon,
} from '@phosphor-icons/react/dist/ssr';
import { Link } from '@/i18n/navigation';
import { ChevronIcon, StatusTag } from './stage-marks';
import type { StageRow } from './stage-row';

/**
 * The same four module tiles at every breakpoint. Each unlocked tile is one tap target.
 */
export function StepsList({
  rows,
  title,
  hint,
  openLabel,
  hints,
}: {
  rows: StageRow[];
  title: string;
  hint: string;
  openLabel: string;
  hints: Partial<Record<StageRow['key'], string>>;
}) {
  const iconFor = (key: StageRow['key']) => {
    const className = 'size-6';
    if (key === 'study') return <BookOpenTextIcon className={className} weight="duotone" />;
    if (key === 'nameCard')
      return <IdentificationCardIcon className={className} weight="duotone" />;
    if (key === 'exam') return <ExamIcon className={className} weight="duotone" />;
    return <BankIcon className={className} weight="duotone" />;
  };
  return (
    <section data-testid="dashboard-steps" className="rise">
      <div className="mb-3 hidden items-center justify-between gap-3 md:flex">
        <h2 className="font-display text-[18px] leading-[1.45] font-semibold text-brand-900 md:text-[22px]">
          {title}
        </h2>
        <span className="text-sm text-ink-700">{hint}</span>
      </div>
      <ol className="grid grid-cols-2 gap-2.5 md:gap-4 xl:grid-cols-4">
        {rows.map((row, i) => {
          const locked = row.info.status === 'locked' || row.info.status === 'pending';
          const tone = row.current
            ? 'bg-gradient-to-r from-brand-100 to-brand-50 shadow-[inset_4px_0_0_var(--color-brand-700)]'
            : locked
              ? 'hatch'
              : 'transition-colors hover:bg-brand-50';
          const mobileAction = row.key !== 'appointment';
          const mobileBorder = row.current ? 'border-brand-600' : 'border-ink-100';
          return (
            <li
              key={row.key}
              data-testid={`stage-${row.key}`}
              aria-current={row.current ? 'step' : undefined}
              data-locked={locked || undefined}
              data-mobile-action={mobileAction || undefined}
              className={`relative flex min-h-[148px] flex-col items-start gap-2 rounded-card border bg-white p-3 shadow-glass focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-brand-600 md:min-h-[174px] md:p-5 ${mobileAction ? '' : 'hidden'} ${mobileBorder} ${tone}`}
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`grid size-10 place-items-center rounded-[12px] ${row.current ? 'bg-brand-100 text-brand-700' : locked ? 'bg-ink-100 text-ink-500' : row.info.status === 'done' ? 'bg-ok-50 text-ok-600' : 'bg-gold-100 text-gold-700'}`}
                >
                  {iconFor(row.key)}
                </span>
                <span
                  className="grid size-6 place-items-center rounded-full bg-brand-900 text-xs font-semibold text-white md:hidden"
                  aria-label={`${i + 1}`}
                >
                  {i + 1}
                </span>
              </div>
              <div className="mt-1 min-w-0">
                <div
                  className={`text-[15px] leading-[1.45] font-semibold md:text-base md:leading-[1.5] ${
                    row.current ? 'text-brand-900' : locked ? 'text-ink-700' : 'text-ink-900'
                  }`}
                >
                  {row.shortTitle}
                </div>
                {hints[row.key] && (
                  <div className="mt-1 line-clamp-2 text-xs leading-[1.5] text-ink-500 md:text-sm">
                    {hints[row.key]}
                  </div>
                )}
                {row.detail && (
                  <div
                    className={`mt-1 line-clamp-2 text-xs leading-[1.5] md:text-sm ${row.current ? 'text-ink-700' : 'text-ink-500'}`}
                  >
                    {row.detail}
                  </div>
                )}
              </div>
              <div className="absolute top-3 right-3 flex items-center gap-3">
                <StatusTag status={row.info.status} testId={`stage-${row.key}-status`}>
                  {row.statusLabel}
                </StatusTag>
                {row.href && (
                  <span
                    className={`hidden min-h-11 items-center gap-1 text-sm font-medium ${
                      row.current ? 'text-brand-700' : 'text-ink-500'
                    }`}
                  >
                    {openLabel}
                    <ChevronIcon data-testid="stage-open-chevron" className="hidden md:block" />
                  </span>
                )}
              </div>
              {row.href && (
                <Link
                  href={row.href}
                  aria-label={`${openLabel}: ${row.shortTitle}`}
                  className="absolute inset-0 z-10 rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
