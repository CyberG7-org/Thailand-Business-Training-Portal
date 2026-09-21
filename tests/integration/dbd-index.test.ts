import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  enqueueIndexJob,
  listChunkIds,
  processIndexJobs,
  searchRecordPassages,
} from '@/lib/db/dbd-index';
import { createDbdRecord, listDbdDocuments, uploadDbdDocument } from '@/lib/db/dbd-records';
import { MissingPagesError, type Slice, type TranscribedPage } from '@/lib/domain/rag/transcript';
import { dbdRecordInputSchema } from '@/lib/domain/dbd-record';
import type { Chunk } from '@/lib/domain/rag/chunk';
import { FakeDbdExtractor } from '@/lib/integrations/extraction/fake';
import type { DbdExtractor } from '@/lib/integrations/extraction/types';
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
const pdfFile = () => new File([fixture], 'pack.pdf', { type: 'application/pdf' });

/** A vector store that remembers what it was asked to remove. */
class RecordingStore extends FakeVectorStore {
  removed: string[] = [];
  indexed: Chunk[][] = [];
  override async remove(ids: string[]) {
    this.removed.push(...ids);
  }
  override async index(chunks: Chunk[]) {
    this.indexed.push(chunks);
  }
}

function transcriberWith(pages: (range: Slice) => TranscribedPage[]): DbdExtractor {
  return {
    name: 'custom',
    async extract(documents) {
      return new FakeDbdExtractor().extract(documents);
    },
    async transcribe(_slice, range) {
      return pages(range);
    },
    async classify(text) {
      return new FakeDbdExtractor().classify(text);
    },
    async extractFacts(passages) {
      return new FakeDbdExtractor().extractFacts(passages);
    },
    async sweep(batch, type) {
      return new FakeDbdExtractor().sweep(batch, type);
    },
  };
}

describe('index jobs and the worker', () => {
  let admin: TestUser;
  let asAdmin: Client;
  let recordId: string;
  let store: RecordingStore;
  const svc = adminClient();

  beforeAll(async () => {
    admin = await createTestUser('admin');
    asAdmin = await clientFor(admin);
    recordId = (await createDbdRecord(asAdmin, dbdRecordInputSchema.parse({}), admin.id)).id;
    store = new RecordingStore(loadChunksFromDb);
    // The worker claims the oldest due job in the shared local database; neutralise anything an
    // earlier suite (e.g. the e2e re-index click) left queued so this file only sees its own jobs.
    const { error } = await svc
      .from('index_jobs')
      .update({ status: 'done', locked_until: null, last_error: 'cleared by dbd-index.test' })
      .in('status', ['queued', 'running']);
    if (error) throw error;
  });

  /** The newest job of a document; re-indexing adds a row once the previous one is done. */
  async function latestJob(documentId: string) {
    const { data, error } = await svc
      .from('index_jobs')
      .select('*')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (error) throw error;
    return data;
  }

  afterAll(async () => {
    const docs = await listDbdDocuments(svc, recordId);
    if (docs.length > 0) await svc.storage.from('dbd-documents').remove(docs.map((d) => d.path));
    await svc.from('dbd_records').delete().eq('id', recordId);
    await deleteTestUser(admin.id);
  });

  it('upload counts the pages and queues one job', async () => {
    await uploadDbdDocument(asAdmin, recordId, pdfFile(), 'pack.pdf');
    const [doc] = await listDbdDocuments(asAdmin, recordId);
    expect(doc.page_count).toBe(3);
    expect(doc.index_status).toBe('queued');
    const { data: jobs } = await svc.from('index_jobs').select('*').eq('document_id', doc.id);
    expect(jobs).toHaveLength(1);
    expect(jobs?.[0]).toMatchObject({ status: 'queued', next_page: 1, attempts: 0 });
  });

  it('reads one slice per run when the budget is exhausted, then finishes', async () => {
    const deps = { extractor: new FakeDbdExtractor(), vector: store, slicePages: 2, budgetMs: 0 };
    const first = await processIndexJobs(deps);
    expect(first).toMatchObject({ claimed: 1, slices: 1, completed: 0, released: 1 });
    let [doc] = await listDbdDocuments(svc, recordId);
    expect(doc).toMatchObject({ index_status: 'indexing', indexed_pages: 2 });
    let job = await latestJob(doc.id);
    expect(job).toMatchObject({ status: 'queued', next_page: 3, attempts: 0 });

    const second = await processIndexJobs(deps);
    expect(second).toMatchObject({ claimed: 1, slices: 1, completed: 1 });
    [doc] = await listDbdDocuments(svc, recordId);
    expect(doc).toMatchObject({ index_status: 'ready', indexed_pages: 3, index_error: null });
    job = await latestJob(doc.id);
    expect(job?.status).toBe('done');

    const { data: pages } = await svc
      .from('dbd_pages')
      .select('page')
      .eq('document_id', doc.id)
      .order('page');
    expect(pages?.map((p) => p.page)).toEqual([1, 2, 3]);
    expect((await listChunkIds(svc, doc.id)).length).toBeGreaterThanOrEqual(3);
    expect(await processIndexJobs(deps)).toMatchObject({ claimed: 0 });
  });

  it('finds the passage that answers a question, with its page', async () => {
    const hits = await searchRecordPassages(store, recordId, 'ทุนจดทะเบียน', { topK: 2 });
    expect(hits?.[0]).toMatchObject({ page: 1 });
    expect(hits?.[0].text).toContain('2,000,000');
    expect(await searchRecordPassages(null, recordId, 'ทุนจดทะเบียน')).toBeNull();
  });

  it('re-indexing removes chunks that no longer exist', async () => {
    const [doc] = await listDbdDocuments(svc, recordId);
    const pagesOf = (text: (p: number) => string) =>
      transcriberWith((range) => {
        const pages: TranscribedPage[] = [];
        for (let p = range.firstPage; p <= range.lastPage; p++) {
          pages.push({ page: p, text: text(p) });
        }
        return pages;
      });
    // First pass: three ~400-character items per page → two chunks per page.
    const item = (n: number) =>
      `${n}. ${'ประกอบกิจการค้าปลีกและค้าส่งสินค้าอุปโภคบริโภค '.repeat(8).trim()}`;
    await enqueueIndexJob(asAdmin, { recordId, documentId: doc.id, kind: 'reindex' });
    await processIndexJobs({
      extractor: pagesOf(() => [1, 2, 3].map(item).join('\n')),
      vector: store,
      budgetMs: 60_000,
    });
    const before = await listChunkIds(svc, doc.id);
    expect(before).toContain(`${doc.id}#1#1`);

    // Second pass: one short line per page → one chunk per page; the "#1" chunks are stale.
    await enqueueIndexJob(asAdmin, { recordId, documentId: doc.id, kind: 'reindex' });
    await processIndexJobs({
      extractor: pagesOf((p) => `หน้า ${p}`),
      vector: store,
      budgetMs: 60_000,
    });
    const after = await listChunkIds(svc, doc.id);
    expect(after).toEqual([1, 2, 3].map((p) => `${doc.id}#${p}#0`));
    const stale = before.filter((id) => !after.includes(id));
    expect(stale).toHaveLength(3);
    expect(store.removed).toEqual(expect.arrayContaining(stale));
  });

  it('retries a transcript that skipped a page once, then backs off and finally fails', async () => {
    const [doc] = await listDbdDocuments(svc, recordId);
    await enqueueIndexJob(asAdmin, { recordId, documentId: doc.id, kind: 'reindex' });
    let calls = 0;
    const skipsPageTwo: DbdExtractor = {
      ...transcriberWith(() => []),
      async transcribe(_slice, range) {
        calls++;
        throw new MissingPagesError([range.firstPage + 1]);
      },
    };
    const run = await processIndexJobs({
      extractor: skipsPageTwo,
      vector: store,
      budgetMs: 60_000,
    });
    expect(run).toMatchObject({ claimed: 1, failed: 0, released: 1 });
    expect(calls).toBe(2);
    let job = await latestJob(doc.id);
    expect(job).toMatchObject({ status: 'queued', attempts: 1 });
    expect(job?.last_error).toMatch(/missing page/i);
    expect(new Date(job.locked_until!).getTime()).toBeGreaterThan(Date.now());

    // Force the remaining attempts through by expiring the lease each time.
    for (let i = 0; i < 4; i++) {
      await svc
        .from('index_jobs')
        .update({ locked_until: new Date(0).toISOString() })
        .eq('id', job.id);
      await processIndexJobs({ extractor: skipsPageTwo, vector: store, budgetMs: 60_000 });
    }
    job = await latestJob(doc.id);
    expect(job).toMatchObject({ status: 'failed', attempts: 5 });
    const [failedDoc] = await listDbdDocuments(svc, recordId);
    expect(failedDoc.index_status).toBe('failed');
    expect(failedDoc.index_error).toMatch(/missing page/i);
  });

  it('two claims never hand out the same job', async () => {
    const [doc] = await listDbdDocuments(svc, recordId);
    await enqueueIndexJob(asAdmin, { recordId, documentId: doc.id });
    await uploadDbdDocument(asAdmin, recordId, pdfFile(), 'second.pdf');
    const [a, b] = await Promise.all([
      svc.rpc('claim_index_jobs', { p_limit: 1 }),
      svc.rpc('claim_index_jobs', { p_limit: 1 }),
    ]);
    const ids = [...(a.data ?? []), ...(b.data ?? [])].map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(2);
  });

  it('re-labels chunks when the document type is classified while the job runs', async () => {
    // The direct extraction classifies the document in parallel with the index job; whichever
    // finishes second must not leave the chunks (and their vector metadata) with the old type.
    const [doc] = await listDbdDocuments(svc, recordId);
    await svc.from('dbd_documents').update({ document_type: null }).eq('id', doc.id);
    await enqueueIndexJob(asAdmin, { recordId, documentId: doc.id, kind: 'reindex' });
    const classifiesMidway: DbdExtractor = {
      ...transcriberWith(() => []),
      async transcribe(_slice, range) {
        await svc.from('dbd_documents').update({ document_type: 'certificate' }).eq('id', doc.id);
        return [{ page: range.firstPage, text: 'หน้าเดียว' }];
      },
    };
    store.indexed = [];
    await processIndexJobs({
      extractor: classifiesMidway,
      vector: store,
      slicePages: 1,
      budgetMs: 60_000,
    });
    const { data: rows } = await svc
      .from('dbd_chunks')
      .select('document_type')
      .eq('document_id', doc.id);
    expect(rows?.every((r) => r.document_type === 'certificate')).toBe(true);
    const last = store.indexed[store.indexed.length - 1];
    expect(last.every((c) => c.documentType === 'certificate')).toBe(true);
  });

  it('fails a job whose runs keep dying before the worker can report an error', async () => {
    // A lease that expired while `running` means the previous run was killed (timeout, OOM);
    // the claim counts it as an attempt and the worker must honour the ceiling.
    const [doc] = await listDbdDocuments(svc, recordId);
    const job = await latestJob(doc.id);
    await svc
      .from('index_jobs')
      .update({ status: 'running', attempts: 4, locked_until: new Date(0).toISOString() })
      .eq('id', job.id);
    const run = await processIndexJobs({
      extractor: new FakeDbdExtractor(),
      vector: store,
      budgetMs: 60_000,
    });
    expect(run.failed).toBeGreaterThanOrEqual(1);
    const after = await latestJob(doc.id);
    expect(after).toMatchObject({ status: 'failed', attempts: 5 });
    expect(after.last_error).toMatch(/died/i);
    const [failedDoc] = await listDbdDocuments(svc, recordId);
    expect(failedDoc).toMatchObject({ index_status: 'failed' });
  });

  it('marks documents skipped when no provider is available', async () => {
    const docs = await listDbdDocuments(svc, recordId);
    await svc
      .from('index_jobs')
      .update({ status: 'queued', locked_until: null })
      .in('status', ['queued', 'running'])
      .in(
        'document_id',
        docs.map((d) => d.id),
      );
    const run = await processIndexJobs({ extractor: null, vector: store, budgetMs: 60_000 });
    expect(run.skipped).toBeGreaterThanOrEqual(1);
    const after = await listDbdDocuments(svc, recordId);
    expect(after.some((d) => d.index_status === 'skipped')).toBe(true);
  });
});
