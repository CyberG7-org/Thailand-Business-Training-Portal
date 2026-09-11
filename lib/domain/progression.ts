import { isBankStageOpen, type EligibilityWindow } from './eligibility';
import type { ISODate } from './thai-date';

/** PRD §8 states plus UNASSIGNED (the PRD's list starts at "DBD is assigned"). */
export type ProgressionState =
  | 'UNASSIGNED'
  | 'PROVISIONED'
  | 'LEARNING'
  | 'EXAM_PENDING'
  | 'EXAM_PASSED'
  | 'WAITING_BANK_ELIGIBILITY'
  | 'BANK_ELIGIBLE'
  | 'CALL_TRAINING_STARTED'
  | 'CALL_TRAINING_COMPLETED';

export type ProgressionFacts = {
  hasActiveAssignment: boolean;
  studyOpened: boolean;
  quizAttempts: number;
  examSubmitted: number;
  /** Already evaluated against policy_config.exam_pass_rule by the loader. */
  examPassed: boolean;
  nameCardCreated: boolean;
  eligibility: EligibilityWindow | null;
  today: ISODate;
  callSessions: number;
  callsCompleted: number;
  policy: { requireExamPassForBankCall: boolean; requireExamPassForNameCard: boolean };
};

export type StageKey = 'study' | 'quiz' | 'exam' | 'nameCard' | 'bank';
export type StageStatus = 'locked' | 'pending' | 'available' | 'in_progress' | 'done';
export type StageReason =
  'no_assignment' | 'exam_required' | 'before_available_from' | 'expired' | 'missing_issue_date';
export type StageInfo = { status: StageStatus; reason?: StageReason };

export const STAGE_KEYS: readonly StageKey[] = ['study', 'quiz', 'exam', 'nameCard', 'bank'];

function bankGate(f: ProgressionFacts): StageInfo {
  if (!f.hasActiveAssignment) return { status: 'locked', reason: 'no_assignment' };
  if (f.policy.requireExamPassForBankCall && !f.examPassed) {
    return { status: 'locked', reason: 'exam_required' };
  }
  if (!f.eligibility) return { status: 'pending', reason: 'missing_issue_date' };
  if (f.today < f.eligibility.availableFrom) {
    return { status: 'locked', reason: 'before_available_from' };
  }
  if (!isBankStageOpen(f.eligibility, f.today)) return { status: 'locked', reason: 'expired' };
  if (f.callsCompleted > 0) return { status: 'done' };
  if (f.callSessions > 0) return { status: 'in_progress' };
  return { status: 'available' };
}

/** Eligibility and exam pass are independent conditions (PRD §8 note); the state is derived every read. */
export function deriveProgression(f: ProgressionFacts): ProgressionState {
  if (!f.hasActiveAssignment) return 'UNASSIGNED';
  if (f.callsCompleted > 0) return 'CALL_TRAINING_COMPLETED';
  if (f.callSessions > 0) return 'CALL_TRAINING_STARTED';
  const bank = bankGate(f);
  if (bank.status === 'available') return 'BANK_ELIGIBLE';
  if (f.examPassed) {
    return f.eligibility && bank.reason !== 'expired' ? 'WAITING_BANK_ELIGIBILITY' : 'EXAM_PASSED';
  }
  if (f.examSubmitted > 0) return 'EXAM_PENDING';
  if (f.studyOpened || f.quizAttempts > 0) return 'LEARNING';
  return 'PROVISIONED';
}

export function stageStatuses(f: ProgressionFacts): Record<StageKey, StageInfo> {
  if (!f.hasActiveAssignment) {
    const locked: StageInfo = { status: 'locked', reason: 'no_assignment' };
    return { study: locked, quiz: locked, exam: locked, nameCard: locked, bank: locked };
  }
  const study: StageInfo = { status: f.studyOpened ? 'in_progress' : 'available' };
  const quiz: StageInfo = { status: f.quizAttempts > 0 ? 'done' : 'available' };
  const exam: StageInfo = {
    status: f.examPassed ? 'done' : f.examSubmitted > 0 ? 'in_progress' : 'available',
  };
  let nameCard: StageInfo;
  if (f.policy.requireExamPassForNameCard && !f.examPassed) {
    nameCard = { status: 'locked', reason: 'exam_required' };
  } else {
    nameCard = { status: f.nameCardCreated ? 'done' : 'available' };
  }
  return { study, quiz, exam, nameCard, bank: bankGate(f) };
}
