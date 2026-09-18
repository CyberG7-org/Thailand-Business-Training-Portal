import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDbdRecord,
  listDbdDocuments,
  removeDbdDocument,
  uploadDbdDocument,
} from '@/lib/db/dbd-records';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import { extractAndApply, runExtraction } from '@/lib/db/extraction';
import { dbdRecordInputSchema } from '@/lib/domain/dbd-record';
import { FakeDbdExtractor, SAMPLE_EXTRACTION } from '@/lib/integrations/extraction/fake';
import { ExtractionError, type DbdExtractor } from '@/lib/integrations/extraction/types';
import {
  adminClient,
  clientFor,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

const failing: DbdExtractor = {
  name: 'failing',
  async extract() {
    throw new ExtractionError('boom', 'provider');
  },
};

describe('runExtraction', () => {
  let admin: TestUser;
  let asAdmin: Client;
  let recordId: string;
  let documentPath: string | null = null;

  beforeAll(async () => {
    admin = await createTestUser('admin');
    asAdmin = await clientFor(admin);
    const row = await createDbdRecord(asAdmin, dbdRecordInputSchema.parse({}), admin.id);
    recordId = row.id;
  });

  afterAll(async () => {
    const svc = adminClient();
    if (documentPath) await svc.storage.from('dbd-documents').remove([documentPath]);
    await svc.from('dbd_records').delete().eq('id', recordId);
    await deleteTestUser(admin.id);
  });

  it('refuses to run before a certificate is uploaded', async () => {
    await expect(runExtraction(asAdmin, recordId, new FakeDbdExtractor())).rejects.toMatchObject({
      code: 'no_document',
    });
  });

  it('stores the extraction without touching record columns', async () => {
    const bytes = readFileSync('tests/fixtures/tiny.pdf');
    documentPath = await uploadDbdDocument(
      asAdmin,
      recordId,
      new File([bytes], 'c.pdf', { type: 'application/pdf' }),
    );
    const row = await runExtraction(asAdmin, recordId, new FakeDbdExtractor());
    expect(row.extraction_status).toBe('extracted');
    expect(row.company_name_th).toBeNull();
    expect((row.extraction_raw as typeof SAMPLE_EXTRACTION).company_name_th.value).toBe(
      SAMPLE_EXTRACTION.company_name_th.value,
    );
  });

  it('restores the previous status when the provider fails', async () => {
    await expect(runExtraction(asAdmin, recordId, failing)).rejects.toMatchObject({
      code: 'provider',
    });
    const { data } = await asAdmin
      .from('dbd_records')
      .select('extraction_status')
      .eq('id', recordId)
      .single();
    expect(data?.extraction_status).toBe('extracted');
  });
});

describe('extractAndApply', () => {
  let admin: TestUser;
  let asAdmin: Client;
  let recordId: string;
  let documentPath: string | null = null;

  beforeAll(async () => {
    admin = await createTestUser('admin');
    asAdmin = await clientFor(admin);
    const row = await createDbdRecord(
      asAdmin,
      dbdRecordInputSchema.parse({ company_name_th: 'บริษัท ที่แอดมินพิมพ์ จำกัด' }),
      admin.id,
    );
    recordId = row.id;
    documentPath = await uploadDbdDocument(
      asAdmin,
      recordId,
      new File([readFileSync('tests/fixtures/tiny.pdf')], 'c.pdf', { type: 'application/pdf' }),
    );
  });

  afterAll(async () => {
    const svc = adminClient();
    if (documentPath) await svc.storage.from('dbd-documents').remove([documentPath]);
    await svc.from('dbd_records').delete().eq('id', recordId);
    await deleteTestUser(admin.id);
  });

  it('fills empty columns from the document and keeps what the admin typed', async () => {
    const { record, applied, rejected } = await extractAndApply(
      asAdmin,
      recordId,
      new FakeDbdExtractor(),
    );
    expect(record.extraction_status).toBe('extracted');
    expect(record.company_name_th).toBe('บริษัท ที่แอดมินพิมพ์ จำกัด');
    expect(record.juristic_id).toBe('0105569000123');
    expect(record.issued_on).toBe('2026-07-13');
    expect(Number(record.registered_capital)).toBe(2000000);
    expect(record.directors).toEqual(SAMPLE_EXTRACTION.directors.value);
    expect(record.province).toBe('ตัวอย่าง');

    // Level 2 lands in structured_data, Level 3 provenance points at document/page.
    const structured = readStructuredData(record.structured_data);
    expect(structured.business?.objectives).toHaveLength(3);
    expect(structured.business?.shareholders[0]).toMatchObject({ name: 'นางสาวตัวอย่าง ทดสอบ' });
    expect(structured.business?.share_structure.total_shares).toBe(20000);
    expect(structured.provenance?.juristic_id).toMatchObject({
      source_document: 1,
      source_page: 1,
    });
    expect(structured.document_type).toBe('certificate');
    const docs = await listDbdDocuments(asAdmin, recordId);
    expect(docs).toHaveLength(1);
    expect(docs[0].document_type).toBe('certificate');
    expect(applied).toContain('juristic_id');
    expect(applied).not.toContain('company_name_th');
    expect(rejected).toEqual([]);

    // A second document joins the pack; extraction reads both and classifies the new one.
    const second = await uploadDbdDocument(
      asAdmin,
      recordId,
      new File([readFileSync('tests/fixtures/tiny.pdf')], 'objectives.pdf', {
        type: 'application/pdf',
      }),
      'objectives.pdf',
    );
    const withTwo = await extractAndApply(asAdmin, recordId, new FakeDbdExtractor());
    expect(withTwo.applied).toEqual([]);
    const twoDocs = await listDbdDocuments(asAdmin, recordId);
    expect(twoDocs.map((d) => [d.position, d.original_name, d.document_type])).toEqual([
      [1, 'certificate.pdf', 'certificate'],
      [2, 'objectives.pdf', 'objectives_sheet'],
    ]);
    await removeDbdDocument(asAdmin, recordId, twoDocs[1].id);
    expect((await listDbdDocuments(asAdmin, recordId)).map((d) => d.path)).toEqual([documentPath]);
    expect(second).not.toBe(documentPath);

    // A second run has nothing left to fill and changes nothing.
    const again = await extractAndApply(asAdmin, recordId, new FakeDbdExtractor());
    expect(again.applied).toEqual([]);
    expect(again.record.juristic_id).toBe('0105569000123');
  });
});
