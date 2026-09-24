import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { enqueueTranscriptJob } from '@/lib/db/dbd-index';
import {
  createDbdRecord,
  getDbdRecord,
  listDbdDocuments,
  updateDbdRecord,
  uploadDbdDocument,
} from '@/lib/db/dbd-records';
import { extractAndApply } from '@/lib/db/extraction';
import { fillRecordFromTranscripts, FACT_QUERIES } from '@/lib/db/transcript-extraction';
import { EMPTY_INTERVIEW_PROFILE } from '@/lib/domain/bank-interview';
import { dbdRecordInputSchema } from '@/lib/domain/dbd-record';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import { FakeDbdExtractor, fakePageText } from '@/lib/integrations/extraction/fake';
import { EMPTY_SWEEP } from '@/lib/integrations/extraction/transcript-schema';
import { ExtractionError, type DbdExtractor } from '@/lib/integrations/extraction/types';
import { FakeVectorStore } from '@/lib/integrations/vector/fake';
import { loadChunksFromDb } from '@/lib/integrations/vector/fake-loader';
import {
  CONFIRMED_ANSWERS,
  adminClient,
  clientFor,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

const fixture = readFileSync('tests/fixtures/three-pages.pdf');
const svc = adminClient();
const store = new FakeVectorStore(loadChunksFromDb);

/** A fake extractor with some methods replaced (the rest delegate to the fake). */
function fakeWith(overrides: Partial<DbdExtractor>): DbdExtractor {
  const fake = new FakeDbdExtractor();
  return {
    name: 'custom',
    extract: (docs) => fake.extract(docs),
    transcribe: (slice, range) => fake.transcribe(slice, range),
    classify: (text) => fake.classify(text),
    extractFacts: (passages) => fake.extractFacts(passages),
    sweep: (pages, type) => fake.sweep(pages, type),
    ...overrides,
  };
}

/** A ready document whose pages/chunks are the fake transcriber's fictional pages. */
async function seedReady(
  asAdmin: Client,
  record: string,
  type: string | null,
  pages: number[],
  name: string,
  pageCount = 25,
) {
  const path = await uploadDbdDocument(
    asAdmin,
    record,
    new File([fixture], name, { type: 'application/pdf' }),
    name,
  );
  const doc = (await listDbdDocuments(svc, record)).find((d) => d.path === path)!;
  await svc.from('index_jobs').update({ status: 'done' }).eq('document_id', doc.id);
  await svc
    .from('dbd_documents')
    .update({
      page_count: pageCount,
      index_status: 'ready',
      indexed_pages: pageCount,
      document_type: type,
    })
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

async function cleanup(recordId: string, adminId: string) {
  const docs = await listDbdDocuments(svc, recordId);
  if (docs.length > 0) await svc.storage.from('dbd-documents').remove(docs.map((d) => d.path));
  await svc.from('dbd_records').delete().eq('id', recordId);
  await deleteTestUser(adminId);
}

describe('the transcript path', () => {
  let admin: TestUser;
  let asAdmin: Client;
  let recordId: string;
  const docIds: Record<string, string> = {};
  const deps = () => ({ extractor: new FakeDbdExtractor(), vector: store });

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
    docIds.cert = await seedReady(asAdmin, recordId, 'certificate', [1], 'cert.pdf');
    docIds.list = await seedReady(asAdmin, recordId, 'shareholder_list', [3, 4, 5], 'list.pdf');
    docIds.sheet = await seedReady(asAdmin, recordId, 'objectives_sheet', [2], 'sheet.pdf');
  });

  afterAll(() => cleanup(recordId, admin.id));

  it('has a Thai retrieval key for every fact group', () => {
    expect(FACT_QUERIES.length).toBeGreaterThanOrEqual(6);
    expect(FACT_QUERIES.join(' ')).toContain('ทุนจดทะเบียน');
  });

  it('sweeps in resumable batches: a spent budget releases the run, a later run continues from the cache', async () => {
    let sweeps = 0;
    const counting = fakeWith({
      async sweep(pages, type) {
        sweeps++;
        return new FakeDbdExtractor().sweep(pages, type);
      },
    });
    // Budget of 0: the particulars, then exactly one sweep, then release.
    const first = await fillRecordFromTranscripts(svc, recordId, {
      extractor: counting,
      vector: store,
      sweepPages: 2,
      budgetMs: 0,
    });
    expect(first.status).toBe('released');
    expect(first.applied).toContain('company_name_th');
    expect(sweeps).toBe(1);
    const { count } = await svc
      .from('dbd_sweeps')
      .select('document_id', { count: 'exact', head: true })
      .eq('document_id', docIds.list);
    expect(count).toBe(1);

    const done = await fillRecordFromTranscripts(svc, recordId, {
      extractor: counting,
      vector: store,
      sweepPages: 2,
    });
    expect(done.status).toBe('done');
    expect(done.applied).toEqual([]); // the particulars were stored by the first run
    expect(done.lists.sort()).toEqual(['objectives', 'share_structure', 'shareholders']);
    // list pages 3–5 in batches of 2: [3,4] cached, [5] read; sheet page 2 read; the certificate
    // is not swept because the objectives sheet already supplied the objectives → 3 in total
    expect(sweeps).toBe(3);
  });

  it('filled empty facts and empty lists, keeping what the admin typed, with provenance for what it filled', async () => {
    const record = (await getDbdRecord(asAdmin, recordId))!;
    expect(record.company_name_th).toBe('บริษัท ตัวอย่างการสกัด จำกัด');
    expect(record.juristic_id).toBe('0105569000123');
    expect(record.directors).toEqual([
      { name_th: 'นางสาวตัวอย่าง ทดสอบ', name_en: 'Miss Sample Test' },
    ]);
    expect(record.head_office_address).toBe('ที่อยู่ที่แอดมินพิมพ์เอง');
    expect(record.extraction_status).toBe('extracted');
    expect(record.extraction_raw).not.toBeNull(); // the form shows the confidence cue from it
    const structured = readStructuredData(record.structured_data);
    expect(structured.business?.shareholders.map((s) => s.name)).toContain('นางสาวตัวอย่าง ทดสอบ');
    expect(structured.business?.objectives).toHaveLength(3);
    expect(structured.business?.share_structure.total_shares).toBe(20000);
    expect(structured.provenance?.company_name_th).toMatchObject({ source_page: 1 });
    expect(structured.provenance?.head_office_address).toBeUndefined();
    expect(structured.provenance?.shareholders).toMatchObject({ source_document: 2 });
    expect(structured.provenance?.objectives).toMatchObject({ source_document: 3 });
  });

  it('is idempotent and never overwrites: a second run changes nothing and calls no model', async () => {
    const before = await getDbdRecord(asAdmin, recordId);
    let facts = 0;
    let sweeps = 0;
    const counting = fakeWith({
      async extractFacts(passages) {
        facts++;
        return new FakeDbdExtractor().extractFacts(passages);
      },
      async sweep(pages, type) {
        sweeps++;
        return new FakeDbdExtractor().sweep(pages, type);
      },
    });
    const result = await fillRecordFromTranscripts(svc, recordId, {
      extractor: counting,
      vector: store,
    });
    expect(result).toMatchObject({ status: 'done', applied: [], lists: [] });
    expect(facts).toBe(0); // the particulars are stored; only "Read again" asks for them anew
    expect(sweeps).toBe(0); // every list a document kind can supply is filled or cached
    expect(await getDbdRecord(asAdmin, recordId)).toEqual(before);
  });

  it('does nothing for a confirmed record or without providers', async () => {
    await svc
      .from('dbd_records')
      .update({
        structured_data: CONFIRMED_ANSWERS as never,
        extraction_status: 'confirmed',
        confirmed_by: admin.id,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', recordId);
    expect((await fillRecordFromTranscripts(svc, recordId, deps())).skipped).toBe('confirmed');
    await svc
      .from('dbd_records')
      .update({ extraction_status: 'extracted', confirmed_by: null, confirmed_at: null })
      .eq('id', recordId);
    expect(
      (await fillRecordFromTranscripts(svc, recordId, { extractor: null, vector: store })).skipped,
    ).toBe('not_configured');
  });

  it('never overwrites a value or a confirmation that arrived while the model was working', async () => {
    const svcRecord = (await getDbdRecord(svc, recordId))!;
    await svc
      .from('dbd_records')
      .update({ company_name_th: null, registered_capital: null })
      .eq('id', recordId);
    const racing = fakeWith({
      async extractFacts(passages) {
        // The admin types the name and confirms while the facts call is in flight.
        const { error } = await svc
          .from('dbd_records')
          .update({
            company_name_th: 'ชื่อที่แอดมินพิมพ์ระหว่างรอ',
            structured_data: CONFIRMED_ANSWERS as never,
            extraction_status: 'confirmed',
            confirmed_by: admin.id,
            confirmed_at: new Date().toISOString(),
          })
          .eq('id', recordId);
        if (error) throw error;
        return new FakeDbdExtractor().extractFacts(passages);
      },
    });
    const result = await fillRecordFromTranscripts(svc, recordId, {
      extractor: racing,
      vector: store,
      facts: 'force',
    });
    expect(result.status).toBe('skipped');
    const after = (await getDbdRecord(svc, recordId))!;
    expect(after.company_name_th).toBe('ชื่อที่แอดมินพิมพ์ระหว่างรอ');
    expect(after.registered_capital).toBeNull(); // a confirmed record takes nothing, even empties
    await svc
      .from('dbd_records')
      .update({
        company_name_th: svcRecord.company_name_th,
        registered_capital: svcRecord.registered_capital,
        extraction_status: 'extracted',
        confirmed_by: null,
        confirmed_at: null,
      })
      .eq('id', recordId);
  });

  it('keeps a value the admin typed while the particulars were being read', async () => {
    await svc.from('dbd_records').update({ juristic_id: null }).eq('id', recordId);
    const racing = fakeWith({
      async extractFacts(passages) {
        await svc.from('dbd_records').update({ juristic_id: '0999999999999' }).eq('id', recordId);
        return new FakeDbdExtractor().extractFacts(passages);
      },
    });
    const result = await fillRecordFromTranscripts(svc, recordId, {
      extractor: racing,
      vector: store,
      facts: 'force',
    });
    expect(result.status).toBe('done');
    expect(result.applied).not.toContain('juristic_id');
    expect((await getDbdRecord(svc, recordId))?.juristic_id).toBe('0999999999999');
    await svc.from('dbd_records').update({ juristic_id: '0105569000123' }).eq('id', recordId);
  });

  it('re-reads a batch that overflows the output limit page by page instead of failing the run', async () => {
    // Empty the lists and forget the cached list sweeps; the sheet's sweep stays cached.
    await svc.from('dbd_records').update({ structured_data: {} }).eq('id', recordId);
    await svc.from('dbd_sweeps').delete().eq('document_id', docIds.list);
    const sizes: number[] = [];
    const overflowing = fakeWith({
      async sweep(pages, type) {
        sizes.push(pages.length);
        if (pages.length > 1) throw new ExtractionError('cut off', 'too_large');
        return new FakeDbdExtractor().sweep(pages, type);
      },
    });
    const result = await fillRecordFromTranscripts(svc, recordId, {
      extractor: overflowing,
      vector: store,
      sweepPages: 3,
    });
    expect(result.status).toBe('done');
    expect(sizes).toEqual([3, 1, 1, 1]);
    expect(result.lists.sort()).toEqual(['objectives', 'share_structure', 'shareholders']);
  });

  it('stores a big swept list whole and readable, dropping only rows without a name', async () => {
    await svc.from('dbd_records').update({ structured_data: {} }).eq('id', recordId);
    await svc.from('dbd_sweeps').delete().eq('document_id', docIds.list);
    const big = fakeWith({
      async sweep(pages, type) {
        const out = structuredClone(EMPTY_SWEEP);
        if (type === 'shareholder_list') {
          out.shareholders = [
            { name: '', nationality: 'ไทย', shares: 1, percent: null },
            ...Array.from({ length: 600 }, (_, i) => ({
              name: `ผู้ถือหุ้น ${i + 1}`,
              nationality: 'ไทย',
              shares: 10,
              percent: null,
            })),
          ];
        }
        return out;
      },
    });
    await fillRecordFromTranscripts(svc, recordId, {
      extractor: big,
      vector: store,
      sweepPages: 3,
    });
    const record = (await getDbdRecord(svc, recordId))!;
    const business = readStructuredData(record.structured_data).business!;
    expect(business.shareholders).toHaveLength(600);
    expect(business.shareholders[0]?.name).toBe('ผู้ถือหุ้น 1');
  });

  it('queues a transcript job for a record without touching document status, once', async () => {
    expect(await enqueueTranscriptJob(svc, { recordId, documentId: docIds.list })).toBe('queued');
    const { data: job } = await svc
      .from('index_jobs')
      .select('*')
      .eq('document_id', docIds.list)
      .eq('kind', 'transcript')
      .single();
    expect(job).toMatchObject({ status: 'queued', record_id: recordId, next_page: 2 });
    const [doc] = (await listDbdDocuments(svc, recordId)).filter((d) => d.id === docIds.list);
    expect(doc.index_status).toBe('ready');
    expect(await enqueueTranscriptJob(svc, { recordId, documentId: docIds.list })).toBe(
      'already_live',
    );
    const { count } = await svc
      .from('index_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', docIds.list)
      .in('status', ['queued', 'running']);
    expect(count).toBe(1);
    // A "Read again" asks the live job to re-read the particulars.
    await enqueueTranscriptJob(svc, { recordId, documentId: docIds.list, rereadFacts: true });
    const { data: again } = await svc
      .from('index_jobs')
      .select('next_page')
      .eq('id', job!.id)
      .single();
    expect(again?.next_page).toBe(1);
    await svc.from('index_jobs').delete().eq('id', job!.id);
  });
});

describe('a mixed pack (small certificate + oversized shareholder list)', () => {
  let admin: TestUser;
  let asAdmin: Client;
  let recordId: string;
  let listId: string;
  // A certificate read whole yields the particulars but no lists (those live in the บอจ.5).
  const certificateOnly = () =>
    fakeWith({
      async extract() {
        const out = await new FakeDbdExtractor().extractFacts([]);
        out.documents = [
          { index: 1, document_type: 'certificate', title_as_printed: 'หนังสือรับรอง', pages: 3 },
        ];
        return out;
      },
    });

  beforeAll(async () => {
    admin = await createTestUser('admin');
    asAdmin = await clientFor(admin);
    recordId = (await createDbdRecord(asAdmin, dbdRecordInputSchema.parse({}), admin.id)).id;
    // An interview answer typed before any read must survive every pass (Level 4).
    await updateDbdRecord(asAdmin, recordId, dbdRecordInputSchema.parse({}), {
      interview: { ...EMPTY_INTERVIEW_PROFILE, account_purpose: 'รับเงินจากลูกค้าออนไลน์' },
    });
    // The certificate is small (3 real pages) and read whole; the list is oversized and indexed.
    await uploadDbdDocument(
      asAdmin,
      recordId,
      new File([fixture], 'cert.pdf', { type: 'application/pdf' }),
      'cert.pdf',
    );
    listId = await seedReady(asAdmin, recordId, 'shareholder_list', [3, 4], 'list.pdf');
  });

  afterAll(() => cleanup(recordId, admin.id));

  it('reads the certificate now and queues the list for the background, without re-reading the particulars', async () => {
    const result = await extractAndApply(asAdmin, recordId, certificateOnly(), store);
    expect(result.applied).toContain('company_name_th');
    expect(result.transcripts).toBe('queued');
    const { data: job } = await svc
      .from('index_jobs')
      .select('kind, status, next_page')
      .eq('document_id', listId)
      .in('status', ['queued', 'running'])
      .single();
    expect(job).toMatchObject({ kind: 'transcript', status: 'queued', next_page: 2 });
  });

  it('the background fill adds the lists with their own provenance and leaves the rest alone', async () => {
    let facts = 0;
    const counting = fakeWith({
      async extractFacts(passages) {
        facts++;
        return new FakeDbdExtractor().extractFacts(passages);
      },
    });
    const run = await fillRecordFromTranscripts(svc, recordId, {
      extractor: counting,
      vector: store,
    });
    expect(run.status).toBe('done');
    expect(facts).toBe(0); // the certificate already supplied the particulars
    expect(run.lists).toContain('shareholders');
    const record = (await getDbdRecord(svc, recordId))!;
    const structured = readStructuredData(record.structured_data);
    expect(structured.provenance?.company_name_th).toMatchObject({ source_document: 1 });
    expect(structured.provenance?.shareholders).toMatchObject({ source_document: 2 });
    expect(structured.interview?.account_purpose).toBe('รับเงินจากลูกค้าออนไลน์');
  });

  it('"Read again" keeps the transcript path\'s provenance and the interview answers', async () => {
    const result = await extractAndApply(asAdmin, recordId, certificateOnly(), store);
    expect(result.transcripts).toBe('queued');
    const record = (await getDbdRecord(svc, recordId))!;
    const structured = readStructuredData(record.structured_data);
    expect(structured.provenance?.shareholders).toMatchObject({ source_document: 2 });
    expect(structured.provenance?.company_name_th).toMatchObject({ source_document: 1 });
    expect(structured.interview?.account_purpose).toBe('รับเงินจากลูกค้าออนไลน์');
    expect(structured.business?.shareholders.length).toBeGreaterThan(0);
  });
});
