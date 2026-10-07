import {
  BankIcon,
  BookOpenTextIcon,
  ExamIcon,
  IdentificationCardIcon,
} from '@phosphor-icons/react/dist/ssr';
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
    <section className="rise md:overflow-hidden md:rounded-card md:bg-white md:shadow-raised">
      <div className="hidden items-center justify-between gap-3 border-b border-brand-100 bg-brand-50 px-4 py-3 md:flex md:px-6 md:py-4">
        <h2 className="font-display text-[18px] leading-[1.45] font-semibold text-brand-900 md:text-[22px]">
          {title}
        </h2>
        <span className="text-sm text-ink-700">{hint}</span>
      </div>
      <ol className="grid grid-cols-2 gap-2.5 md:block">
        {rows.map((row, i) => {
          const locked = row.info.status === 'locked' || row.info.status === 'pending';
          const tone = row.current
            ? 'bg-gradient-to-r from-brand-100 to-brand-50 shadow-[inset_4px_0_0_var(--color-brand-700)]'
            : locked
              ? 'hatch'
              : 'transition-colors hover:bg-brand-50';
          const mobileAction = row.key !== 'appointment';
          const mobileBorder = row.current ? 'border-brand-600' : 'border-ink-100';
          const mobileOrder =
            row.key === 'study'
              ? 'order-1'
              : row.key === 'exam'
                ? 'order-2'
                : row.key === 'interview'
                  ? 'order-3'
                  : row.key === 'nameCard'
                    ? 'order-4'
                    : 'order-5';
          return (
            <li
              key={row.key}
              data-testid={`stage-${row.key}`}
              data-locked={locked || undefined}
              data-mobile-action={mobileAction || undefined}
              className={`relative min-h-[132px] flex-col items-start gap-2 rounded-card border bg-white p-3 shadow-glass focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-brand-600 md:order-none md:grid md:min-h-[76px] md:grid-cols-[40px_minmax(0,1fr)_auto] md:items-center md:gap-4 md:rounded-none md:border-0 md:border-b md:border-ink-100 md:px-6 md:py-2.5 md:shadow-none md:last:border-b-0 ${mobileAction ? 'flex' : 'hidden'} ${mobileOrder} ${mobileBorder} ${tone}`}
            >
              <StageCircle
                index={i}
                status={row.info.status}
                current={row.current}
                className="hidden size-9 md:grid md:size-10"
              />
              <span
                aria-hidden="true"
                className={`grid size-10 place-items-center rounded-[12px] md:hidden ${row.current ? 'bg-brand-100 text-brand-700' : locked ? 'bg-ink-100 text-ink-500' : row.info.status === 'done' ? 'bg-ok-50 text-ok-600' : 'bg-gold-100 text-gold-700'}`}
              >
                {iconFor(row.key)}
              </span>
              <div className="mt-1 min-w-0 md:mt-0">
                <div
                  className={`text-[15px] leading-[1.45] font-semibold md:text-base md:leading-[1.5] ${
                    row.current ? 'text-brand-900' : locked ? 'text-ink-700' : 'text-ink-900'
                  }`}
                >
                  <span className="md:hidden">{row.shortTitle}</span>
                  <span className="hidden md:inline">{row.title}</span>
                </div>
                {hints[row.key] && (
                  <div className="mt-1 line-clamp-2 text-xs leading-[1.5] text-ink-500 md:hidden">
                    {hints[row.key]}
                  </div>
                )}
                {row.detail && (
                  <div
                    className={`hidden text-sm leading-[1.7] md:block ${row.current ? 'text-ink-700' : 'text-ink-500'}`}
                  >
                    {row.detail}
                  </div>
                )}
              </div>
              <div className="absolute top-3 right-3 flex items-center gap-3 md:static">
                <StatusTag status={row.info.status} testId={`stage-${row.key}-status`}>
                  {row.statusLabel}
                </StatusTag>
                {row.href && (
                  <Link
                    href={row.href}
                    className={`absolute inset-0 z-10 rounded-card text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 md:static md:inline-flex md:min-h-11 md:items-center md:gap-1 md:rounded-none ${
                      row.current ? 'text-brand-700' : 'text-ink-500'
                    }`}
                  >
                    <span className="sr-only md:not-sr-only">{openLabel}</span>
                    <ChevronIcon data-testid="stage-open-chevron" className="hidden md:block" />
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
