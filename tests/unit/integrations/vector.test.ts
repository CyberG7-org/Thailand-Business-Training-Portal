import { describe, expect, it } from 'vitest';
import type { Chunk } from '@/lib/domain/rag/chunk';
import { getVectorStore, resolveVectorProvider } from '@/lib/integrations/vector';
import { FakeVectorStore } from '@/lib/integrations/vector/fake';
import { pineconeConfig } from '@/lib/integrations/vector/pinecone';

describe('resolveVectorProvider', () => {
  it('follows the explicit setting, then the key, then the environment', () => {
    expect(resolveVectorProvider({ VECTOR_PROVIDER: 'off', PINECONE_API_KEY: 'k' })).toBe('off');
    expect(resolveVectorProvider({ PINECONE_API_KEY: 'k' })).toBe('pinecone');
    expect(resolveVectorProvider({ NODE_ENV: 'production' })).toBe('off');
    expect(resolveVectorProvider({ NODE_ENV: 'test' })).toBe('fake');
  });

  it('returns no store when off and a fake store otherwise', () => {
    expect(getVectorStore({ VECTOR_PROVIDER: 'off' })).toBeNull();
    expect(getVectorStore({ VECTOR_PROVIDER: 'fake' })?.name).toBe('fake');
  });

  it('reads the Pinecone settings with defaults', () => {
    expect(pineconeConfig({ PINECONE_API_KEY: 'k' })).toEqual({
      apiKey: 'k',
      indexName: 'thai-portal-dbd',
      namespace: 'dev',
      region: 'us-east-1',
    });
    expect(() => pineconeConfig({})).toThrow(/PINECONE_API_KEY/);
  });
});

describe('FakeVectorStore', () => {
  const chunk = (id: string, page: number, text: string, documentType = 'certificate'): Chunk => ({
    id,
    recordId: 'rec',
    documentId: 'doc',
    documentType,
    page,
    chunkIndex: Number(id.split('#')[2]),
    text,
  });
  const chunks = [
    chunk('doc#1#0', 1, 'ทุนจดทะเบียน 2,000,000 บาท'),
    chunk('doc#2#0', 2, '1. ประกอบกิจการค้าปลีก', 'objectives_sheet'),
    chunk('doc#3#0', 3, 'บัญชีรายชื่อผู้ถือหุ้น', 'shareholder_list'),
  ];
  const store = new FakeVectorStore(async (recordId, types) =>
    recordId === 'rec' ? chunks.filter((c) => !types || types.includes(c.documentType ?? '')) : [],
  );

  it('ranks by trigram overlap, drops zero scores and honours topK and document types', async () => {
    const hits = await store.search({ recordId: 'rec', query: 'ทุนจดทะเบียน', topK: 2 });
    expect(hits.map((h) => h.page)).toEqual([1]);
    expect(hits[0]).toMatchObject({ id: 'doc#1#0', documentId: 'doc', score: 1 });
    const typed = await store.search({
      recordId: 'rec',
      query: 'ประกอบกิจการ',
      documentTypes: ['shareholder_list'],
    });
    expect(typed).toEqual([]);
    expect(await store.search({ recordId: 'other', query: 'ทุนจดทะเบียน' })).toEqual([]);
  });
});
