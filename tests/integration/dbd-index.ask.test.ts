import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { askRecordDocuments } from '@/lib/db/dbd-index';
import { createDbdRecord } from '@/lib/db/dbd-records';
import { dbdRecordInputSchema } from '@/lib/domain/dbd-record';
import { FakeVectorStore } from '@/lib/integrations/vector/fake';
import { loadChunksFromDb } from '@/lib/integrations/vector/fake-loader';
import { VectorError } from '@/lib/integrations/vector/types';
import {
  adminClient,
  clientFor,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

describe('askRecordDocuments', () => {
  let admin: TestUser;
  let asAdmin: Client;
  let recordId: string;
  let documentId: string;
  const svc = adminClient();

  beforeAll(async () => {
    admin = await createTestUser('admin');
    asAdmin = await clientFor(admin);
    recordId = (await createDbdRecord(asAdmin, dbdRecordInputSchema.parse({}), admin.id)).id;
    const { data: doc, error } = await svc
      .from('dbd_documents')
      .insert({
        record_id: recordId,
        path: `${recordId}/ask.pdf`,
        original_name: 'ask.pdf',
        size_bytes: 1,
        position: 1,
        page_count: 1,
        index_status: 'ready',
        indexed_pages: 1,
      })
      .select('id')
      .single();
    if (error) throw error;
    documentId = doc.id;
    const { error: chunkError } = await svc.from('dbd_chunks').insert({
      id: `${documentId}#1#0`,
      record_id: recordId,
      document_id: documentId,
      document_type: 'certificate',
      page: 1,
      chunk_index: 0,
      chunk_text: 'ทุนจดทะเบียน 2,000,000 บาท',
      char_count: 26,
    });
    if (chunkError) throw chunkError;
  });

  afterAll(async () => {
    await svc.from('dbd_records').delete().eq('id', recordId);
    await deleteTestUser(admin.id);
  });

  it('answers from the passages with document names and pages', async () => {
    const result = await askRecordDocuments(asAdmin, new FakeVectorStore(loadChunksFromDb), {
      recordId,
      question: 'ทุนจดทะเบียน',
      answer: async () => 'คำตอบ',
    });
    expect(result.error).toBeNull();
    expect(result.answer).toBe('คำตอบ');
    expect(result.passages[0]).toMatchObject({ document: 'ask.pdf', page: 1 });
  });

  it('reports the store as unavailable instead of throwing', async () => {
    const dead = new FakeVectorStore(async () => []);
    dead.search = async () => {
      throw new VectorError('Pinecone is unreachable', 'unavailable');
    };
    const result = await askRecordDocuments(asAdmin, dead, {
      recordId,
      question: 'ทุนจดทะเบียน',
    });
    expect(result).toMatchObject({ error: 'unavailable', passages: [] });
  });

  it('still shows the passages when the model answer fails', async () => {
    const result = await askRecordDocuments(asAdmin, new FakeVectorStore(loadChunksFromDb), {
      recordId,
      question: 'ทุนจดทะเบียน',
      answer: async () => {
        throw new Error('model down');
      },
    });
    expect(result.error).toBeNull();
    expect(result.answer).toBeNull();
    expect(result.passages).toHaveLength(1);
  });

  it('refuses empty questions, records without an index, and a missing store', async () => {
    const store = new FakeVectorStore(loadChunksFromDb);
    expect((await askRecordDocuments(asAdmin, store, { recordId, question: ' ' })).error).toBe(
      'empty',
    );
    expect((await askRecordDocuments(asAdmin, null, { recordId, question: 'x?' })).error).toBe(
      'unavailable',
    );
    await svc.from('dbd_documents').update({ index_status: 'queued' }).eq('id', documentId);
    expect((await askRecordDocuments(asAdmin, store, { recordId, question: 'x?' })).error).toBe(
      'not_indexed',
    );
  });
});
