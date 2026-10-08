/** A concept the officer verifies: a BankInterviewConcept id, or the registration number. */
export type ConceptId = string;

/** TemplateRecord keys → display strings (Thai), assembled once per session. */
export type FactSheet = Record<string, string | null>;

export type Verdict = 'correct' | 'partial' | 'wrong' | 'evasive' | 'pasted' | 'off_topic';

export type Assessment = { concept: ConceptId; verdict: Verdict; note: string };

export type PlanItem = {
  concept: ConceptId;
  phase: 'facts' | 'probing';
  core: boolean;
  /** The Thai question the fake officer asks; the model phrases its own. */
  question: string;
  /** The record's value(s) for the concept, joined with " / "; a concept without one is not asked. */
  expected: string;
  attempts: number;
};

export type InterviewPlan = {
  /** Missing means the historic v1 plan already stored in production. */
  version?: 1 | 2;
  /** V2 freezes its transparent threshold on the session. */
  passScore?: number;
  items: PlanItem[];
  cursor: number;
};

export type CloseReason =
  'plan_complete' | 'too_many_evasions' | 'off_topic_limit' | 'learner_ended' | 'turn_limit';

export type OfficerTurn = {
  say: string;
  assessment: Assessment | null;
  next: { concept: ConceptId } | { close: CloseReason };
};

export type Turn = {
  role: 'officer' | 'learner';
  content: string;
  assessment?: Assessment | null;
};

export type VerdictReason = {
  concept: ConceptId;
  verdict: Verdict;
  note: string;
  cardKey: string | null;
};

export type SessionVerdict = {
  verdict: 'ready' | 'not_ready';
  reasons: VerdictReason[];
  score?: number;
  maxScore?: number;
  passScore?: number;
  narrative: string;
};
