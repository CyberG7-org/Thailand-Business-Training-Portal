/** What counts as a card done (policy `study_completion_tracking`). */
export type StudyTracking = 'viewed' | 'completed';

/** A learner's mark on one card: opened, and completed when they said so. */
export type CardProgress = { material_id: string; completed_at: string | null };

/** An active card and the languages it is written in. */
export type StudyCard = { id: string; languages: readonly string[] };

/** Opened is enough under "viewed"; under "completed" the learner must have marked it. */
export function isCardDone(progress: CardProgress | undefined, tracking: StudyTracking): boolean {
  if (!progress) return false;
  return tracking === 'viewed' || progress.completed_at !== null;
}

/**
 * Study is done when there is something to study and every card the learner can read is done —
 * what the study list shows as "all cards done", and what the steps then call Done. A card not
 * written in the learner's language cannot be opened in it, so it is not waited for.
 */
export function isStudyComplete(
  cards: readonly StudyCard[],
  progress: readonly CardProgress[],
  tracking: StudyTracking,
  language: string,
): boolean {
  const readable = cards.filter((c) => c.languages.includes(language));
  if (readable.length === 0) return false;
  const mine = new Map(progress.map((p) => [p.material_id, p]));
  return readable.every((c) => isCardDone(mine.get(c.id), tracking));
}
