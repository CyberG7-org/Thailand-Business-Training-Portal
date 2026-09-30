import { describe, expect, it } from 'vitest';
import { inChunks } from '@/lib/db/chunks';

/** Long id lists are read a slice at a time, so no `.in()` URL grows past the gateway's limit. */
describe('inChunks', () => {
  it('asks once per slice and keeps the rows in order', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const asked: number[] = [];
    const rows = await inChunks(ids, async (chunk) => {
      asked.push(chunk.length);
      return chunk.map((id) => ({ id }));
    });
    expect(asked).toEqual([100, 100, 50]);
    expect(rows.map((r) => r.id)).toEqual(ids);
  });

  it('asks nothing for no ids', async () => {
    let calls = 0;
    expect(
      await inChunks([], async () => {
        calls++;
        return [];
      }),
    ).toEqual([]);
    expect(calls).toBe(0);
  });
});
