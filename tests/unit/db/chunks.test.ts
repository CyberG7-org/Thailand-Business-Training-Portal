import { describe, expect, it } from 'vitest';
import { allRows, inChunks } from '@/lib/db/chunks';

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

describe('allRows', () => {
  it('reads page after page until a short page, so nothing is cut off at the row limit', async () => {
    const table = Array.from({ length: 25 }, (_, i) => i);
    const asked: [number, number][] = [];
    const rows = await allRows(async (from, to) => {
      asked.push([from, to]);
      return { data: table.slice(from, to + 1), error: null };
    }, 10);
    expect(rows).toEqual(table);
    expect(asked).toEqual([
      [0, 9],
      [10, 19],
      [20, 29],
    ]);
  });

  it('asks once more after an exactly full last page, and raises an error', async () => {
    const table = Array.from({ length: 20 }, (_, i) => i);
    let calls = 0;
    const rows = await allRows(async (from, to) => {
      calls++;
      return { data: table.slice(from, to + 1), error: null };
    }, 10);
    expect(rows).toHaveLength(20);
    expect(calls).toBe(3);
    await expect(
      allRows(async () => ({ data: null, error: new Error('refused') })),
    ).rejects.toThrow('refused');
  });
});
