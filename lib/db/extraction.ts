import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isBusinessProfileEmpty,
  readStructuredData,
  type BusinessProfile,
  type Provenance,
  type StructuredData,
} from '@/lib/domain/dbd-profile';
import { applyExtractionToRecord } from '@/lib/domain/extraction-merge';
import { DIRECT_READ_HARD_MAX_PAGES, planDirectRead } from '@/lib/domain/extraction-plan';
import { directReadMaxPages } from '@/lib/domain/rag/jobs';
import { getVectorStore, type VectorStore } from '@/lib/integrations/vector';
import {
  dbdExtractionSchema,
  normalizeStoredExtraction,
} from '@/lib/integrations/extraction/schema';
import {
  ExtractionError,
  type DbdExtraction,
  type DbdExtractor,
} from '@/lib/integrations/extraction/types';
import type { Database, Json } from './database.types';
import { enqueueTranscriptJob } from './dbd-index';
import { getDbdRecord, listDbdDocuments, updateDbdRecord, type DbdRecordRow } from './dbd-records';
import { recordToFormValues } from './record-form-values';

type Db = SupabaseClient<Database>;

/** Parses a stored `extraction_raw`, tolerating rows written before the three-level schema. */
export function parseStoredExtraction(raw: unknown): DbdExtraction | null {
  const parsed = dbdExtractionSchema.safeParse(normalizeStoredExtraction(raw));
  return parsed.success ? (parsed.data as DbdExtraction) : null;
}

/**
 * Runs the extractor over the record's documents that may travel whole (upload order) and stores
 * the raw result in `extraction_raw` (status `extracted`). Record columns are untouched here; the
 * fill step lives in `extractAndApply` (decision D37). With an index configured, documents over
 * `DIRECT_READ_MAX_PAGES` wait for the transcript path (`deferred`); without one they travel
 * whole up to the model's own page limit, beyond which they are `too_large`.
 */
export async function runExtraction(
  db: Db,
  recordId: string,
  extractor: DbdExtractor,
  vector: VectorStore | null = getVectorStore(),
): Promise<DbdRecordRow> {
  const record = await getDbdRecord(db, recordId);
  if (!record) throw new ExtractionError('Record not found', 'not_allowed');
  if (record.extraction_status === 'confirmed') {
    throw new ExtractionError('Confirmed records cannot be re-extracted', 'not_allowed');
  }
  const documents = await listDbdDocuments(db, recordId);
  if (documents.length === 0) {
    throw new ExtractionError('Upload the certificate PDF first', 'no_document');
  }
  // Only small documents travel whole (spec §5.1, D42); the rest wait for the transcript path.
  const plan = planDirectRead(documents, {
    maxPages: vector ? directReadMaxPages() : DIRECT_READ_HARD_MAX_PAGES,
  });
  if (plan.direct.length === 0) {
    throw vector
      ? new ExtractionError('Every document is too large to read whole', 'deferred')
      : new ExtractionError('The documents exceed the pages one read can take', 'too_large');
  }
  const readable = documents.filter((d) => plan.direct.includes(d.id));

  const previousStatus = record.extraction_status;
  const { error: pendingError } = await db
    .from('dbd_records')
    .update({ extraction_status: 'pending' })
    .eq('id', recordId);
  if (pendingError) throw pendingError;

  try {
    const bytes: Uint8Array[] = [];
    for (const doc of readable) {
      const { data: blob, error } = await db.storage.from('dbd-documents').download(doc.path);
      if (error || !blob) {
        throw new ExtractionError(`Could not download ${doc.original_name}`, 'provider');
      }
      bytes.push(new Uint8Array(await blob.arrayBuffer()));
    }
    const extraction = await extractor.extract(bytes);

    // Level 3: remember what each uploaded document turned out to be.
    for (const info of extraction.documents ?? []) {
      const doc = readable[info.index - 1];
      if (doc && doc.document_type !== info.document_type) {
        await db
          .from('dbd_documents')
          .update({ document_type: info.document_type })
          .eq('id', doc.id);
      }
    }

    const { data, error } = await db
      .from('dbd_records')
      .update({ extraction_raw: extraction as unknown as Json, extraction_status: 'extracted' })
      .eq('id', recordId)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    await db.from('dbd_records').update({ extraction_status: previousStatus }).eq('id', recordId);
    throw e;
  }
}

export type ExtractAndApplyResult = {
  record: DbdRecordRow;
  /** Form fields (Level 1/3) the extraction filled. */
  applied: string[];
  /** Fields whose extracted value failed validation and stayed empty. */
  rejected: string[];
  /** Whether the Level 2 business profile was filled from the documents. */
  businessFilled: boolean;
  /**
   * Oversized documents: `queued` = a background fill from their transcripts was scheduled;
   * `pending_index` = it will be once their index is ready; `none` = there are none.
   */
  transcripts: 'queued' | 'pending_index' | 'none';
};

/** Level 2 as the extractor returned it, in the stored shape. */
function extractedBusinessProfile(extraction: DbdExtraction): BusinessProfile {
  return {
    objectives: (extraction.objectives.value ?? []).map((o) => ({ no: o.no, text: o.text })),
    business_categories: extraction.business_categories.value ?? [],
    share_structure: extraction.share_structure.value ?? {
      total_shares: null,
      par_value: null,
      paid_up_capital: null,
      share_type: null,
    },
    shareholders: (extraction.shareholders.value ?? []).map((s) => ({
      name: s.name,
      nationality: s.nationality,
      shares: s.shares,
      percent: s.percent,
    })),
    promoters: (extraction.promoters.value ?? []).map((p) => ({
      name: p.name,
      nationality: p.nationality,
    })),
  };
}

/** Level 3 provenance for every field that carries a value. */
function extractedProvenance(extraction: DbdExtraction): Provenance {
  const out: Provenance = {};
  for (const [key, entry] of Object.entries(extraction)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !('confidence' in entry)) {
      continue;
    }
    const f = entry as {
      value: unknown;
      confidence: number;
      source_page: number | null;
      source_document: number | null;
    };
    const empty = f.value === null || (Array.isArray(f.value) && f.value.length === 0);
    if (empty) continue;
    out[key] = {
      confidence: f.confidence,
      source_page: f.source_page ?? null,
      source_document: f.source_document ?? null,
    };
  }
  return out;
}

/**
 * Runs the extractor and fills the record from what it read (decisions D37/D38): Level 1/3
 * columns only where empty, the Level 2 business profile only when nothing was entered yet,
 * provenance merged. Confirmation stays explicit. Oversized documents are never read here: their
 * fill runs as a background job once their index is ready (D42), which this schedules.
 */
export async function extractAndApply(
  db: Db,
  recordId: string,
  extractor: DbdExtractor,
  vector: VectorStore | null = getVectorStore(),
): Promise<ExtractAndApplyResult> {
  let direct: DirectPassResult | null = null;
  try {
    direct = await directPass(db, recordId, extractor, vector);
  } catch (e) {
    if (!(e instanceof ExtractionError) || e.code !== 'deferred') throw e;
  }
  // A "Read again" with nothing small enough re-reads the particulars from the transcripts too.
  const transcripts = vector
    ? await scheduleTranscriptFill(db, recordId, { rereadFacts: direct === null })
    : 'none';
  const record = direct?.record ?? (await getDbdRecord(db, recordId));
  if (!record) throw new ExtractionError('Record not found', 'not_allowed');
  return {
    record,
    applied: direct?.applied ?? [],
    rejected: direct?.rejected ?? [],
    businessFilled: direct?.businessFilled ?? false,
    transcripts,
  };
}

/** Queues the transcript fill for the record's oversized documents, if any is ready. */
async function scheduleTranscriptFill(
  db: Db,
  recordId: string,
  options: { rereadFacts: boolean },
): Promise<ExtractAndApplyResult['transcripts']> {
  const maxPages = directReadMaxPages();
  const oversized = (await listDbdDocuments(db, recordId)).filter(
    (d) => d.page_count !== null && d.page_count > maxPages,
  );
  if (oversized.length === 0) return 'none';
  const ready = oversized.find((d) => d.index_status === 'ready');
  if (!ready) return 'pending_index';
  const queued = await enqueueTranscriptJob(db, {
    recordId,
    documentId: ready.id,
    rereadFacts: options.rereadFacts,
  });
  // A re-index in flight queues the fill itself when it finishes.
  return queued === 'index_in_progress' ? 'pending_index' : 'queued';
}

type DirectPassResult = Omit<ExtractAndApplyResult, 'transcripts'>;

async function directPass(
  db: Db,
  recordId: string,
  extractor: DbdExtractor,
  vector: VectorStore | null,
): Promise<DirectPassResult> {
  const extracted = await runExtraction(db, recordId, extractor, vector);
  const extraction = parseStoredExtraction(extracted.extraction_raw);
  if (!extraction) {
    throw new ExtractionError('The stored extraction is not readable', 'invalid_output');
  }
  const { input, applied, rejected } = applyExtractionToRecord(
    extraction,
    recordToFormValues(extracted),
  );

  const current = readStructuredData(extracted.structured_data);
  const currentBusiness = current.business ?? null;
  const business = extractedBusinessProfile(extraction);
  const businessFilled =
    (currentBusiness === null || isBusinessProfileEmpty(currentBusiness)) &&
    !isBusinessProfileEmpty(business);
  // Everything else in the column (interview answers, provenance written by the transcript
  // path) is kept; this pass only adds what it read.
  const structured: StructuredData = {
    ...current,
    business: businessFilled ? business : (currentBusiness ?? undefined),
    document_type: extraction.documents?.[0]?.document_type ?? current.document_type ?? null,
    provenance: { ...(current.provenance ?? {}), ...extractedProvenance(extraction) },
  };

  const record =
    applied.length > 0
      ? await updateDbdRecord(db, recordId, input, structured)
      : await updateStructuredData(db, recordId, structured);
  return { record, applied, rejected, businessFilled };
}

async function updateStructuredData(
  db: Db,
  recordId: string,
  structured: StructuredData,
): Promise<DbdRecordRow> {
  const { data, error } = await db
    .from('dbd_records')
    .update({ structured_data: structured as unknown as Json })
    .eq('id', recordId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
