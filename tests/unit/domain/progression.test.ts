import { describe, expect, it } from 'vitest';
import { deriveProgression, stageStatuses, type ProgressionFacts } from '@/lib/domain/progression';

const base: ProgressionFacts = {
  hasActiveAssignment: true,
  studyOpened: false,
  quizAttempts: 0,
  examSubmitted: 0,
  examPassed: false,
  nameCardCreated: false,
  eligibility: { availableFrom: '2026-10-26', expiresAt: null },
  today: '2026-09-11',
  callSessions: 0,
  callsCompleted: 0,
  policy: { requireExamPassForBankCall: true, requireExamPassForNameCard: false },
};

describe('deriveProgression', () => {
  it('is UNASSIGNED without an active assignment', () => {
    expect(deriveProgression({ ...base, hasActiveAssignment: false })).toBe('UNASSIGNED');
  });
  it('is PROVISIONED when assigned with no activity', () => {
    expect(deriveProgression(base)).toBe('PROVISIONED');
  });
  it('is LEARNING once study material is opened or a quiz is attempted', () => {
    expect(deriveProgression({ ...base, studyOpened: true })).toBe('LEARNING');
    expect(deriveProgression({ ...base, quizAttempts: 2 })).toBe('LEARNING');
  });
  it('is EXAM_PENDING after a failed exam attempt', () => {
    expect(deriveProgression({ ...base, examSubmitted: 1, examPassed: false })).toBe(
      'EXAM_PENDING',
    );
  });
  it('is WAITING_BANK_ELIGIBILITY when passed but before the available date', () => {
    expect(deriveProgression({ ...base, examSubmitted: 1, examPassed: true })).toBe(
      'WAITING_BANK_ELIGIBILITY',
    );
  });
  it('is BANK_ELIGIBLE when passed and the date has been reached', () => {
    expect(
      deriveProgression({ ...base, examSubmitted: 1, examPassed: true, today: '2026-10-26' }),
    ).toBe('BANK_ELIGIBLE');
  });
  it('is EXAM_PASSED when passed but no eligibility snapshot exists (issue date missing)', () => {
    expect(
      deriveProgression({ ...base, examSubmitted: 1, examPassed: true, eligibility: null }),
    ).toBe('EXAM_PASSED');
  });
  it('is BANK_ELIGIBLE without an exam pass when policy does not require it', () => {
    expect(
      deriveProgression({
        ...base,
        today: '2026-10-26',
        policy: { ...base.policy, requireExamPassForBankCall: false },
      }),
    ).toBe('BANK_ELIGIBLE');
  });
  it('tracks call training sessions', () => {
    const eligible = { ...base, examSubmitted: 1, examPassed: true, today: '2026-11-01' };
    expect(deriveProgression({ ...eligible, callSessions: 1 })).toBe('CALL_TRAINING_STARTED');
    expect(deriveProgression({ ...eligible, callSessions: 2, callsCompleted: 1 })).toBe(
      'CALL_TRAINING_COMPLETED',
    );
  });
});

describe('stageStatuses', () => {
  it('locks everything without an assignment', () => {
    const s = stageStatuses({ ...base, hasActiveAssignment: false });
    for (const key of ['study', 'quiz', 'exam', 'nameCard', 'bank'] as const) {
      expect(s[key]).toEqual({ status: 'locked', reason: 'no_assignment' });
    }
  });
  it('opens study, quiz, exam and name card for a fresh assignment; bank waits for the exam', () => {
    const s = stageStatuses(base);
    expect(s.study.status).toBe('available');
    expect(s.quiz.status).toBe('available');
    expect(s.exam.status).toBe('available');
    expect(s.nameCard.status).toBe('available');
    expect(s.bank).toEqual({ status: 'locked', reason: 'exam_required' });
  });
  it('locks the bank stage until the available date once the exam is passed', () => {
    const s = stageStatuses({ ...base, examSubmitted: 1, examPassed: true });
    expect(s.exam.status).toBe('done');
    expect(s.bank).toEqual({ status: 'locked', reason: 'before_available_from' });
    expect(
      stageStatuses({ ...base, examSubmitted: 1, examPassed: true, today: '2026-10-26' }).bank,
    ).toEqual({
      status: 'available',
    });
  });
  it('reports a pending bank stage when the issue date is missing', () => {
    const s = stageStatuses({ ...base, examSubmitted: 1, examPassed: true, eligibility: null });
    expect(s.bank).toEqual({ status: 'pending', reason: 'missing_issue_date' });
  });
  it('reports expiry', () => {
    const s = stageStatuses({
      ...base,
      examSubmitted: 1,
      examPassed: true,
      eligibility: { availableFrom: '2026-10-26', expiresAt: '2026-12-31' },
      today: '2027-01-01',
    });
    expect(s.bank).toEqual({ status: 'locked', reason: 'expired' });
  });
  it('gates the name card on the exam when policy says so', () => {
    const s = stageStatuses({
      ...base,
      policy: { ...base.policy, requireExamPassForNameCard: true },
    });
    expect(s.nameCard).toEqual({ status: 'locked', reason: 'exam_required' });
    expect(stageStatuses({ ...base, nameCardCreated: true }).nameCard).toEqual({ status: 'done' });
  });
  it('shows progress on study, quiz, exam attempts and calls', () => {
    const s = stageStatuses({
      ...base,
      studyOpened: true,
      quizAttempts: 1,
      examSubmitted: 1,
      examPassed: true,
      today: '2026-11-01',
      callSessions: 1,
    });
    expect(s.study.status).toBe('in_progress');
    expect(s.quiz.status).toBe('done');
    expect(s.bank.status).toBe('in_progress');
    expect(stageStatuses({ ...base, examSubmitted: 2 }).exam.status).toBe('in_progress');
  });
});
