import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  EMPTY_BUSINESS_PROFILE,
  readStructuredData,
  type BusinessProfile,
  type Provenance,
  type StructuredData,
} from '@/lib/domain/dbd-profile';
import { applyExtractionToRecord } from '@/lib/domain/extraction-merge';
import type { TranscribedPage } from '@/lib/domain/rag/transcript';
import {
  DEFAULT_SWEEP_PAGES,
  LIST_AUTHORITY,
  SWEEP_TYPES,
  hasShareStructure,
  mergeSweeps,
  sanitizeSweptLists,
  selectByTypeAuthority,
  type DocumentType,
  type SweepResult,
  type SweptList,
} from '@/lib/integrations/extraction/transcript-schema';
import {
  EXTRACTION_NUMBER_FIELDS,
  EXTRACTION_TEXT_FIELDS,
  ExtractionError,
  type DbdExtraction,
  type DbdExtractor,
  type ExtractedField,
  type TranscriptPassage,
} from '@/lib/integrations/extraction/types';
import { VectorError, type VectorStore } from '@/lib/integrations/vector/types';
import type { Database, Json } from './database.types';
import {
  getDbdRecord,
  listDbdDocuments,
  type DbdDocumentRow,
  type DbdRecordRow,
} from './dbd-records';
import { parseStoredExtraction } from './extraction';
import { recordToFormValues } from './record-form-values';

type Db = SupabaseClient<Database>;

/** Thai retrieval keys, one per fact group of the certificate (spec §6). */
export const FACT_QUERIES = [
  'ชื่อบริษัท ทะเบียนเลขที่ เลขทะเบียนนิติบุคคล',
  'ทุนจดทะเบียน บาท',
  'กรรมการของบริษัท ลงลายมือชื่อผูกพันบริษัท',
  'สำนักงานแห่งใหญ่ ตั้งอยู่เลขที่ จังหวัด',
  'จดทะเบียนเมื่อวันที่ ก่อตั้ง',
  'ออกให้ ณ วันที่ นายทะเบียน สำนักงานทะเบียน',
  'หนังสือรับรอง เลขที่ อ้างอิง',
  'วัตถุที่ประสงค์ จำนวน ข้อ',
];

const SWEPT_LISTS: SweptList[] = ['shareholders', 'share_structure', 'objectives', 'promoters'];
/** Sweeps carry no per-row confidence; the lists are shown for review at this level. */
const LIST_CONFIDENCE = 0.9;
const CAS_ATTEMPTS = 5;

export type TranscriptRunOptions = {
  extractor: DbdExtractor | null;
  vector: VectorStore | null;
  /** Pages per sweep call (default 10). */
  sweepPages?: number;
  /** Stop starting new sweeps after this much work; at least one sweep per run. */
  budgetMs?: number;
  now?: () => number;
  /** `force` re-reads the particulars even when an extraction is stored; `auto` only when none is. */
  facts?: 'auto' | 'force';
};

export type TranscriptRunResult = {
  /** `released` = work left when the budget ran out; the next run continues from the cache. */
  status: 'done' | 'released' | 'skipped';
  skipped: 'confirmed' | 'no_ready_documents' | 'not_configured' | 'not_found' | null;
  /** Level 1/3 columns this run filled. */
  applied: string[];
  /** Level 2 lists this run filled. */
  lists: string[];
  /** The particulars were read (or did not need reading); a job can stop asking for them. */
  factsSettled: boolean;
};

/**
 * Fills a record from its transcripts (spec §6, D42): the particulars by retrieval + one
 * structured call, the Level 2 lists by page-batched sweeps of the typed documents, each list
 * from the document kind that is authoritative for it. Every write is conditional — only a
 * column or list that is still empty at write time, never on a confirmed record — so a run that
 * overlaps the admin's editing cannot undo it (spec §6). Sweep batches are cached per document
 * (`dbd_sweeps`), so a run cut short by its budget or a crash repeats no model call.
 */
export async function fillRecordFromTranscripts(
  db: Db,
  recordId: string,
  options: TranscriptRunOptions,
): Promise<TranscriptRunResult> {
  const result: TranscriptRunResult = {
    status: 'done',
    skipped: null,
    applied: [],
    lists: [],
    factsSettled: false,
  };
  const skip = (why: TranscriptRunResult['skipped']): TranscriptRunResult => ({
    ...result,
    status: 'skipped',
    skipped: why,
  });
  if (!options.extractor || !options.vector) return skip('not_configured');
  const { extractor, vector } = options;
  const now = options.now ?? Date.now;
  const budgetMs = options.budgetMs ?? Number.POSITIVE_INFINITY;
  const sweepPages = Math.max(1, Math.floor(options.sweepPages ?? DEFAULT_SWEEP_PAGES));
  const started = now();
  let sweepCalls = 0;
  const outOfBudget = () => sweepCalls > 0 && now() - started >= budgetMs;

  const record = await getDbdRecord(db, recordId);
  if (!record) return skip('not_found');
  if (record.extraction_status === 'confirmed') return skip('confirmed');
  const documents = (await listDbdDocuments(db, recordId)).filter(
    (d) => d.index_status === 'ready',
  );
  if (documents.length === 0) return skip('no_ready_documents');

  // ---- particulars by retrieval ---------------------------------------------------------------
  if (options.facts === 'force' || record.extraction_raw === null) {
    const passages = await retrieveFactPassages(vector, recordId, documents);
    if (passages.length > 0) {
      const facts = await extractor.extractFacts(passages);
      const written = await writeFacts(db, recordId, facts);
      if (written === 'confirmed') return skip('confirmed');
      result.applied = written;
    }
  }
  result.factsSettled = true;

  // ---- lists by sweeps ------------------------------------------------------------------------
  const sweeps: { type: DocumentType; result: SweepResult }[] = [];
  let business = readStructuredData(record.structured_data).business ?? EMPTY_BUSINESS_PROFILE;
  const needed = () => {
    const picked = selectByTypeAuthority(sweeps);
    return SWEPT_LISTS.filter((list) => isEmptyList(business, list) && isEmptyList(picked, list));
  };
  for (const type of SWEEP_TYPES) {
    const wanted = needed();
    if (!wanted.some((list) => LIST_AUTHORITY[list].includes(type))) continue;
    const typed = documents.filter((d) => d.document_type === type);
    if (typed.length === 0) continue;
    for (const doc of typed) {
      const outcome = await sweepDocument(db, extractor, doc, type, sweepPages, {
        outOfBudget,
        onCall: () => sweepCalls++,
      });
      if (outcome === 'released') return { ...result, status: 'released' };
      sweeps.push(...outcome.map((r) => ({ type, result: r })));
    }
    const picked = sanitizeSweptLists(selectByTypeAuthority(sweeps));
    const supplier = (list: SweptList) => supplierPosition(sweeps, documents, list);
    const written = await writeLists(db, recordId, picked, supplier);
    if (written === 'confirmed') return skip('confirmed');
    result.lists.push(...written.lists);
    business = written.business;
  }
  return result;
}

function isEmptyList(profile: BusinessProfile | SweepResult, list: SweptList): boolean {
  if (list === 'share_structure') return !hasShareStructure(profile.share_structure);
  return profile[list].length === 0;
}

/** Position (upload order) of the first document whose kind supplied the list; null if none. */
function supplierPosition(
  sweeps: { type: DocumentType; result: SweepResult }[],
  documents: DbdDocumentRow[],
  list: SweptList,
): number | null {
  for (const type of LIST_AUTHORITY[list]) {
    const merged = mergeSweeps(sweeps.filter((s) => s.type === type).map((s) => s.result));
    if (isEmptyList(merged, list)) continue;
    const doc = documents
      .filter((d) => d.document_type === type)
      .sort((a, b) => a.position - b.position)[0];
    return doc ? doc.position : null;
  }
  return null;
}

async function retrieveFactPassages(
  vector: VectorStore,
  recordId: string,
  documents: DbdDocumentRow[],
): Promise<TranscriptPassage[]> {
  const positionOf = new Map(documents.map((d) => [d.id, d.position]));
  const failures: unknown[] = [];
  const results = await Promise.all(
    FACT_QUERIES.map((query) =>
      vector.search({ recordId, query, topK: 3 }).catch((e: unknown) => {
        failures.push(e);
        return null;
      }),
    ),
  );
  if (failures.length === FACT_QUERIES.length) {
    // A dead store must not read as "nothing to fill": fail the attempt so the job retries.
    const first = failures[0];
    throw first instanceof VectorError ? first : new Error('retrieval failed for every query');
  }
  for (const e of failures) console.error('transcript facts: a retrieval query failed', e);
  const seen = new Set<string>();
  const out: TranscriptPassage[] = [];
  for (const hits of results) {
    for (const hit of hits ?? []) {
      if (seen.has(hit.id)) continue;
      seen.add(hit.id);
      out.push({
        documentPosition: positionOf.get(hit.documentId) ?? 0,
        page: hit.page,
        text: hit.text,
      });
    }
  }
  return out;
}

/**
 * Fills the Level 1/3 columns the particulars supply, one conditional update per column (only
 * while it is still empty and the record unconfirmed), then records provenance and the facts
 * themselves in `extraction_raw` so the form shows the confidence cue for what was filled.
 */
async function writeFacts(
  db: Db,
  recordId: string,
  facts: DbdExtraction,
): Promise<string[] | 'confirmed'> {
  const fresh = await getDbdRecord(db, recordId);
  if (!fresh) return [];
  if (fresh.extraction_status === 'confirmed') return 'confirmed';
  const patch = applyExtractionToRecord(facts, recordToFormValues(fresh));
  const written: string[] = [];
  for (const field of patch.applied) {
    const column = field === 'directors_text' ? 'directors' : field;
    const value =
      column === 'directors'
        ? (patch.input.directors as unknown as Json)
        : (patch.input as unknown as Record<string, unknown>)[column];
    let query = db
      .from('dbd_records')
      .update({ [column]: value } as Database['public']['Tables']['dbd_records']['Update'])
      .eq('id', recordId)
      .neq('extraction_status', 'confirmed');
    query =
      column === 'directors'
        ? query.or('directors.is.null,directors.eq.[]')
        : query.is(column, null);
    const { data, error } = await query.select('id');
    if (error) throw error;
    if (data && data.length > 0) written.push(field);
  }
  const merged = await mergeRecord(db, recordId, (row) => {
    const structured = readStructuredData(row.structured_data);
    const provenance: Provenance = { ...(structured.provenance ?? {}) };
    for (const field of written) {
      const key = field === 'directors_text' ? 'directors' : field;
      const entry = (facts as unknown as Record<string, ExtractedField<unknown> | undefined>)[key];
      if (entry) {
        provenance[key] = {
          confidence: entry.confidence,
          source_page: entry.source_page ?? null,
          source_document: entry.source_document ?? null,
        };
      }
    }
    return {
      structured_data: { ...structured, provenance } as unknown as Json,
      extraction_raw: mergeExtractionRaw(row.extraction_raw, facts) as unknown as Json,
      ...extractedStatus(row),
    };
  });
  return merged === 'confirmed' ? 'confirmed' : written;
}

/** Keeps a stored extraction's readings; the facts fill only the fields it left empty. */
function mergeExtractionRaw(existingRaw: unknown, facts: DbdExtraction): DbdExtraction {
  const existing = parseStoredExtraction(existingRaw);
  if (!existing) return facts;
  const out = structuredClone(existing) as unknown as Record<string, ExtractedField<unknown>>;
  const incoming = facts as unknown as Record<string, ExtractedField<unknown>>;
  for (const field of [...EXTRACTION_TEXT_FIELDS, ...EXTRACTION_NUMBER_FIELDS, 'directors']) {
    if (out[field]?.value === null && incoming[field]?.value != null) out[field] = incoming[field];
  }
  return out as unknown as DbdExtraction;
}

async function writeLists(
  db: Db,
  recordId: string,
  picked: SweepResult,
  supplier: (list: SweptList) => number | null,
): Promise<{ lists: string[]; business: BusinessProfile } | 'confirmed'> {
  let lists: string[] = [];
  let business: BusinessProfile = EMPTY_BUSINESS_PROFILE;
  const merged = await mergeRecord(db, recordId, (row) => {
    const structured = readStructuredData(row.structured_data);
    business = structuredClone(structured.business ?? EMPTY_BUSINESS_PROFILE);
    lists = [];
    for (const list of ['shareholders', 'objectives', 'promoters'] as const) {
      if (business[list].length === 0 && picked[list].length > 0) {
        (business as Record<string, unknown>)[list] = picked[list];
        lists.push(list);
      }
    }
    if (!hasShareStructure(business.share_structure) && hasShareStructure(picked.share_structure)) {
      business.share_structure = { ...picked.share_structure };
      lists.push('share_structure');
    }
    if (lists.length === 0) return null;
    const provenance: Provenance = { ...(structured.provenance ?? {}) };
    for (const list of lists) {
      provenance[list] = {
        confidence: LIST_CONFIDENCE,
        source_page: null,
        source_document: supplier(list as SweptList),
      };
    }
    const next: StructuredData = { ...structured, business, provenance };
    return { structured_data: next as unknown as Json, ...extractedStatus(row) };
  });
  if (merged === 'confirmed') return 'confirmed';
  if (merged === null) return { lists: [], business };
  return { lists, business };
}

function extractedStatus(row: DbdRecordRow): { extraction_status?: 'extracted' } {
  return row.extraction_status === 'none' || row.extraction_status === 'pending'
    ? { extraction_status: 'extracted' }
    : {};
}

/**
 * Read-merge-write guarded by `updated_at`: the patch is computed from the row as it is now and
 * applies only if nothing else wrote in between (else recomputed), never on a confirmed record.
 * `mutate` returns null when there is nothing to change.
 */
async function mergeRecord(
  db: Db,
  recordId: string,
  mutate: (row: DbdRecordRow) => Database['public']['Tables']['dbd_records']['Update'] | null,
): Promise<DbdRecordRow | 'confirmed' | null> {
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
    const row = await getDbdRecord(db, recordId);
    if (!row) return null;
    if (row.extraction_status === 'confirmed') return 'confirmed';
    const patch = mutate(row);
    if (!patch) return null;
    const { data, error } = await db
      .from('dbd_records')
      .update(patch)
      .eq('id', recordId)
      .eq('updated_at', row.updated_at)
      .neq('extraction_status', 'confirmed')
      .select()
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  throw new Error('The record kept changing while it was being filled');
}

type SweepRow = { first_page: number; last_page: number; result: SweepResult };

/**
 * Sweeps one document in page batches, reading cached batches from `dbd_sweeps` and storing new
 * ones as they come back. Returns the batches in page order, or `released` when the budget ran
 * out before an uncached batch (what was read so far is cached for the next run).
 */
async function sweepDocument(
  db: Db,
  extractor: DbdExtractor,
  doc: DbdDocumentRow,
  type: DocumentType,
  sweepPages: number,
  run: { outOfBudget: () => boolean; onCall: () => void },
): Promise<SweepResult[] | 'released'> {
  const { data: pageRows, error: pageError } = await db
    .from('dbd_pages')
    .select('page, text')
    .eq('document_id', doc.id)
    .order('page');
  if (pageError) throw pageError;
  const pages: TranscribedPage[] = pageRows ?? [];
  const { data: cachedRows, error: cacheError } = await db
    .from('dbd_sweeps')
    .select('first_page, last_page, result')
    .eq('document_id', doc.id);
  if (cacheError) throw cacheError;
  const cache = new Map<number, SweepRow>();
  for (const row of cachedRows ?? []) {
    cache.set(row.first_page, {
      first_page: row.first_page,
      last_page: row.last_page,
      result: row.result as unknown as SweepResult,
    });
  }

  const results: SweepResult[] = [];
  let i = 0;
  while (i < pages.length) {
    const cached = cache.get(pages[i].page);
    if (cached) {
      results.push(cached.result);
      i = pages.findIndex((p, j) => j > i && p.page > cached.last_page);
      if (i === -1) break;
      continue;
    }
    let end = Math.min(i + sweepPages, pages.length);
    for (let j = i + 1; j < end; j++) {
      if (cache.has(pages[j].page)) {
        end = j;
        break;
      }
    }
    if (run.outOfBudget()) return 'released';
    const rows = await sweepBatch(extractor, pages.slice(i, end), type, run.onCall);
    const { error } = await db.from('dbd_sweeps').upsert(
      rows.map((r) => ({
        document_id: doc.id,
        first_page: r.first_page,
        last_page: r.last_page,
        result: r.result as unknown as Json,
      })),
      { onConflict: 'document_id,first_page' },
    );
    if (error) throw error;
    results.push(...rows.map((r) => r.result));
    i = end;
  }
  return results;
}

/** One sweep call; a batch whose answer overflows the output limit is re-read page by page. */
async function sweepBatch(
  extractor: DbdExtractor,
  batch: TranscribedPage[],
  type: DocumentType,
  onCall: () => void,
): Promise<SweepRow[]> {
  const first = batch[0].page;
  const last = batch[batch.length - 1].page;
  try {
    onCall();
    return [{ first_page: first, last_page: last, result: await extractor.sweep(batch, type) }];
  } catch (e) {
    if (!(e instanceof ExtractionError) || e.code !== 'too_large' || batch.length === 1) throw e;
    const rows: SweepRow[] = [];
    for (const page of batch) {
      onCall();
      const result = await extractor.sweep([page], type);
      rows.push({ first_page: page.page, last_page: page.page, result });
    }
    return rows;
  }
}
