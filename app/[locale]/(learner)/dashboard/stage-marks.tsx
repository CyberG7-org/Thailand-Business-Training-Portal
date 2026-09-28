import { CheckIcon, LockIcon } from '@/components/icons';
import type { StageStatus } from '@/lib/domain/progression';

export { CheckIcon, ChevronIcon, LockIcon } from '@/components/icons';

/** Handoff, status tags: gold for done, brand for in progress, ink for everything else. */
const TAG_TONE: Record<StageStatus, string> = {
  done: 'bg-gold-100 text-gold-700',
  in_progress: 'bg-brand-100 text-brand-700',
  available: 'bg-ink-100 text-ink-700',
  pending: 'bg-ink-100 text-ink-700',
  locked: 'bg-ink-100 text-ink-700',
};

export function StatusTag({
  status,
  children,
  testId,
}: {
  status: StageStatus;
  children: string;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex rounded-full px-2.5 py-px text-sm leading-[1.6] font-medium whitespace-nowrap ${TAG_TONE[status]}`}
    >
      {children}
    </span>
  );
}

/**
 * The step circle: done is gold with a check, the current step is navy (and pulses), an open
 * step is white with a brand ring, a locked one is ink with a lock.
 */
export function StageCircle({
  index,
  status,
  current,
  className = '',
}: {
  index: number;
  status: StageStatus;
  current: boolean;
  className?: string;
}) {
  const base = `grid shrink-0 place-items-center rounded-full text-sm font-semibold ${className}`;
  if (current) {
    return <span className={`${base} pulse bg-brand-900 text-white`}>{index + 1}</span>;
  }
  if (status === 'done') {
    return (
      <span className={`${base} bg-gold-500 text-brand-900`}>
        <CheckIcon />
      </span>
    );
  }
  if (status === 'locked' || status === 'pending') {
    return (
      <span className={`${base} bg-ink-100 text-ink-500`}>
        <LockIcon />
      </span>
    );
  }
  return (
    <span className={`${base} border-2 border-brand-600 bg-white text-brand-600`}>{index + 1}</span>
  );
}
