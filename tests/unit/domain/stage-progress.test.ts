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

/** The owner's five learner steps (2026-10-01): the practice round is not one of them. */
describe('LEARNER_STAGES', () => {
  it('lists study, name card, the quiz, the interview and the appointment, in that order', () => {
    expect(LEARNER_STAGES).toEqual(['study', 'nameCard', 'exam', 'interview', 'appointment']);
    expect(LEARNER_STAGES).not.toContain('quiz');
  });
});

/** The dashboard's "next step" is the step after the last one done, whatever lies before it. */
describe('currentStage', () => {
  it('is the first step for a learner who has done nothing', () => {
    expect(currentStage(statuses({}))).toBe('study');
  });

  it('is the quiz once the name card is made', () => {
    expect(currentStage(statuses({ nameCard: 'done' }))).toBe('exam');
  });

  it('moves past a name card not yet made once the quiz is passed: the card is standalone', () => {
    expect(currentStage(statuses({ exam: 'done' }))).toBe('interview');
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
