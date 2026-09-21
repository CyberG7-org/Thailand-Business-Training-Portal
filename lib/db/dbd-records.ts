import type { SupabaseClient } from '@supabase/supabase-js';
import type { DbdRecordInput } from '@/lib/domain/dbd-record';
import type { StructuredData } from '@/lib/domain/dbd-profile';
import { getVectorStore, resolveVectorProvider, type VectorStore } from '@/lib/integrations/vector';
import { countPages } from '@/lib/pdf/slice';
import type { Database, Json } from './database.types';
import { enqueueIndexJob, listChunkIds } from './dbd-index';

type Db = SupabaseClient<Database>;
export type DbdRecordRow = Database['public']['Tables']['dbd_records']['Row'];
export type DbdDocumentRow = Database['public']['Tables']['dbd_documents']['Row'];

function toColumns(input: DbdRecordInput) {
  return { ...input, directors: input.directors as unknown as Json };
}

export async function listDbdRecords(db: Db): Promise<DbdRecordRow[]> {
  const { data, error } = await db
    .from('dbd_records')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getDbdRecord(db: Db, id: string): Promise<DbdRecordRow | null> {
  const { data, error } = await db.from('dbd_records').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createDbdRecord(
  db: Db,
  input: DbdRecordInput,
  createdBy: string,
): Promise<DbdRecordRow> {
  const { data, error } = await db
    .from('dbd_records')
    .insert({ ...toColumns(input), created_by: createdBy })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateDbdRecord(
  db: Db,
  id: string,
  input: DbdRecordInput,
  structured?: StructuredData,
): Promise<DbdRecordRow> {
  const { data, error } = await db
    .from('dbd_records')
    .update({
      ...toColumns(input),
      ...(structured ? { structured_data: structured as unknown as Json } : {}),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** The database check constraint rejects this while juristic_id / company_name_th are missing. */
export async function confirmDbdRecord(
  db: Db,
  id: string,
  confirmedBy: string,
): Promise<DbdRecordRow> {
  const { data, error } = await db
    .from('dbd_records')
    .update({
      extraction_status: 'confirmed',
      confirmed_by: confirmedBy,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Adds one source document to the record (decision D38: certificate, objectives sheet,
 * shareholder list, memorandum…). The first document also becomes `document_path`, the file
 * learners and the AI question generator see as "the certificate".
 */
export async function uploadDbdDocument(
  db: Db,
  id: string,
  file: File | Blob,
  originalName = 'certificate.pdf',
): Promise<string> {
  const existing = await listDbdDocuments(db, id);
  const position = existing.length + 1;
  const path = `${id}/${Date.now()}-${position}.pdf`;
  const { error } = await db.storage
    .from('dbd-documents')
    .upload(path, file, { contentType: 'application/pdf' });
  if (error) throw error;
  const { data: auth } = await db.auth.getUser();
  // P14: the page count decides how the document is read; an unreadable file is stored but not indexed.
  let pageCount: number | null = null;
  try {
    pageCount = await countPages(new Uint8Array(await file.arrayBuffer()));
  } catch {
    pageCount = null;
  }
  const indexing = resolveVectorProvider() !== 'off';
  const { data: doc, error: docError } = await db
    .from('dbd_documents')
    .insert({
      record_id: id,
      path,
      original_name: originalName,
      size_bytes: file.size,
      position,
      uploaded_by: auth.user?.id ?? null,
      page_count: pageCount,
      index_status: pageCount === null ? 'failed' : indexing ? 'queued' : 'skipped',
      index_error: pageCount === null ? 'unreadable_pdf' : null,
    })
    .select('id')
    .single();
  if (docError) throw docError;
  if (pageCount !== null && indexing) {
    await enqueueIndexJob(db, { recordId: id, documentId: doc.id });
  }
  if (position === 1) {
    const { error: updateError } = await db
      .from('dbd_records')
      .update({ document_path: path })
      .eq('id', id);
    if (updateError) throw updateError;
  }
  return path;
}

export async function listDbdDocuments(db: Db, recordId: string): Promise<DbdDocumentRow[]> {
  const { data, error } = await db
    .from('dbd_documents')
    .select('*')
    .eq('record_id', recordId)
    .order('position');
  if (error) throw error;
  return data ?? [];
}

/** Removes one source document (file + row); `document_path` moves to the next one if needed. */
export async function removeDbdDocument(
  db: Db,
  recordId: string,
  documentId: string,
  vector: VectorStore | null = getVectorStore(),
): Promise<void> {
  const { data: doc, error } = await db
    .from('dbd_documents')
    .select('*')
    .eq('id', documentId)
    .eq('record_id', recordId)
    .maybeSingle();
  if (error) throw error;
  if (!doc) return;
  // Vectors first, then the row (pages and chunks cascade) — decision D40.
  const ids = await listChunkIds(db, doc.id);
  if (ids.length > 0) await vector?.remove(ids);
  await db.storage.from('dbd-documents').remove([doc.path]);
  const { error: delError } = await db.from('dbd_documents').delete().eq('id', doc.id);
  if (delError) throw delError;
  const remaining = await listDbdDocuments(db, recordId);
  const { error: updError } = await db
    .from('dbd_records')
    .update({ document_path: remaining[0]?.path ?? null })
    .eq('id', recordId);
  if (updError) throw updError;
}
