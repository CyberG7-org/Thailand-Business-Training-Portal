import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DocumentUploadError,
  createDbdRecord,
  getDbdRecord,
  listDbdDocuments,
  newDocumentPath,
  registerDbdDocument,
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

const fixture = readFileSync('tests/fixtures/three-pages.pdf');

/**
 * Browser-direct uploads (P14c hotfix): the file goes from the browser to Storage under a signed
 * URL, then the server registers the object — Vercel caps a function's request body at 4.5 MB
 * and DBD packs are bigger than that.
 */
describe('registering a document the browser uploaded', () => {
  const svc = adminClient();
  let admin: TestUser;
  let asAdmin: Client;
  let learner: TestUser;
  let asLearner: Client;
  let recordId: string;

  beforeAll(async () => {
    admin = await createTestUser('admin');
    asAdmin = await clientFor(admin);
    learner = await createTestUser('learner');
    asLearner = await clientFor(learner);
    recordId = (await createDbdRecord(asAdmin, dbdRecordInputSchema.parse({}), admin.id)).id;
  });

  afterAll(async () => {
    const docs = await listDbdDocuments(svc, recordId);
    if (docs.length > 0) await svc.storage.from('dbd-documents').remove(docs.map((d) => d.path));
    await svc.from('dbd_records').delete().eq('id', recordId);
    await deleteTestUser(admin.id);
    await deleteTestUser(learner.id);
  });

  it('gives an admin, and only an admin, a signed upload URL under the record', async () => {
    const path = newDocumentPath(recordId);
    expect(path.startsWith(`${recordId}/`)).toBe(true);
    expect(path.endsWith('.pdf')).toBe(true);
    const { data, error } = await asAdmin.storage.from('dbd-documents').createSignedUploadUrl(path);
    expect(error).toBeNull();
    expect(data?.token).toBeTruthy();
    const denied = await asLearner.storage
      .from('dbd-documents')
      .createSignedUploadUrl(newDocumentPath(recordId));
    expect(denied.error).not.toBeNull();
  });

  it('registers the uploaded object: row with its real size and page count, index job, document_path', async () => {
    const path = newDocumentPath(recordId);
    const { error } = await asAdmin.storage
      .from('dbd-documents')
      .upload(path, fixture, { contentType: 'application/pdf' });
    expect(error).toBeNull();
    const registered = await registerDbdDocument(asAdmin, recordId, {
      path,
      originalName: 'cert.pdf',
    });
    expect(registered).toBe(path);
    const [doc] = await listDbdDocuments(asAdmin, recordId);
    expect(doc).toMatchObject({
      path,
      original_name: 'cert.pdf',
      size_bytes: fixture.byteLength,
      page_count: 3,
      position: 1,
      index_status: 'queued',
      uploaded_by: admin.id,
    });
    const { data: jobs } = await svc.from('index_jobs').select('status').eq('document_id', doc.id);
    expect(jobs).toEqual([{ status: 'queued' }]);
    expect((await getDbdRecord(asAdmin, recordId))?.document_path).toBe(path);
  });

  it('refuses a path outside the record and an object that was never uploaded', async () => {
    await expect(
      registerDbdDocument(asAdmin, recordId, { path: 'elsewhere/x.pdf', originalName: 'x.pdf' }),
    ).rejects.toMatchObject({ code: 'invalid-file' });
    await expect(
      registerDbdDocument(asAdmin, recordId, {
        path: newDocumentPath(recordId),
        originalName: 'missing.pdf',
      }),
    ).rejects.toMatchObject({ code: 'no-file' });
    expect(await listDbdDocuments(asAdmin, recordId)).toHaveLength(1);
  });

  it('refuses an object that is not a PDF and removes it from storage', async () => {
    const path = newDocumentPath(recordId);
    await asAdmin.storage
      .from('dbd-documents')
      .upload(path, new TextEncoder().encode('hello, not a pdf'), {
        contentType: 'application/pdf',
      });
    const attempt = registerDbdDocument(asAdmin, recordId, { path, originalName: 'fake.pdf' });
    await expect(attempt).rejects.toBeInstanceOf(DocumentUploadError);
    await expect(attempt).rejects.toMatchObject({ code: 'invalid-file' });
    const { data: gone } = await asAdmin.storage.from('dbd-documents').download(path);
    expect(gone).toBeNull();
    expect(await listDbdDocuments(asAdmin, recordId)).toHaveLength(1);
  });
});
