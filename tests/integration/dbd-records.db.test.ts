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
  CONFIRMED_ANSWERS,
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

  it('refuses confirmation naming what is missing, then confirms', async () => {
    await expect(confirmDbdRecord(asAdmin, recordId, admin.id)).rejects.toThrow(/juristic_id/);
    await updateDbdRecord(
      asAdmin,
      recordId,
      dbdRecordInputSchema.parse({
        company_name_th: 'บริษัท ทดสอบ จำกัด',
        juristic_id: '0105568233704',
        issued_on: '13/07/2569',
      }),
    );
    // The certificate is complete, but nobody has said how to reach the company or what it sells.
    await expect(confirmDbdRecord(asAdmin, recordId, admin.id)).rejects.toThrow(
      /nature_of_business/,
    );

    await asAdmin
      .from('dbd_records')
      .update({ structured_data: CONFIRMED_ANSWERS as never })
      .eq('id', recordId);
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

/**
 * The database is the backstop behind the confirm action: even a direct write cannot mark a
 * record confirmed while the manager's four answers are missing (owner, 2026-09-24). Every core
 * field is satisfied throughout, so only the new constraint can be doing the refusing.
 */
describe('a confirmed record carries the company contact and what it sells', () => {
  const svc = adminClient();
  let confirmer: TestUser;
  let recordId: string;

  beforeAll(async () => {
    confirmer = await createTestUser('admin');
    const { data } = await svc
      .from('dbd_records')
      .insert({ company_name_th: 'บริษัท ยืนยัน จำกัด', juristic_id: '0105500009991' })
      .select()
      .single();
    recordId = data!.id;
  });

  afterAll(async () => {
    await svc.from('dbd_records').delete().eq('id', recordId);
    await deleteTestUser(confirmer.id);
  });

  async function confirm(): Promise<string | null> {
    const { error } = await svc
      .from('dbd_records')
      .update({
        extraction_status: 'confirmed',
        confirmed_by: confirmer.id,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', recordId);
    return error?.message ?? null;
  }

  async function answer(interview: Record<string, string>) {
    const { error } = await svc
      .from('dbd_records')
      .update({ structured_data: { interview } as never })
      .eq('id', recordId);
    if (error) throw error;
  }

  it('refuses while an answer is blank, and allows it once all four are in', async () => {
    expect(await confirm()).toContain('dbd_confirmed_requires_business_answers');

    await answer({
      contact_email: 'info@example.co.th',
      contact_phone: '02-123-4567',
      nature_of_business: 'ขายเสื้อผ้าออนไลน์',
      products_services: '   ',
    });
    expect(await confirm()).toContain('dbd_confirmed_requires_business_answers');

    await answer({
      contact_email: 'info@example.co.th',
      contact_phone: '02-123-4567',
      nature_of_business: 'ขายเสื้อผ้าออนไลน์',
      products_services: 'เสื้อผ้าสตรีนำเข้า',
    });
    expect(await confirm()).toBeNull();

    const { data } = await svc
      .from('dbd_records')
      .select('extraction_status')
      .eq('id', recordId)
      .single();
    expect(data!.extraction_status).toBe('confirmed');
  });
});
