import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createDbdRecord,
  listDbdDocuments,
  removeDbdDocument,
  uploadDbdDocument,
} from '@/lib/db/dbd-records';
import { dbdRecordInputSchema } from '@/lib/domain/dbd-record';
import {
  adminClient,
  clientFor,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

describe('upload → index status', () => {
  let admin: TestUser;
  let asAdmin: Client;
  let recordId: string;
  const svc = adminClient();
  const original = process.env.VECTOR_PROVIDER;

  beforeAll(async () => {
    admin = await createTestUser('admin');
    asAdmin = await clientFor(admin);
    recordId = (await createDbdRecord(asAdmin, dbdRecordInputSchema.parse({}), admin.id)).id;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.VECTOR_PROVIDER;
    else process.env.VECTOR_PROVIDER = original;
  });
  afterAll(async () => {
    const docs = await listDbdDocuments(svc, recordId);
    if (docs.length > 0) await svc.storage.from('dbd-documents').remove(docs.map((d) => d.path));
    await svc.from('dbd_records').delete().eq('id', recordId);
    await deleteTestUser(admin.id);
  });

  it('marks an unreadable file failed without queueing a job, and the upload still succeeds', async () => {
    const garbage = new File([new TextEncoder().encode('%PDF-not-really')], 'bad.pdf', {
      type: 'application/pdf',
    });
    const path = await uploadDbdDocument(asAdmin, recordId, garbage, 'bad.pdf');
    expect(path).toMatch(/\.pdf$/);
    const [doc] = await listDbdDocuments(asAdmin, recordId);
    expect(doc).toMatchObject({
      page_count: null,
      index_status: 'failed',
      index_error: 'unreadable_pdf',
    });
    const { data: jobs } = await svc.from('index_jobs').select('id').eq('document_id', doc.id);
    expect(jobs).toEqual([]);
  });

  it('marks an encrypted PDF failed without queueing a job', async () => {
    const bytes = readFileSync('tests/fixtures/encrypted.pdf');
    await uploadDbdDocument(
      asAdmin,
      recordId,
      new File([bytes], 'locked.pdf', { type: 'application/pdf' }),
      'locked.pdf',
    );
    const docs = await listDbdDocuments(asAdmin, recordId);
    const doc = docs[docs.length - 1];
    expect(doc).toMatchObject({
      page_count: null,
      index_status: 'failed',
      index_error: 'unreadable_pdf',
    });
    const { data: jobs } = await svc.from('index_jobs').select('id').eq('document_id', doc.id);
    expect(jobs).toEqual([]);
  });

  it('marks the document skipped when the vector provider is off', async () => {
    process.env.VECTOR_PROVIDER = 'off';
    const bytes = readFileSync('tests/fixtures/three-pages.pdf');
    await uploadDbdDocument(
      asAdmin,
      recordId,
      new File([bytes], 'p.pdf', { type: 'application/pdf' }),
      'p.pdf',
    );
    const docs = await listDbdDocuments(asAdmin, recordId);
    const doc = docs[docs.length - 1];
    expect(doc).toMatchObject({ page_count: 3, index_status: 'skipped' });
  });

  it('removing a document also removes its rows', async () => {
    const docs = await listDbdDocuments(asAdmin, recordId);
    const doc = docs[docs.length - 1];
    await svc.from('dbd_chunks').insert({
      id: `${doc.id}#1#0`,
      record_id: recordId,
      document_id: doc.id,
      page: 1,
      chunk_index: 0,
      chunk_text: 'x',
      char_count: 1,
    });
    await removeDbdDocument(asAdmin, recordId, doc.id);
    const { data } = await svc.from('dbd_chunks').select('id').eq('document_id', doc.id);
    expect(data).toEqual([]);
  });
});
