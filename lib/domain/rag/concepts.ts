import { BANK_INTERVIEW_CONCEPTS, type ConceptGroup } from '@/lib/domain/bank-interview';

export const CONCEPT_GROUPS: ConceptGroup[] = [
  'identity',
  'ownership',
  'business_plan',
  'personal',
];

/** One Thai query per concept of a group — the bank's own questions are the best retrieval keys. */
export function conceptQueries(group: ConceptGroup): string[] {
  return BANK_INTERVIEW_CONCEPTS.filter((c) => c.group === group).map((c) => c.question.th);
}

/** A group's questions as one query; the generator retrieves once per group (spec §8). */
export function conceptGroupQuery(group: ConceptGroup): string {
  return conceptQueries(group).join(' ');
}
