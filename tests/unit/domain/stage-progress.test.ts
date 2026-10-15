import { describe, expect, it } from 'vitest';
import type { StageInfo, StageKey, StageStatus } from '@/lib/domain/progression';
import { LEARNER_STAGES, currentStage, doneCount } from '@/lib/domain/stage-progress';

const statuses = (o: Partial<Record<StageKey, StageStatus>>): Record<StageKey, StageInfo> => ({
  study: { status: o.study ?? 'available' },
  quiz: { status: o.quiz ?? 'available' },
  exam: { status: o.exam ?? 'available' },
  nameCard: { status: o.nameCard ?? 'available' },
  interview: { status: o.interview ?? 'locked' },
  appointment: { status: o.appointment ?? 'locked' },
});

/** The learner-facing steps; the practice round is not one of them. */
describe('LEARNER_STAGES', () => {
  it('lists Study, Quiz, Interview, Namecard and the appointment, in that order', () => {
    expect(LEARNER_STAGES).toEqual(['study', 'exam', 'interview', 'nameCard', 'appointment']);
    expect(LEARNER_STAGES).not.toContain('quiz');
  });
});

/** The dashboard's next step follows milestones without treating an early Namecard as progress. */
describe('currentStage', () => {
  it('is the first step for a learner who has done nothing', () => {
    expect(currentStage(statuses({}))).toBe('study');
  });

  it('still points at Study when the Namecard was generated early', () => {
    expect(currentStage(statuses({ nameCard: 'done' }))).toBe('study');
  });

  it('points at Quiz after Study even if the Namecard is already done', () => {
    expect(currentStage(statuses({ study: 'done', nameCard: 'done' }))).toBe('exam');
  });

  it('points at Interview after Quiz even if the Namecard is already done', () => {
    expect(currentStage(statuses({ exam: 'done', nameCard: 'done' }))).toBe('interview');
  });

  it('moves to Interview once the Quiz is passed even when Study is incomplete', () => {
    expect(currentStage(statuses({ exam: 'done' }))).toBe('interview');
  });

  it('points at Namecard after Interview when it has not been made', () => {
    expect(currentStage(statuses({ interview: 'done' }))).toBe('nameCard');
  });

  it('moves to the appointment after Interview when the Namecard is already done', () => {
    expect(currentStage(statuses({ interview: 'done', nameCard: 'done' }))).toBe('appointment');
  });

  it('ignores the practice round, which is not a learner step', () => {
    expect(currentStage(statuses({ quiz: 'done' }))).toBe('study');
  });

  it('is nothing once every step is done', () => {
    expect(
      currentStage(
        statuses({
          study: 'done',
          nameCard: 'done',
          exam: 'done',
          interview: 'done',
          appointment: 'done',
        }),
      ),
    ).toBeNull();
  });
});

describe('doneCount', () => {
  it('counts the learner steps done, never the practice round', () => {
    expect(doneCount(statuses({ quiz: 'done', exam: 'done' }))).toBe(1);
    expect(doneCount(statuses({ nameCard: 'done', exam: 'done', interview: 'done' }))).toBe(3);
    expect(doneCount(statuses({}))).toBe(0);
  });
});
