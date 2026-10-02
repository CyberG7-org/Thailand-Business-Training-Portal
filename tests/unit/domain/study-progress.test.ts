import { describe, expect, it } from 'vitest';
import { isCardDone, isStudyComplete } from '@/lib/domain/study-progress';

const opened = (id: string) => ({ material_id: id, completed_at: null });
const completed = (id: string) => ({ material_id: id, completed_at: '2026-10-02T03:00:00Z' });

describe('isCardDone', () => {
  it('counts an opened card under "viewed", and only a completed one under "completed"', () => {
    expect(isCardDone(opened('a'), 'viewed')).toBe(true);
    expect(isCardDone(opened('a'), 'completed')).toBe(false);
    expect(isCardDone(completed('a'), 'completed')).toBe(true);
    expect(isCardDone(undefined, 'viewed')).toBe(false);
  });
});

/** The study list's "all cards done" is what the steps call Done (the owner, 2026-10-02). */
describe('isStudyComplete', () => {
  it('is done once every card is, and not while one is left', () => {
    expect(isStudyComplete(['a', 'b'], [opened('a'), opened('b')], 'viewed')).toBe(true);
    expect(isStudyComplete(['a', 'b'], [opened('a')], 'viewed')).toBe(false);
    expect(isStudyComplete(['a', 'b'], [completed('a'), opened('b')], 'completed')).toBe(false);
    expect(isStudyComplete(['a', 'b'], [completed('a'), completed('b')], 'completed')).toBe(true);
  });

  it('ignores marks on cards no longer studied, and is never done with nothing to study', () => {
    expect(isStudyComplete(['a'], [opened('a'), opened('gone')], 'viewed')).toBe(true);
    expect(isStudyComplete([], [opened('a')], 'viewed')).toBe(false);
  });
});
