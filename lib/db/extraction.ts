import type { SupabaseClient } from '@supabase/supabase-js';
import { ExtractionError, type DbdExtractor } from '@/lib/integrations/extraction/types';
import type { Database, Json } from './database.types';
import { getDbdRecord, type DbdRecordRow } from './dbd-records';

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
