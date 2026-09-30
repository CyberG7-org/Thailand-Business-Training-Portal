import type { SupabaseClient } from '@supabase/supabase-js';
import { autoConfirmVerdict, type AutoConfirmVerdict } from '@/lib/domain/auto-confirm';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import { applyExtractionToRecord } from '@/lib/domain/extraction-merge';
import { directReadMaxPages } from '@/lib/domain/rag/jobs';
import type { Database } from './database.types';
import { getDbdRecord, listDbdDocuments } from './dbd-records';
import { parseStoredExtraction } from './extraction';
import { recordToFormValues } from './record-form-values';

type Db = SupabaseClient<Database>;

/** Extracted values that failed validation and are still empty on the record. */
function stillRejected(record: NonNullable<Awaited<ReturnType<typeof getDbdRecord>>>): string[] {
  const extraction = parseStoredExtraction(record.extraction_raw);
  if (!extraction) return [];
  try {
    return applyExtractionToRecord(extraction, recordToFormValues(record)).rejected;
  } catch {
    // The record's own values do not validate; a person has to look at it.
    return ['record'];
  }
}

/**
 * Confirms a record by itself when the background reader has just finished with it and it is
 * clean (D80), on behalf of the staff member who uploaded it; otherwise leaves it for a person.
 * Runs with the service role from the reader. The update is conditional on the record still
 * being unconfirmed, so a manager confirming at the same moment wins without a conflict.
 */
export async function autoConfirmIfClean(db: Db, recordId: string): Promise<AutoConfirmVerdict> {
  const record = await getDbdRecord(db, recordId);
  if (!record) return { confirm: false, reasons: ['record'] };

  const { count: readingJobsOpen, error: jobsError } = await db
    .from('index_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('record_id', recordId)
    .in('kind', ['extract', 'transcript'])
    .in('status', ['queued', 'running']);
  if (jobsError) throw jobsError;
  const maxPages = directReadMaxPages();
  const documentsStillIndexing = (await listDbdDocuments(db, recordId)).filter(
    (d) =>
      d.page_count !== null &&
      d.page_count > maxPages &&
      !['ready', 'failed', 'skipped'].includes(d.index_status),
  ).length;

  const verdict = autoConfirmVerdict(
    record,
    readStructuredData(record.structured_data).interview ?? null,
    {
      extractionStatus: record.extraction_status,
      readingJobsOpen: readingJobsOpen ?? 0,
      documentsStillIndexing,
      rejected: stillRejected(record),
    },
  );
  if (!verdict.confirm) return verdict;
  // The check constraint needs someone to have confirmed; a record with no uploader has nobody
  // to confirm it on behalf of.
  if (!record.created_by) return { confirm: false, reasons: ['no_uploader'] };

  const { error } = await db
    .from('dbd_records')
    .update({
      extraction_status: 'confirmed',
      confirmed_by: record.created_by,
      confirmed_at: new Date().toISOString(),
      confirmed_automatically: true,
    })
    .eq('id', recordId)
    .neq('extraction_status', 'confirmed');
  if (error) throw error;
  return verdict;
}
