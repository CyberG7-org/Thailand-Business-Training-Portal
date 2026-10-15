import type { StageInfo, StageKey } from './progression';

/**
 * The learner-facing order: Study, Quiz, Interview, Namecard, then the manager-owned bank
 * appointment. The practice round is still computed (`stageStatuses` keeps every key) but is
 * not one of these steps. Namecard remains standalone rather than gating the interview (D88).
 */
export const LEARNER_STAGES: readonly StageKey[] = [
  'study',
  'exam',
  'interview',
  'nameCard',
  'appointment',
];

/**
 * Point to the step after the last completed milestone, without sending a learner who passed
 * the Quiz back to Study. Namecard may be generated before the learner reaches it, so its
 * completion must never skip an unfinished Quiz or Interview. A locked step can be current;
 * the dashboard then explains why it is closed.
 */
export function currentStage(statuses: Record<StageKey, StageInfo>): StageKey | null {
  let lastDone = -1;
  LEARNER_STAGES.forEach((key, i) => {
    if (key !== 'nameCard' && statuses[key].status === 'done') lastDone = i;
  });
  return LEARNER_STAGES.slice(lastDone + 1).find((key) => statuses[key].status !== 'done') ?? null;
}

/** How many of the learner's steps are done, for the progress ring. */
export function doneCount(statuses: Record<StageKey, StageInfo>): number {
  return LEARNER_STAGES.filter((key) => statuses[key].status === 'done').length;
}
