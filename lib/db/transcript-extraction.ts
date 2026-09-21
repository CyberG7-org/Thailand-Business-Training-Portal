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
import {
  mergeSweeps,
  type DocumentType,
  type SweepResult,
} from '@/lib/integrations/extraction/transcript-schema';
import type { DbdExtractor, TranscriptPassage } from '@/lib/integrations/extraction/types';
import type { VectorStore } from '@/lib/integrations/vector/types';
import type { Database, Json } from './database.types';
import { searchRecordPassages } from './dbd-index';
import { getDbdRecord, listDbdDocuments, updateDbdRecord, type DbdRecordRow } from './dbd-records';
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

const SWEEP_TYPES: DocumentType[] = [
  'shareholder_list',
  'objectives_sheet',
  'memorandum',
  'certificate',
];

export type TranscriptExtractionResult = {
  applied: string[];
  rejected: string[];
  /** Level 2 lists filled from sweeps. */
  lists: string[];
  skipped: 'confirmed' | 'no_ready_documents' | 'not_configured' | null;
};

/**
 * Fills a record from its transcripts (spec §6, D42): single facts by retrieval + one structured
 * call, Level 2 lists by page-batched sweeps of the typed documents. Empty fields only (D37/D38);
 * runs when an oversized document becomes ready and from "Read the document again".
 */
export async function extractFromTranscripts(
  db: Db,
  recordId: string,
  deps: { extractor: DbdExtractor | null; vector: VectorStore | null; batchPages?: number },
): Promise<TranscriptExtractionResult> {
  const none = (skipped: TranscriptExtractionResult['skipped']): TranscriptExtractionResult => ({
    applied: [],
    rejected: [],
    lists: [],
    skipped,
  });
  if (!deps.extractor || !deps.vector) return none('not_configured');
  const record = await getDbdRecord(db, recordId);
  if (!record) return none('no_ready_documents');
  if (record.extraction_status === 'confirmed') return none('confirmed');
  const documents = (await listDbdDocuments(db, recordId)).filter(
    (d) => d.index_status === 'ready',
  );
  if (documents.length === 0) return none('no_ready_documents');
  const positionOf = new Map(documents.map((d) => [d.id, d.position]));

  // ---- facts by retrieval ------------------------------------------------------------------
  const passages = await retrieveFactPassages(deps.vector, recordId, positionOf);
  const facts = passages.length > 0 ? await deps.extractor.extractFacts(passages) : null;
  const patch = facts ? applyExtractionToRecord(facts, recordToFormValues(record)) : null;
  const applied = patch?.applied ?? [];
  const rejected = patch?.rejected ?? [];

  // ---- lists by sweeps ----------------------------------------------------------------------
  const batchPages = deps.batchPages ?? 10;
  const sweeps: SweepResult[] = [];
  for (const doc of documents) {
    const type = doc.document_type as DocumentType | null;
    if (!type || !SWEEP_TYPES.includes(type)) continue;
    const { data: pages, error } = await db
      .from('dbd_pages')
      .select('page, text')
      .eq('document_id', doc.id)
      .order('page');
    if (error) throw error;
    const all = pages ?? [];
    for (let i = 0; i < all.length; i += batchPages) {
      sweeps.push(await deps.extractor.sweep(all.slice(i, i + batchPages), type));
    }
  }
  const swept = mergeSweeps(sweeps);

  // ---- merge: empty fields only -------------------------------------------------------------
  const current = readStructuredData(record.structured_data);
  const business: BusinessProfile = structuredClone(current.business ?? EMPTY_BUSINESS_PROFILE);
  const lists: string[] = [];
  if (business.shareholders.length === 0 && swept.shareholders.length > 0) {
    business.shareholders = swept.shareholders;
    lists.push('shareholders');
  }
  if (business.objectives.length === 0 && swept.objectives.length > 0) {
    business.objectives = swept.objectives;
    lists.push('objectives');
  }
  if (business.promoters.length === 0 && swept.promoters.length > 0) {
    business.promoters = swept.promoters;
    lists.push('promoters');
  }
  const structureEmpty = Object.values(business.share_structure).every((v) => v === null);
  const sweptStructure = Object.values(swept.share_structure).some((v) => v !== null);
  if (structureEmpty && sweptStructure) {
    business.share_structure = swept.share_structure;
    lists.push('share_structure');
  }

  if (applied.length === 0 && lists.length === 0)
    return { applied, rejected, lists, skipped: null };

  const provenance: Provenance = { ...(current.provenance ?? {}) };
  if (facts) {
    for (const field of applied) {
      const key = field === 'directors_text' ? 'directors' : field;
      const entry = (facts as unknown as Record<string, Provenance[string] | undefined>)[key];
      if (entry) {
        provenance[key] = {
          confidence: entry.confidence,
          source_page: entry.source_page ?? null,
          source_document: entry.source_document ?? null,
        };
      }
    }
  }
  for (const list of lists) {
    provenance[list] = { confidence: 0.9, source_page: null, source_document: null };
  }
  const structured: StructuredData = { ...current, business, provenance };
  const updated = patch
    ? await updateDbdRecord(db, recordId, patch.input, structured)
    : await updateStructured(db, recordId, structured);
  if (updated.extraction_status === 'none' || updated.extraction_status === 'pending') {
    const { error } = await db
      .from('dbd_records')
      .update({ extraction_status: 'extracted' })
      .eq('id', recordId);
    if (error) throw error;
  }
  return { applied, rejected, lists, skipped: null };
}

async function retrieveFactPassages(
  vector: VectorStore,
  recordId: string,
  positionOf: Map<string, number>,
): Promise<TranscriptPassage[]> {
  const results = await Promise.all(
    FACT_QUERIES.map((q) =>
      searchRecordPassages(vector, recordId, q, { topK: 3 }).catch(() => null),
    ),
  );
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

async function updateStructured(
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
