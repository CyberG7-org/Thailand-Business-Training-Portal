import type { SupabaseClient } from '@supabase/supabase-js';
import { ExtractionError, type DbdExtractor } from '@/lib/integrations/extraction/types';
import type { Database, Json } from './database.types';
import { directorsToText, type Director } from '@/lib/domain/dbd-record';
import { applyExtractionToRecord, type RecordFormValues } from '@/lib/domain/extraction-merge';
import { dbdExtractionSchema } from '@/lib/integrations/extraction/schema';
import { getDbdRecord, updateDbdRecord, type DbdRecordRow } from './dbd-records';

type Db = SupabaseClient<Database>;

/**
 * Runs the extractor over the record's uploaded certificate and stores the result in
 * `extraction_raw` (status `extracted`). Record columns are never touched here — the admin
 * reviews the suggestions in the form and saves/confirms explicitly (spec §11).
 */
export async function runExtraction(
  db: Db,
  recordId: string,
  extractor: DbdExtractor,
): Promise<DbdRecordRow> {
  const record = await getDbdRecord(db, recordId);
  if (!record) throw new ExtractionError('Record not found', 'not_allowed');
  if (record.extraction_status === 'confirmed') {
    throw new ExtractionError('Confirmed records cannot be re-extracted', 'not_allowed');
  }
  if (!record.document_path) {
    throw new ExtractionError('Upload the certificate PDF first', 'no_document');
  }

  const previousStatus = record.extraction_status;
  const { error: pendingError } = await db
    .from('dbd_records')
    .update({ extraction_status: 'pending' })
    .eq('id', recordId);
  if (pendingError) throw pendingError;

  try {
    const { data: blob, error: downloadError } = await db.storage
      .from('dbd-documents')
      .download(record.document_path);
    if (downloadError || !blob) {
      throw new ExtractionError('Could not download the certificate', 'provider');
    }
    const extraction = await extractor.extract(new Uint8Array(await blob.arrayBuffer()));
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

/** The record's columns as the strings the admin form shows (empty string = no value). */
export function recordToFormValues(record: DbdRecordRow): RecordFormValues {
  const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  return {
    juristic_id: text(record.juristic_id),
    certificate_no: text(record.certificate_no),
    document_ref: text(record.document_ref),
    company_name_th: text(record.company_name_th),
    company_name_en: text(record.company_name_en),
    registered_on: text(record.registered_on),
    issued_on: text(record.issued_on),
    registered_capital: text(record.registered_capital),
    head_office_address: text(record.head_office_address),
    signing_authority: text(record.signing_authority),
    objectives_count: text(record.objectives_count),
    issuing_office: text(record.issuing_office),
    registrar_name: text(record.registrar_name),
    directors_text: directorsToText((record.directors as unknown as Director[] | null) ?? []),
  };
}

export type ExtractAndApplyResult = {
  record: DbdRecordRow;
  /** Form fields the extraction filled. */
  applied: string[];
  /** Fields whose extracted value failed validation and stayed empty. */
  rejected: string[];
};

/**
 * Runs the extractor and fills the record's empty fields with what it read (decision D37).
 * Values the admin already entered are never overwritten; confirmation stays explicit.
 */
export async function extractAndApply(
  db: Db,
  recordId: string,
  extractor: DbdExtractor,
): Promise<ExtractAndApplyResult> {
  const extracted = await runExtraction(db, recordId, extractor);
  const parsed = dbdExtractionSchema.safeParse(extracted.extraction_raw);
  if (!parsed.success) {
    throw new ExtractionError('The stored extraction is not readable', 'invalid_output');
  }
  const { input, applied, rejected } = applyExtractionToRecord(
    parsed.data,
    recordToFormValues(extracted),
  );
  if (applied.length === 0) return { record: extracted, applied, rejected };
  const record = await updateDbdRecord(db, recordId, input);
  return { record, applied, rejected };
}
