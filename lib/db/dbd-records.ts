import type { SupabaseClient } from '@supabase/supabase-js';
import type { DbdRecordInput } from '@/lib/domain/dbd-record';
import type { Database, Json } from './database.types';

type Db = SupabaseClient<Database>;
export type DbdRecordRow = Database['public']['Tables']['dbd_records']['Row'];

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
): Promise<DbdRecordRow> {
  const { data, error } = await db
    .from('dbd_records')
    .update(toColumns(input))
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

export async function uploadDbdDocument(db: Db, id: string, file: File | Blob): Promise<string> {
  const path = `${id}/${Date.now()}-certificate.pdf`;
  const { error } = await db.storage
    .from('dbd-documents')
    .upload(path, file, { contentType: 'application/pdf' });
  if (error) throw error;
  const { error: updateError } = await db
    .from('dbd_records')
    .update({ document_path: path })
    .eq('id', id);
  if (updateError) throw updateError;
  return path;
}
