import { getTranslations } from 'next-intl/server';
import { STAGE_KEYS, type StageInfo, type StageKey } from '@/lib/domain/progression';

/** Gold only for a step actually done; the current step is white, the rest faint. */
const TONE = { done: 'bg-gold-500', current: 'bg-white', upcoming: 'bg-white/25' } as const;

/** "Step n of 5" and the five segments on the band, read from the learner's real progress. */
export async function StepSegments({
  current,
  statuses,
}: {
  current: StageKey;
  statuses: Record<StageKey, StageInfo> | null;
}) {
  const t = await getTranslations('stages');
  const n = STAGE_KEYS.indexOf(current) + 1;
  return (
    <div
      data-testid="step-segments"
      className="flex items-center gap-3 text-sm font-medium text-brand-100 tabular-nums"
    >
      <span>{t('stepOf', { n })}</span>
      <div className="flex gap-1" aria-hidden="true">
        {STAGE_KEYS.map((key) => {
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
