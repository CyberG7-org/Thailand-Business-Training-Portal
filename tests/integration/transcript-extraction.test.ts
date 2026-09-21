import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDbdRecord,
  getDbdRecord,
  listDbdDocuments,
  uploadDbdDocument,
} from '@/lib/db/dbd-records';
import { extractFromTranscripts, FACT_QUERIES } from '@/lib/db/transcript-extraction';
import { dbdRecordInputSchema } from '@/lib/domain/dbd-record';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import { FakeDbdExtractor, fakePageText } from '@/lib/integrations/extraction/fake';
import { FakeVectorStore } from '@/lib/integrations/vector/fake';
import { loadChunksFromDb } from '@/lib/integrations/vector/fake-loader';
import {
  adminClient,
  clientFor,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

const fixture = readFileSync('tests/fixtures/three-pages.pdf');

describe('extractFromTranscripts', () => {
  const svc = adminClient();
  const store = new FakeVectorStore(loadChunksFromDb);
  let admin: TestUser;
  let asAdmin: Client;
  let recordId: string;

  /** A ready, oversized document whose pages/chunks are the fake transcriber's fictional pages. */
  async function seedReady(record: string, type: string | null, pages: number[]) {
    const path = await uploadDbdDocument(
      asAdmin,
      record,
      new File([fixture], 'big.pdf', { type: 'application/pdf' }),
      'big.pdf',
    );
    const doc = (await listDbdDocuments(svc, record)).find((d) => d.path === path)!;
    await svc.from('index_jobs').update({ status: 'done' }).eq('document_id', doc.id);
    await svc
      .from('dbd_documents')
      .update({ page_count: 25, index_status: 'ready', indexed_pages: 25, document_type: type })
      .eq('id', doc.id);
    const { error: pageError } = await svc
      .from('dbd_pages')
      .insert(
        pages.map((p) => ({ document_id: doc.id, page: p, text: fakePageText(p), model: 'fake' })),
      );
    if (pageError) throw pageError;
    const { error: chunkError } = await svc.from('dbd_chunks').insert(
      pages.map((p) => ({
        id: `${doc.id}#${p}#0`,
        record_id: record,
        document_id: doc.id,
        document_type: type,
        page: p,
        chunk_index: 0,
        chunk_text: fakePageText(p),
        char_count: fakePageText(p).length,
      })),
    );
    if (chunkError) throw chunkError;
    return doc.id;
  }

  beforeAll(async () => {
    admin = await createTestUser('admin');
    asAdmin = await clientFor(admin);
    recordId = (
      await createDbdRecord(
        asAdmin,
        { ...dbdRecordInputSchema.parse({}), head_office_address: 'ที่อยู่ที่แอดมินพิมพ์เอง' },
        admin.id,
      )
    ).id;
    await seedReady(recordId, 'certificate', [1]);
    await seedReady(recordId, 'shareholder_list', [3, 4, 5]);
    await seedReady(recordId, 'objectives_sheet', [2]);
  });

  afterAll(async () => {
    const docs = await listDbdDocuments(svc, recordId);
    await svc.storage.from('dbd-documents').remove(docs.map((d) => d.path));
    await svc.from('dbd_records').delete().eq('id', recordId);
    await deleteTestUser(admin.id);
  });

  it('has a Thai retrieval key for every fact group', () => {
    expect(FACT_QUERIES.length).toBeGreaterThanOrEqual(6);
    expect(FACT_QUERIES.join(' ')).toContain('ทุนจดทะเบียน');
  });

  it('fills empty facts and empty lists from the transcripts, keeping what the admin typed', async () => {
    const result = await extractFromTranscripts(asAdmin, recordId, {
      extractor: new FakeDbdExtractor(),
      vector: store,
      batchPages: 2,
    });
    expect(result.skipped).toBeNull();
    expect(result.applied).toContain('company_name_th');
    expect(result.applied).not.toContain('head_office_address');
    expect(result.lists).toEqual(expect.arrayContaining(['shareholders', 'objectives']));
    const record = (await getDbdRecord(asAdmin, recordId))!;
    expect(record.company_name_th).toBe('บริษัท ตัวอย่างการสกัด จำกัด');
    expect(record.juristic_id).toBe('0105569000123');
    expect(record.head_office_address).toBe('ที่อยู่ที่แอดมินพิมพ์เอง');
    expect(record.extraction_status).toBe('extracted');
    const structured = readStructuredData(record.structured_data);
    expect(structured.business?.shareholders.map((s) => s.name)).toContain('นางสาวตัวอย่าง ทดสอบ');
    expect(structured.business?.objectives).toHaveLength(3);
    expect(structured.business?.share_structure.total_shares).toBe(20000);
    expect(structured.provenance?.company_name_th).toMatchObject({
      source_page: expect.any(Number),
    });
    expect(structured.provenance?.head_office_address).toBeUndefined();
  });

  it('is idempotent and never overwrites: a second run changes nothing', async () => {
    const before = await getDbdRecord(asAdmin, recordId);
    const result = await extractFromTranscripts(asAdmin, recordId, {
      extractor: new FakeDbdExtractor(),
      vector: store,
    });
    expect(result.applied).toEqual([]);
    expect(result.lists).toEqual([]);
    expect(await getDbdRecord(asAdmin, recordId)).toEqual(before);
  });

  it('does nothing for a confirmed record or without providers', async () => {
    await svc
      .from('dbd_records')
      .update({
        extraction_status: 'confirmed',
        confirmed_by: admin.id,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', recordId);
    expect(
      (
        await extractFromTranscripts(asAdmin, recordId, {
          extractor: new FakeDbdExtractor(),
          vector: store,
        })
      ).skipped,
    ).toBe('confirmed');
    await svc
      .from('dbd_records')
      .update({ extraction_status: 'extracted', confirmed_by: null, confirmed_at: null })
      .eq('id', recordId);
    expect(
      (await extractFromTranscripts(asAdmin, recordId, { extractor: null, vector: store })).skipped,
    ).toBe('not_configured');
    expect(
      (
        await extractFromTranscripts(asAdmin, recordId, {
          extractor: new FakeDbdExtractor(),
          vector: null,
        })
      ).skipped,
    ).toBe('not_configured');
  });
});
