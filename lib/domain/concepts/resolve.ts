import type { FactKey, FactSheet } from '@/lib/domain/facts/fact-sheet';
import { STANDARD_ANSWER_SOURCES, type StandardAnswerField } from '@/lib/domain/standard-answers';
import { EVALUATION_CONCEPTS, type ConceptDef } from './registry';

/**
 * resolved — every fact present; policy — a KYC_POLICY answer, always ready and never an
 * exception (D74); per_learner — a ROLE concept, which a company record never counts;
 * missing — facts named.
 */
export type ConceptStatus = 'resolved' | 'policy' | 'missing' | 'per_learner';
export type ConceptResolution = { key: string; status: ConceptStatus; missing: FactKey[] };
/**
 * company — a record or a training version: 29 MCQ and 10 chatbot company-level concepts.
 * assignment — one learner: all 30 and 11, their ROLE concepts included (D74, D91).
 */
export type Scope = 'company' | 'assignment';
export type CoverageCount = { ready: number; total: number };
export type Coverage = {
  scope: Scope;
  mcq: CoverageCount;
  interview: CoverageCount;
  /** Company scope: the ROLE concepts left to each learner's assignment (not counted). */
  perLearner: string[];
  concepts: ConceptResolution[];
  /**
   * Every fact some concept is missing, in registry order, once each — as a person can fix it:
   * a standard answer (D91) whose source is missing too is left out, because the source is
   * already in the list and nobody types the answer itself.
   */
  missingFacts: FactKey[];
};

/** Present: text non-blank, list non-empty, a stated yes/no, a number set, an address resolved. */
export function isPresent(facts: FactSheet, key: FactKey): boolean {
  const value = facts[key];
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (key === 'address') return facts.address?.status === 'resolved';
  return true;
}

export function resolveConcept(def: ConceptDef, facts: FactSheet, scope: Scope): ConceptResolution {
  if (def.source === 'KYC_POLICY') return { key: def.key, status: 'policy', missing: [] };
  if (def.source === 'ROLE' && scope === 'company') {
    return { key: def.key, status: 'per_learner', missing: [] };
  }
  const missing: FactKey[] = [...def.facts, ...def.alternateWhen].filter(
    (k) => !isPresent(facts, k),
  );
  // A shareholder's holding needs an amount the list actually gives (spec §7.3).
  if (
    def.answer === 'shareholding' &&
    missing.length === 0 &&
    facts.learner_is_shareholder === true &&
    facts.my_shares === null &&
    facts.my_share_percent === null
  ) {
    missing.push('shareholders');
  }
  const unique = [...new Set(missing)];
  return { key: def.key, status: unique.length > 0 ? 'missing' : 'resolved', missing: unique };
}

/** A per-learner concept is neither ready nor counted at company scope (D74). */
function count(resolutions: ConceptResolution[]): CoverageCount {
  const counted = resolutions.filter((r) => r.status !== 'per_learner');
  return {
    ready: counted.filter((r) => r.status === 'resolved' || r.status === 'policy').length,
    total: counted.length,
  };
}

export function conceptCoverage(
  facts: FactSheet,
  scope: Scope,
  concepts: readonly ConceptDef[] = EVALUATION_CONCEPTS,
): Coverage {
  const resolutions = concepts.map((def) => resolveConcept(def, facts, scope));
  const of = (pick: (d: ConceptDef) => boolean) => resolutions.filter((_, i) => pick(concepts[i]));
  const everyMissing: FactKey[] = [];
  for (const r of resolutions) {
    for (const f of r.missing) if (!everyMissing.includes(f)) everyMissing.push(f);
  }
  const missingFacts = everyMissing.filter((fact) => {
    const sources = STANDARD_ANSWER_SOURCES[fact as StandardAnswerField];
    return !sources?.some((s) => everyMissing.includes(s as FactKey));
  });
  return {
    scope,
    mcq: count(of((d) => d.mcqOrder !== null)),
    interview: count(of((d) => d.interviewSlot !== null)),
    perLearner: resolutions.filter((r) => r.status === 'per_learner').map((r) => r.key),
    concepts: resolutions,
    missingFacts,
  };
}
