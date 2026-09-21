import { describe, expect, it } from 'vitest';
import { planDirectRead } from '@/lib/domain/extraction-plan';

const MB = 1024 * 1024;

describe('planDirectRead', () => {
  it('keeps small and pre-P14 documents, defers documents over the page limit', () => {
    const plan = planDirectRead(
      [
        { id: 'cert', page_count: 3, size_bytes: 1 * MB },
        { id: 'old', page_count: null, size_bytes: 2 * MB },
        { id: 'list', page_count: 200, size_bytes: 9 * MB },
      ],
      { maxPages: 20, maxBytes: 30 * MB },
    );
    expect(plan).toEqual({ direct: ['cert', 'old'], deferred: ['list'] });
  });

  it('stops adding documents once the byte budget is spent, in upload order', () => {
    const plan = planDirectRead(
      [
        { id: 'a', page_count: 5, size_bytes: 20 * MB },
        { id: 'b', page_count: 5, size_bytes: 15 * MB },
        { id: 'c', page_count: 5, size_bytes: 1 * MB },
      ],
      { maxPages: 20, maxBytes: 30 * MB },
    );
    expect(plan).toEqual({ direct: ['a', 'c'], deferred: ['b'] });
  });

  it('uses the configured defaults', () => {
    expect(planDirectRead([{ id: 'x', page_count: 21, size_bytes: 1 }]).deferred).toEqual(['x']);
    expect(planDirectRead([{ id: 'x', page_count: 20, size_bytes: 1 }]).direct).toEqual(['x']);
  });
});
