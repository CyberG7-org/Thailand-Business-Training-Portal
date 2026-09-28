/** The concept the officer asks about next, kept on the bubble for the suite and the debrief. */
export function nextConcept(assessment: unknown): string | null {
  const next = (assessment as { next?: { concept?: string } } | null)?.next;
  return next && typeof next.concept === 'string' ? next.concept : null;
}
