import { describe, expect, it } from 'vitest';
import type { StageInfo, StageKey, StageStatus } from '@/lib/domain/progression';
import { currentStage, doneCount } from '@/lib/domain/stage-progress';

const statuses = (o: Partial<Record<StageKey, StageStatus>>): Record<StageKey, StageInfo> => ({
  study: { status: o.study ?? 'available' },
  quiz: { status: o.quiz ?? 'available' },
  exam: { status: o.exam ?? 'available' },
  nameCard: { status: o.nameCard ?? 'available' },
  interview: { status: o.interview ?? 'locked' },
  appointment: { status: o.appointment ?? 'locked' },
});

/** The dashboard's "next step" is the step after the last one done, whatever lies before it. */
describe('currentStage', () => {
  it('is the first step for a learner who has done nothing', () => {
    expect(currentStage(statuses({}))).toBe('study');
  });

  it('is the step after the last one done, even when earlier steps were skipped', () => {
    expect(currentStage(statuses({ exam: 'done' }))).toBe('nameCard');
  });

  it('is the locked interview step once everything before it is done', () => {
    expect(
      currentStage(statuses({ study: 'done', quiz: 'done', exam: 'done', nameCard: 'done' })),
    ).toBe('interview');
  });

  it('is nothing once every step is done', () => {
    expect(
      currentStage(
        statuses({
          study: 'done',
          quiz: 'done',
          exam: 'done',
          nameCard: 'done',
          interview: 'done',
          appointment: 'done',
        }),
      ),
    ).toBeNull();
  });
});

describe('doneCount', () => {
  it('counts the steps done', () => {
    expect(doneCount(statuses({ quiz: 'done', exam: 'done' }))).toBe(2);
    expect(doneCount(statuses({}))).toBe(0);
  });
});
