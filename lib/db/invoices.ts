import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DbdExtractor } from '@/lib/integrations/extraction/types';
import { ExtractionError } from '@/lib/integrations/extraction/types';
import { createSupabaseAdminClient } from './admin';
import type { Database } from './database.types';
import { listInvoiceDocuments } from './dbd-records';
import { refreshDerivedFacts, updateStructuredData } from './derived-facts';
import { validateAfterChange } from './validation';

type Db = SupabaseClient<Database>;

/**
 * The invoice read is a job of its own (spec 2026-10-06 §4, D101): queued when invoices are
 * registered and by "Read the invoices again", run by the cron with the pack read's lease, retry
 * and backoff, so a slow invoice read never delays the pack and each is retried on its own.
 */
export async function enqueueInvoicesJob(
  db: Db,
  recordId: string,
): Promise<'queued' | 'already_live' | 'no_invoices'> {
  const { data: live, error } = await db
    .from('index_jobs')
    .select('id')
    .eq('record_id', recordId)
    .eq('kind', 'invoices')
    .in('status', ['queued', 'running'])
    .maybeSingle();
  if (error) throw error;
  if (live) return 'already_live';
  const { data: first, error: docError } = await db
    .from('dbd_documents')
    .select('id')
    .eq('record_id', recordId)
    .eq('group', 'invoice')
    .order('position')
    .limit(1)
    .maybeSingle();
  if (docError) throw docError;
  if (!first) return 'no_invoices';
  const { error: e } = await db
    .from('index_jobs')
    .insert({ record_id: recordId, document_id: first.id, kind: 'invoices' });
  if (e) throw e;
  return 'queued';
}

/**
 * Reads every invoice document of the record into rows and stores them; the figures are worked
 * out from the rows wherever the fact sheet is built. Then the business is described from the
 * objectives and the items, the category follows, and the record is validated — a confirmed
 * record gets a new training version when its sheet changed (spec §5.6).
 */
export async function runInvoiceRead(
  admin: Db,
  recordId: string,
  extractor: DbdExtractor,
): Promise<{ rows: number }> {
  const documents = await listInvoiceDocuments(admin, recordId);
  if (documents.length === 0) throw new ExtractionError('No invoices to read', 'no_document');
  const bytes: Uint8Array[] = [];
  for (const doc of documents) {
    const { data: blob, error } = await admin.storage.from('dbd-documents').download(doc.path);
    if (error || !blob) {
      throw new ExtractionError(`Could not download ${doc.original_name}`, 'provider');
    }
    bytes.push(new Uint8Array(await blob.arrayBuffer()));
  }
  const rows = await extractor.readInvoices(bytes);
  const read = { read_at: new Date().toISOString(), model: extractor.name, rows };
  const outcome = await updateStructuredData(admin, recordId, (stored) => ({
    ...stored,
    invoices: read,
  }));
  if (outcome === 'not_found') throw new ExtractionError('Record not found', 'not_allowed');
  if (outcome === 'raced') throw new ExtractionError('The record was being edited', 'provider');
  await refreshDerivedFacts(admin, recordId, undefined, { describe: true }).catch((e) =>
    console.error('derived facts after invoices', recordId, e),
  );
  await validateAfterChange(recordId, null);
  return { rows: rows.length };
}

/** The cron's runner: read with the configured extractor under the service role. */
export async function invoicesRunner(
  extractor: DbdExtractor,
  input: { recordId: string },
): Promise<{ status: 'done' | 'failed'; error?: string }> {
  try {
    await runInvoiceRead(createSupabaseAdminClient(), input.recordId, extractor);
    return { status: 'done' };
  } catch (e) {
    if (e instanceof ExtractionError && (e.code === 'no_document' || e.code === 'not_allowed')) {
      return { status: 'failed', error: e.code };
    }
    throw e;
  }
}
