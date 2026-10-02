import { getTranslations } from 'next-intl/server';
import type { StageInfo, StageKey } from '@/lib/domain/progression';
import { LEARNER_STAGES } from '@/lib/domain/stage-progress';

/** Gold only for a step actually done; the current step is white, the rest faint. */
const TONE = { done: 'bg-gold-500', current: 'bg-white', upcoming: 'bg-white/25' } as const;

/**
 * "Step n of N" and one segment per step on the band, read from the learner's real progress.
 * A page that is not one of the learner's five steps (the practice round) shows the segments
 * without a number.
 */
export async function StepSegments({
  current,
  statuses,
}: {
  current: StageKey;
  statuses: Record<StageKey, StageInfo> | null;
}) {
  const t = await getTranslations('stages');
  const n = LEARNER_STAGES.indexOf(current) + 1;
  return (
    <div
      data-testid="step-segments"
      className="flex items-center gap-3 text-sm font-medium text-brand-100 tabular-nums"
    >
      {n > 0 && <span>{t('stepOf', { n, total: LEARNER_STAGES.length })}</span>}
      <div className="flex gap-1" aria-hidden="true">
        {LEARNER_STAGES.map((key) => {
          const state =
            key === current ? 'current' : statuses?.[key].status === 'done' ? 'done' : 'upcoming';
          return (
            <span key={key} data-state={state} className={`h-1 w-7 rounded-sm ${TONE[state]}`} />
          );
        })}
      </div>
    </div>
  );
}
