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
  const all = (id: string) => ({ id, languages: ['th', 'en', 'zh'] });

  it('is done once every card is, and not while one is left', () => {
    const cards = [all('a'), all('b')];
    expect(isStudyComplete(cards, [opened('a'), opened('b')], 'viewed', 'th')).toBe(true);
    expect(isStudyComplete(cards, [opened('a')], 'viewed', 'th')).toBe(false);
    expect(isStudyComplete(cards, [completed('a'), opened('b')], 'completed', 'th')).toBe(false);
    expect(isStudyComplete(cards, [completed('a'), completed('b')], 'completed', 'th')).toBe(true);
  });

  it('does not wait for a card the learner cannot open in their language', () => {
    // The seeded sample card has no Chinese: a Chinese reader can never open it.
    const cards = [all('a'), { id: 'thai-only', languages: ['th', 'en'] }];
    expect(isStudyComplete(cards, [opened('a')], 'viewed', 'zh')).toBe(true);
    expect(isStudyComplete(cards, [opened('a')], 'viewed', 'th')).toBe(false);
  });

  it('ignores marks on cards no longer studied, and is never done with nothing to read', () => {
    expect(isStudyComplete([all('a')], [opened('a'), opened('gone')], 'viewed', 'th')).toBe(true);
    expect(isStudyComplete([], [opened('a')], 'viewed', 'th')).toBe(false);
    expect(isStudyComplete([{ id: 'a', languages: ['th'] }], [opened('a')], 'viewed', 'zh')).toBe(
      false,
    );
  });
});
