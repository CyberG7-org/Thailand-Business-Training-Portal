import type { EligibilityWindow } from './eligibility';
import type { ISODate } from './thai-date';

/** PRD §8 states plus UNASSIGNED, with the interview and appointment states of P16. */
export type ProgressionState =
  | 'UNASSIGNED'
  | 'PROVISIONED'
  | 'LEARNING'
  | 'EXAM_PENDING'
  | 'EXAM_PASSED'
  | 'INTERVIEW_STARTED'
  | 'INTERVIEW_READY'
  | 'WAITING_BANK_ELIGIBILITY'
  | 'BANK_ELIGIBLE'
  | 'APPOINTMENT_BOOKED';

export type ProgressionFacts = {
  hasActiveAssignment: boolean;
  studyOpened: boolean;
  /** Every card the learner can see is done, as the study list counts it. */
  studyComplete: boolean;
  quizAttempts: number;
  examSubmitted: number;
  /** Already evaluated against policy_config.exam_pass_rule by the loader. */
  examPassed: boolean;
  nameCardCreated: boolean;
  eligibility: EligibilityWindow | null;
  today: ISODate;
  /** Readiness interviews (P16): how many were held, and whether one ended ready. */
  interviewSessions: number;
  interviewReady: boolean;
  /** An upcoming booked appointment (P16b); false until that slice lands. */
  appointmentBooked: boolean;
  policy: { requireExamPassForInterview: boolean; requireExamPassForNameCard: boolean };
};

export type StageKey = 'study' | 'quiz' | 'exam' | 'nameCard' | 'interview' | 'appointment';
export type StageStatus = 'locked' | 'pending' | 'available' | 'in_progress' | 'done';
export type StageReason =
  | 'no_assignment'
  | 'exam_required'
  | 'interview_required'
  | 'before_available_from'
  | 'expired'
  | 'missing_issue_date';
export type StageInfo = { status: StageStatus; reason?: StageReason };

export const STAGE_KEYS: readonly StageKey[] = [
  'study',
  'quiz',
  'exam',
  'nameCard',
  'interview',
  'appointment',
];

/** The readiness interview opens once the exam is passed (policy) and stays open for practice. */
function interviewGate(f: ProgressionFacts): StageInfo {
  if (!f.hasActiveAssignment) return { status: 'locked', reason: 'no_assignment' };
  if (f.policy.requireExamPassForInterview && !f.examPassed) {
    return { status: 'locked', reason: 'exam_required' };
  }
  if (f.interviewReady) return { status: 'done' };
  if (f.interviewSessions > 0) return { status: 'in_progress' };
  return { status: 'available' };
}

/** D102: a manager may choose a date once the learner passed both evaluations. */
function appointmentGate(f: ProgressionFacts): StageInfo {
  if (!f.hasActiveAssignment) return { status: 'locked', reason: 'no_assignment' };
  if (!f.examPassed) return { status: 'locked', reason: 'exam_required' };
  if (!f.interviewReady) return { status: 'locked', reason: 'interview_required' };
  if (f.appointmentBooked) return { status: 'done' };
  return { status: 'available' };
}

/** Eligibility and readiness are independent conditions; the state is derived every read. */
export function deriveProgression(f: ProgressionFacts): ProgressionState {
  if (!f.hasActiveAssignment) return 'UNASSIGNED';
  if (f.appointmentBooked) return 'APPOINTMENT_BOOKED';
  if (f.interviewReady) {
    return f.examPassed ? 'BANK_ELIGIBLE' : 'INTERVIEW_READY';
  }
  if (f.interviewSessions > 0) return 'INTERVIEW_STARTED';
  if (f.examPassed) return 'EXAM_PASSED';
  if (f.examSubmitted > 0) return 'EXAM_PENDING';
  if (f.studyOpened || f.quizAttempts > 0) return 'LEARNING';
  return 'PROVISIONED';
}

export function stageStatuses(f: ProgressionFacts): Record<StageKey, StageInfo> {
  if (!f.hasActiveAssignment) {
    const locked: StageInfo = { status: 'locked', reason: 'no_assignment' };
    return {
      study: locked,
      quiz: locked,
      exam: locked,
      nameCard: locked,
      interview: locked,
      appointment: locked,
    };
  }
  const study: StageInfo = {
    status: f.studyComplete ? 'done' : f.studyOpened ? 'in_progress' : 'available',
  };
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
  return {
    study,
    quiz,
    exam,
    nameCard,
    interview: interviewGate(f),
    appointment: appointmentGate(f),
  };
}
