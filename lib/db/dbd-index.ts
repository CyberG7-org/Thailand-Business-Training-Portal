import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { chunkPage, type Chunk } from '@/lib/domain/rag/chunk';
import { MAX_INDEX_ATTEMPTS, retryDelayMinutes } from '@/lib/domain/rag/jobs';
import {
  DEFAULT_SLICE_PAGES,
  MissingPagesError,
  planSlice,
  type Slice,
  type TranscribedPage,
} from '@/lib/domain/rag/transcript';
import { transcriptionModel } from '@/lib/integrations/extraction/transcribe';
import type { DbdExtractor } from '@/lib/integrations/extraction/types';
import type { Passage, VectorStore } from '@/lib/integrations/vector/types';
import { slicePdf } from '@/lib/pdf/slice';
import { createSupabaseAdminClient } from './admin';
import type { Database } from './database.types';

type Db = SupabaseClient<Database>;
export type IndexJobRow = Database['public']['Tables']['index_jobs']['Row'];

/** Queues (or resets) the one live job of a document and marks it `queued` (decision D41). */
export async function enqueueIndexJob(
  db: Db,
  input: { recordId: string; documentId: string; kind?: 'index' | 'reindex' },
): Promise<void> {
  const kind = input.kind ?? 'index';
  const { data: live, error } = await db
    .from('index_jobs')
    .select('id')
    .eq('document_id', input.documentId)
    .in('status', ['queued', 'running'])
    .maybeSingle();
  if (error) throw error;
  if (live) {
    const { error: e } = await db
      .from('index_jobs')
      .update({
        kind,
        status: 'queued',
        next_page: 1,
        attempts: 0,
        locked_until: null,
        last_error: null,
      })
      .eq('id', live.id);
    if (e) throw e;
  } else {
    const { error: e } = await db
      .from('index_jobs')
      .insert({ record_id: input.recordId, document_id: input.documentId, kind });
    if (e) throw e;
  }
  const { error: docError } = await db
    .from('dbd_documents')
    .update({ index_status: 'queued', indexed_pages: 0, index_error: null })
    .eq('id', input.documentId);
  if (docError) throw docError;
}

export async function listChunkIds(db: Db, documentId: string): Promise<string[]> {
  const { data, error } = await db
    .from('dbd_chunks')
    .select('id')
    .eq('document_id', documentId)
    .order('page')
    .order('chunk_index');
  if (error) throw error;
  return (data ?? []).map((r) => r.id);
}

/** Retrieval entry point for every consumer; null when no store is configured. */
export async function searchRecordPassages(
  vector: VectorStore | null,
  recordId: string,
  query: string,
  options: { topK?: number; documentTypes?: string[] } = {},
): Promise<Passage[] | null> {
  if (!vector) return null;
  return vector.search({ recordId, query, ...options });
}

export type IndexWorkerDeps = {
  extractor: DbdExtractor | null;
  vector: VectorStore | null;
  /** Stop claiming new slices after this much work; at least one slice per claimed job. */
  budgetMs?: number;
  slicePages?: number;
  now?: () => number;
  download?: (path: string) => Promise<Uint8Array>;
};

export type IndexRunSummary = {
  claimed: number;
  slices: number;
  completed: number;
  failed: number;
  skipped: number;
  /** Jobs put back in the queue with work left (budget) or after a failed attempt (backoff). */
  released: number;
};

async function downloadFromStorage(admin: Db, path: string): Promise<Uint8Array> {
  const { data, error } = await admin.storage.from('dbd-documents').download(path);
  if (error || !data) throw new Error(`Could not download ${path}`);
  return new Uint8Array(await data.arrayBuffer());
}

async function transcribeWithRetry(
  extractor: DbdExtractor,
  bytes: Uint8Array,
  slice: Slice,
): Promise<TranscribedPage[]> {
  const sliced = await slicePdf(bytes, slice);
  try {
    return await extractor.transcribe(sliced, slice);
  } catch (e) {
    if (!(e instanceof MissingPagesError)) throw e;
    return extractor.transcribe(sliced, slice);
  }
}

/** Persists a slice's pages and chunks; stale chunk ids of those pages leave the store first. */
async function storeSlice(
  admin: Db,
  vector: VectorStore,
  job: IndexJobRow,
  documentType: string | null,
  pages: TranscribedPage[],
  model: string,
): Promise<void> {
  const chunks: Chunk[] = pages.flatMap((p) =>
    chunkPage({
      recordId: job.record_id,
      documentId: job.document_id,
      documentType,
      page: p.page,
      text: p.text,
    }),
  );
  const keep = new Set(chunks.map((c) => c.id));
  const { data: existing, error: existingError } = await admin
    .from('dbd_chunks')
    .select('id')
    .eq('document_id', job.document_id)
    .in(
      'page',
      pages.map((p) => p.page),
    );
  if (existingError) throw existingError;
  const stale = (existing ?? []).map((r) => r.id).filter((id) => !keep.has(id));
  if (stale.length > 0) {
    await vector.remove(stale);
    const { error } = await admin.from('dbd_chunks').delete().in('id', stale);
    if (error) throw error;
  }
  const { error: pageError } = await admin.from('dbd_pages').upsert(
    pages.map((p) => ({ document_id: job.document_id, page: p.page, text: p.text, model })),
    { onConflict: 'document_id,page' },
  );
  if (pageError) throw pageError;
  if (chunks.length > 0) {
    const { error: chunkError } = await admin.from('dbd_chunks').upsert(
      chunks.map((c) => ({
        id: c.id,
        record_id: c.recordId,
        document_id: c.documentId,
        document_type: c.documentType,
        page: c.page,
        chunk_index: c.chunkIndex,
        chunk_text: c.text,
        char_count: c.text.length,
      })),
    );
    if (chunkError) throw chunkError;
    await vector.index(chunks);
  }
}

async function setDocument(
  admin: Db,
  documentId: string,
  patch: Database['public']['Tables']['dbd_documents']['Update'],
): Promise<void> {
  const { error } = await admin.from('dbd_documents').update(patch).eq('id', documentId);
  if (error) throw error;
}

async function setJob(
  admin: Db,
  jobId: string,
  patch: Database['public']['Tables']['index_jobs']['Update'],
): Promise<void> {
  const { error } = await admin.from('index_jobs').update(patch).eq('id', jobId);
  if (error) throw error;
}

/**
 * One worker run (cron): claims one job at a time and reads slices until the budget is spent.
 * A job is released with `next_page` advanced when the budget runs out, backed off after a
 * failed attempt, and marked `done` (document `ready`) after its last page.
 */
export async function processIndexJobs(deps: IndexWorkerDeps): Promise<IndexRunSummary> {
  const admin = createSupabaseAdminClient();
  const now = deps.now ?? Date.now;
  const budgetMs = deps.budgetMs ?? 240_000;
  const slicePages = deps.slicePages ?? DEFAULT_SLICE_PAGES;
  const download = deps.download ?? ((path: string) => downloadFromStorage(admin, path));
  const started = now();
  const summary: IndexRunSummary = {
    claimed: 0,
    slices: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    released: 0,
  };

  while (now() - started < budgetMs || summary.claimed === 0) {
    const { data: claimed, error } = await admin.rpc('claim_index_jobs', { p_limit: 1 });
    if (error) throw error;
    const job = claimed?.[0];
    if (!job) break;
    summary.claimed++;

    if (!deps.extractor || !deps.vector) {
      await setJob(admin, job.id, {
        status: 'done',
        locked_until: null,
        last_error: 'no provider',
      });
      await setDocument(admin, job.document_id, { index_status: 'skipped' });
      summary.skipped++;
      continue;
    }

    const { data: doc, error: docError } = await admin
      .from('dbd_documents')
      .select('id, path, page_count, document_type')
      .eq('id', job.document_id)
      .single();
    if (docError) throw docError;

    try {
      if (!doc.page_count) throw new Error('unreadable_pdf');
      const bytes = await download(doc.path);
      let nextPage = job.next_page;
      let done = false;
      await setDocument(admin, doc.id, { index_status: 'indexing' });
      do {
        const slice = planSlice(doc.page_count, nextPage, slicePages);
        if (!slice) {
          done = true;
          break;
        }
        const pages = await transcribeWithRetry(deps.extractor, bytes, slice);
        const model = deps.extractor.name === 'claude' ? transcriptionModel() : deps.extractor.name;
        await storeSlice(admin, deps.vector, job, doc.document_type, pages, model);
        nextPage = slice.lastPage + 1;
        summary.slices++;
        await setJob(admin, job.id, { next_page: nextPage });
        await setDocument(admin, doc.id, { indexed_pages: slice.lastPage });
        done = nextPage > doc.page_count;
      } while (!done && now() - started < budgetMs);

      if (done) {
        await setJob(admin, job.id, { status: 'done', locked_until: null, last_error: null });
        await setDocument(admin, doc.id, {
          index_status: 'ready',
          indexed_pages: doc.page_count,
          index_error: null,
        });
        summary.completed++;
      } else {
        await setJob(admin, job.id, { status: 'queued', locked_until: null });
        summary.released++;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const attempts = message === 'unreadable_pdf' ? MAX_INDEX_ATTEMPTS : job.attempts + 1;
      if (attempts >= MAX_INDEX_ATTEMPTS) {
        await setJob(admin, job.id, {
          status: 'failed',
          attempts,
          locked_until: null,
          last_error: message,
        });
        await setDocument(admin, job.document_id, { index_status: 'failed', index_error: message });
        summary.failed++;
      } else {
        await setJob(admin, job.id, {
          status: 'queued',
          attempts,
          last_error: message,
          locked_until: new Date(now() + retryDelayMinutes(attempts) * 60_000).toISOString(),
        });
        summary.released++;
      }
    }
  }
  return summary;
}
