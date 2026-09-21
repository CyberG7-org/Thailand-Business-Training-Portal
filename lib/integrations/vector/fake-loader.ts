import 'server-only';
import type { Chunk } from '@/lib/domain/rag/chunk';
import { createSupabaseAdminClient } from '@/lib/db/admin';

/** The fake store reads the record's chunk rows straight from Postgres. */
export async function loadChunksFromDb(
  recordId: string,
  documentTypes?: string[],
): Promise<Chunk[]> {
  let query = createSupabaseAdminClient()
    .from('dbd_chunks')
    .select('id, record_id, document_id, document_type, page, chunk_index, chunk_text')
    .eq('record_id', recordId);
  if (documentTypes && documentTypes.length > 0) query = query.in('document_type', documentTypes);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    recordId: r.record_id,
    documentId: r.document_id,
    documentType: r.document_type,
    page: r.page,
    chunkIndex: r.chunk_index,
    text: r.chunk_text,
  }));
}
