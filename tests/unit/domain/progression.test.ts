import { describe, expect, it } from 'vitest';
import {
  STAGE_KEYS,
  deriveProgression,
  stageStatuses,
  type ProgressionFacts,
} from '@/lib/domain/progression';

const base: ProgressionFacts = {
  hasActiveAssignment: true,
  studyOpened: false,
  quizAttempts: 0,
  examSubmitted: 0,
  examPassed: false,
  nameCardCreated: false,
  eligibility: { availableFrom: '2026-10-27', expiresAt: null },
  today: '2026-09-28',
  interviewSessions: 0,
  interviewReady: false,
  appointmentBooked: false,
  policy: { requireExamPassForInterview: true, requireExamPassForNameCard: false },
};
const passed: ProgressionFacts = { ...base, examSubmitted: 1, examPassed: true };

describe('STAGE_KEYS', () => {
  it('is the six steps in order', () => {
    expect(STAGE_KEYS).toEqual(['study', 'quiz', 'exam', 'nameCard', 'interview', 'appointment']);
  });
});

describe('stageStatuses', () => {
  it('locks every step without an assignment', () => {
    const s = stageStatuses({ ...base, hasActiveAssignment: false });
    for (const key of STAGE_KEYS) {
      expect(s[key]).toEqual({ status: 'locked', reason: 'no_assignment' });
    }
  });

  it('opens study, quiz, exam and name card on assignment; the interview waits for the exam', () => {
    const s = stageStatuses(base);
    expect(s.study.status).toBe('available');
    expect(s.quiz.status).toBe('available');
    expect(s.exam.status).toBe('available');
    expect(s.nameCard.status).toBe('available');
    expect(s.interview).toEqual({ status: 'locked', reason: 'exam_required' });
    expect(s.appointment).toEqual({ status: 'locked', reason: 'interview_required' });
  });

  it('opens the interview at once when the policy does not require the exam', () => {
    const s = stageStatuses({
      ...base,
      policy: { ...base.policy, requireExamPassForInterview: false },
    });
    expect(s.interview.status).toBe('available');
  });

  it('opens the interview after the exam and tracks its sessions', () => {
    expect(stageStatuses(passed).interview.status).toBe('available');
    expect(stageStatuses({ ...passed, interviewSessions: 2 }).interview.status).toBe(
      'in_progress',
    );
    expect(
      stageStatuses({ ...passed, interviewSessions: 2, interviewReady: true }).interview,
    ).toEqual({ status: 'done' });
  });

  it('holds the appointment until the learner is ready, then until the eligibility date', () => {
    const ready = { ...passed, interviewSessions: 1, interviewReady: true };
    expect(stageStatuses(passed).appointment).toEqual({
      status: 'locked',
      reason: 'interview_required',
    });
    expect(stageStatuses(ready).appointment).toEqual({
      status: 'locked',
      reason: 'before_available_from',
    });
    expect(stageStatuses({ ...ready, today: '2026-10-27' }).appointment.status).toBe('available');
    expect(
      stageStatuses({ ...ready, today: '2026-10-27', appointmentBooked: true }).appointment,
    ).toEqual({ status: 'done' });
  });

  it('reports a pending appointment when the issue date is missing', () => {
    const s = stageStatuses({ ...passed, interviewReady: true, eligibility: null });
    expect(s.appointment).toEqual({ status: 'pending', reason: 'missing_issue_date' });
  });

  it('locks the appointment once the access window has expired', () => {
    const s = stageStatuses({
      ...passed,
      interviewReady: true,
      eligibility: { availableFrom: '2026-08-01', expiresAt: '2026-09-01' },
    });
    expect(s.appointment).toEqual({ status: 'locked', reason: 'expired' });
  });
});

describe('deriveProgression', () => {
  it('walks the states in order', () => {
    expect(deriveProgression({ ...base, hasActiveAssignment: false })).toBe('UNASSIGNED');
    expect(deriveProgression(base)).toBe('PROVISIONED');
    expect(deriveProgression({ ...base, studyOpened: true })).toBe('LEARNING');
    expect(deriveProgression({ ...base, examSubmitted: 1 })).toBe('EXAM_PENDING');
    expect(deriveProgression(passed)).toBe('EXAM_PASSED');
    expect(deriveProgression({ ...passed, interviewSessions: 1 })).toBe('INTERVIEW_STARTED');
    expect(deriveProgression({ ...passed, interviewSessions: 1, interviewReady: true })).toBe(
      'WAITING_BANK_ELIGIBILITY',
    );
    expect(deriveProgression({ ...passed, interviewReady: true, today: '2026-10-27' })).toBe(
      'BANK_ELIGIBLE',
    );
    expect(
      deriveProgression({
        ...passed,
        interviewReady: true,
        today: '2026-10-27',
        appointmentBooked: true,
      }),
    ).toBe('APPOINTMENT_BOOKED');
  });

  it('reports INTERVIEW_READY when the window has expired', () => {
    expect(
      deriveProgression({
        ...passed,
        interviewReady: true,
        eligibility: { availableFrom: '2026-08-01', expiresAt: '2026-09-01' },
      }),
    ).toBe('INTERVIEW_READY');
  });
});
