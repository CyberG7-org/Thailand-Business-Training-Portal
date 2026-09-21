import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbdRecord } from '@/lib/db/dbd-records';
import { dbdRecordInputSchema } from '@/lib/domain/dbd-record';
import {
  adminClient,
  clientFor,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

describe('index tables are invisible to learners and read-only for admins', () => {
  let admin: TestUser;
  let learner: TestUser;
  let asAdmin: Client;
  let asLearner: Client;
  let recordId: string;
  let documentId: string;

  beforeAll(async () => {
    [admin, learner] = await Promise.all([createTestUser('admin'), createTestUser('learner')]);
    [asAdmin, asLearner] = await Promise.all([clientFor(admin), clientFor(learner)]);
    recordId = (await createDbdRecord(asAdmin, dbdRecordInputSchema.parse({}), admin.id)).id;
    const svc = adminClient();
    const { data: doc, error } = await svc
      .from('dbd_documents')
      .insert({
        record_id: recordId,
        path: `${recordId}/rls.pdf`,
        original_name: 'rls.pdf',
        size_bytes: 1,
        position: 1,
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
    await adminClient().from('dbd_records').delete().eq('id', recordId);
    await Promise.all([deleteTestUser(admin.id), deleteTestUser(learner.id)]);
  });

  it('hides chunks, pages and jobs from learners', async () => {
    const { data: chunks } = await asLearner.from('dbd_chunks').select('id');
    const { data: pages } = await asLearner.from('dbd_pages').select('page');
    const { data: jobs } = await asLearner.from('index_jobs').select('id');
    expect(chunks).toEqual([]);
    expect(pages).toEqual([]);
    expect(jobs).toEqual([]);
  });

  it('lets admins read chunks but not write them', async () => {
    const { data } = await asAdmin.from('dbd_chunks').select('id').eq('document_id', documentId);
    expect(data).toHaveLength(1);
    const { error } = await asAdmin.from('dbd_chunks').insert({
      id: `${documentId}#1#9`,
      record_id: recordId,
      document_id: documentId,
      page: 1,
      chunk_index: 9,
      chunk_text: 'x',
      char_count: 1,
    });
    expect(error?.code).toBe('42501');
  });

  it('cascades chunks when the document is deleted', async () => {
    await adminClient().from('dbd_documents').delete().eq('id', documentId);
    const { data } = await adminClient()
      .from('dbd_chunks')
      .select('id')
      .eq('document_id', documentId);
    expect(data).toEqual([]);
  });
});
