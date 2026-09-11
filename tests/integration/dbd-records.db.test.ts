import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  confirmDbdRecord,
  createDbdRecord,
  getDbdRecord,
  listDbdRecords,
  updateDbdRecord,
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

describe('lib/db/dbd-records', () => {
  let admin: TestUser;
  let asAdmin: Client;
  let recordId: string;
  let documentPath: string | null = null;

  beforeAll(async () => {
    admin = await createTestUser('admin');
    asAdmin = await clientFor(admin);
  });

  afterAll(async () => {
    const svc = adminClient();
    if (documentPath) await svc.storage.from('dbd-documents').remove([documentPath]);
    if (recordId) await svc.from('dbd_records').delete().eq('id', recordId);
    await deleteTestUser(admin.id);
  });

  it('creates a record from parsed input and attributes it to the admin', async () => {
    const input = dbdRecordInputSchema.parse({
      company_name_th: 'บริษัท ทดสอบ จำกัด',
      issued_on: '13/07/2569',
    });
    const row = await createDbdRecord(asAdmin, input, admin.id);
    recordId = row.id;
    expect(row).toMatchObject({
      company_name_th: 'บริษัท ทดสอบ จำกัด',
      issued_on: '2026-07-13',
      created_by: admin.id,
      extraction_status: 'none',
    });
  });

  it('refuses confirmation until core fields exist, then confirms', async () => {
    await expect(confirmDbdRecord(asAdmin, recordId, admin.id)).rejects.toMatchObject({
      code: '23514',
    });
    await updateDbdRecord(
      asAdmin,
      recordId,
      dbdRecordInputSchema.parse({
        company_name_th: 'บริษัท ทดสอบ จำกัด',
        juristic_id: '0105568233704',
        issued_on: '13/07/2569',
      }),
    );
    const confirmed = await confirmDbdRecord(asAdmin, recordId, admin.id);
    expect(confirmed.extraction_status).toBe('confirmed');
    expect(confirmed.confirmed_by).toBe(admin.id);
  });

  it('uploads the certificate and stores its path', async () => {
    const bytes = readFileSync('tests/fixtures/tiny.pdf');
    const file = new File([bytes], 'certificate.pdf', { type: 'application/pdf' });
    documentPath = await uploadDbdDocument(asAdmin, recordId, file);
    expect(documentPath.startsWith(`${recordId}/`)).toBe(true);
    const row = await getDbdRecord(asAdmin, recordId);
    expect(row?.document_path).toBe(documentPath);
  });

  it('lists records newest first', async () => {
    const rows = await listDbdRecords(asAdmin);
    expect(rows.some((r) => r.id === recordId)).toBe(true);
  });
});
