import { STAGE_KEYS, type StageInfo, type StageKey } from './progression';

/**
 * The step the dashboard points the learner at: the one after the last step done, whatever
 * lies before it (a learner who passed the exam is not sent back to the study list). Null once
 * every step is done. A locked step can be current — the dashboard then says why it is closed.
 */
export function currentStage(statuses: Record<StageKey, StageInfo>): StageKey | null {
  let lastDone = -1;
  STAGE_KEYS.forEach((key, i) => {
    if (statuses[key].status === 'done') lastDone = i;
  });
  return STAGE_KEYS[lastDone + 1] ?? null;
}

/** How many of the five steps are done, for the progress ring. */
export function doneCount(statuses: Record<StageKey, StageInfo>): number {
  return STAGE_KEYS.filter((key) => statuses[key].status === 'done').length;
}
