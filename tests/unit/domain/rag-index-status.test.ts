import { describe, expect, it } from 'vitest';
import { canRequestIndex, INDEX_STATUSES } from '@/lib/domain/rag/index-status';

describe('canRequestIndex', () => {
  it('lets an admin index anything that is not currently being worked on', () => {
    expect(canRequestIndex('none')).toBe(true); // uploaded before P14
    expect(canRequestIndex('skipped')).toBe(true); // uploaded while the provider was off
    expect(canRequestIndex('failed')).toBe(true);
    expect(canRequestIndex('ready')).toBe(true);
  });

  it('refuses while a job is queued or running (a stale tab must not reset live work)', () => {
    expect(canRequestIndex('queued')).toBe(false);
    expect(canRequestIndex('indexing')).toBe(false);
  });

  it('lists every status the database allows', () => {
    expect([...INDEX_STATUSES].sort()).toEqual(
      ['failed', 'indexing', 'none', 'queued', 'ready', 'skipped'].sort(),
    );
  });
});
