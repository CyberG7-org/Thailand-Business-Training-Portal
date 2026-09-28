import { BANK_INTERVIEW_CARDS } from '@/lib/content/bank-interview-cards';
import { BANK_INTERVIEW_CONCEPTS } from '@/lib/domain/bank-interview';
import { CORE_CONCEPTS, JURISTIC_ID_CONCEPT } from './plan';
import type { Assessment, CloseReason, ConceptId, InterviewPlan, SessionVerdict } from './types';

const BUSINESS_CONCEPT: ConceptId = 'business_activity';
const MAX_EVASIONS = 1;

/** The last word on each concept wins: a partial answer corrected later is correct. */
export function latestAssessments(assessments: Assessment[]): Map<ConceptId, Assessment> {
  const latest = new Map<ConceptId, Assessment>();
  for (const a of assessments) latest.set(a.concept, a);
  return latest;
}

/** The study card that teaches a concept's group; the registration number belongs to identity. */
function cardFor(concept: ConceptId): string | null {
  const group =
    concept === JURISTIC_ID_CONCEPT
      ? 'identity'
      : BANK_INTERVIEW_CONCEPTS.find((c) => c.id === concept)?.group;
  return BANK_INTERVIEW_CARDS.find((c) => c.conceptGroup === group)?.contentKey ?? null;
}

/** Spec §4.4, as rules. The narrative is the model's and is added by the caller. */
export function decideVerdict(
  plan: InterviewPlan,
  assessments: Assessment[],
  close: CloseReason,
): Omit<SessionVerdict, 'narrative'> {
  const latest = latestAssessments(assessments);
  // One line per concept the officer actually judged, in the plan's order; a concept never
  // reached (the interview closed early) is not a verdict on the learner and is left out.
  const reasons = plan.items
    .filter((i) => i.phase === 'facts')
    .flatMap((i) => {
      const a = latest.get(i.concept);
      return a
        ? [{ concept: i.concept, verdict: a.verdict, note: a.note, cardKey: cardFor(i.concept) }]
        : [];
    });
  const planned = new Set(plan.items.map((i) => i.concept));
  const coreRight = CORE_CONCEPTS.filter((c) => planned.has(c)).every(
    (c) => latest.get(c)?.verdict === 'correct',
  );
  const business = latest.get(BUSINESS_CONCEPT)?.verdict;
  const businessOk =
    !planned.has(BUSINESS_CONCEPT) || business === 'correct' || business === 'partial';
  const evasions = assessments.filter((a) => a.verdict === 'evasive').length;
  const pastedLeft = [...latest.values()].some((a) => a.verdict === 'pasted');
  const ready =
    close === 'plan_complete' && coreRight && businessOk && evasions <= MAX_EVASIONS && !pastedLeft;
  return { verdict: ready ? 'ready' : 'not_ready', reasons };
}
