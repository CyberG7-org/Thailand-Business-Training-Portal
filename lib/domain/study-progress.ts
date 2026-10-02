/** What counts as a card done (policy `study_completion_tracking`). */
export type StudyTracking = 'viewed' | 'completed';

/** A learner's mark on one card: opened, and completed when they said so. */
export type CardProgress = { material_id: string; completed_at: string | null };

/** Opened is enough under "viewed"; under "completed" the learner must have marked it. */
export function isCardDone(progress: CardProgress | undefined, tracking: StudyTracking): boolean {
  if (!progress) return false;
  return tracking === 'viewed' || progress.completed_at !== null;
}

/**
 * Study is done when there is something to study and every card the learner can see is done —
 * what the study list shows as "all cards done", and what the steps then call Done.
 */
export function isStudyComplete(
  materialIds: readonly string[],
  progress: readonly CardProgress[],
  tracking: StudyTracking,
): boolean {
  if (materialIds.length === 0) return false;
  const mine = new Map(progress.map((p) => [p.material_id, p]));
  return materialIds.every((id) => isCardDone(mine.get(id), tracking));
}
