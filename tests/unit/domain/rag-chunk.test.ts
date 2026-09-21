import { describe, expect, it } from 'vitest';
import { CHUNK_MAX_CHARS, CHUNK_OVERLAP_CHARS, chunkId, chunkPage } from '@/lib/domain/rag/chunk';

const base = { recordId: 'rec-1', documentId: 'doc-1', documentType: 'certificate', page: 2 };
const thai = (n: number) => 'ประกอบกิจการค้าปลีกและค้าส่งสินค้าอุปโภคบริโภค '.repeat(n).trim();

describe('chunkPage', () => {
  it('returns nothing for a blank page', () => {
    expect(chunkPage({ ...base, text: '  \n ' })).toEqual([]);
  });

  it('merges short numbered items up to the limit and starts a new chunk when full', () => {
    const items = [1, 2, 3].map((n) => `${n}. ${thai(8)}`); // ~400 characters each
    const chunks = chunkPage({ ...base, text: items.join('\n') });
    expect(chunks).toHaveLength(2);
    expect(chunks[0].text.startsWith('1. ')).toBe(true);
    expect(chunks[0].text).toContain('\n2. ');
    expect(chunks[1].text.startsWith('3. ')).toBe(true);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
  });

  it('numbers chunks deterministically with page-scoped ids', () => {
    const chunks = chunkPage({ ...base, text: `1. ${thai(8)}\n2. ${thai(8)}\n3. ${thai(8)}` });
    expect(chunks.map((c) => c.id)).toEqual([chunkId('doc-1', 2, 0), chunkId('doc-1', 2, 1)]);
    expect(chunks[1]).toMatchObject({ ...base, chunkIndex: 1 });
    expect(chunkId('doc-1', 2, 1)).toBe('doc-1#2#1');
  });

  it('cuts a boundary-less 5,000-character line into overlapping chunks under the limit', () => {
    const text = 'ก'.repeat(5000);
    const chunks = chunkPage({ ...base, text });
    expect(chunks.length).toBeGreaterThanOrEqual(5);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
    expect(chunks[1].text.slice(0, CHUNK_OVERLAP_CHARS)).toBe(
      chunks[0].text.slice(-CHUNK_OVERLAP_CHARS),
    );
    expect(chunks.map((c) => c.text).join('').length).toBeGreaterThanOrEqual(5000);
  });

  it('prefers a space or newline boundary when cutting long prose', () => {
    const text = `${thai(12)}\n${thai(12)}\n${thai(12)}`; // ~1,700 characters, one paragraph
    const chunks = chunkPage({ ...base, text });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
      expect(c.text.endsWith('บริโภค')).toBe(true); // cut between words, not inside one
    }
  });
});
