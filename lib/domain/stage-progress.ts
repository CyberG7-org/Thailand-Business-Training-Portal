import type { StageInfo, StageKey } from './progression';

/**
 * The five steps a learner sees, in the order they see them (the owner, 2026-10-01): Study
 * material, Name card, Business Knowledge Quiz, Bank Readiness Interview, Bank appointment. The
 * practice round is still computed (`stageStatuses` keeps every key) but is not one of their
 * steps, and the name card is listed second without becoming a gate — it stays standalone
 * (D88).
 */
export const LEARNER_STAGES: readonly StageKey[] = [
  'study',
  'nameCard',
  'exam',
  'interview',
  'appointment',
];

/**
 * The step the dashboard points the learner at: the one after the last step done, whatever
 * lies before it (a learner who passed the quiz is not sent back to the study list). Null once
 * every step is done. A locked step can be current — the dashboard then says why it is closed.
 */
export function currentStage(statuses: Record<StageKey, StageInfo>): StageKey | null {
  let lastDone = -1;
  LEARNER_STAGES.forEach((key, i) => {
    if (statuses[key].status === 'done') lastDone = i;
  });
  return LEARNER_STAGES[lastDone + 1] ?? null;
}

/** How many of the learner's steps are done, for the progress ring. */
export function doneCount(statuses: Record<StageKey, StageInfo>): number {
  return LEARNER_STAGES.filter((key) => statuses[key].status === 'done').length;
}
