import { directReadMaxPages } from './rag/jobs';

/** Request ceiling for document content in one model call (the API rejects larger payloads). */
export const DIRECT_READ_MAX_BYTES = 30 * 1024 * 1024;

export type DirectReadPlan = { direct: string[]; deferred: string[] };

/**
 * Which uploaded documents the one-pass direct read may take (spec §5.1, D42): small enough in
 * pages (unknown = uploaded before P14 = small) and within the byte budget, in upload order.
 * Everything else waits for the transcript path.
 */
export function planDirectRead(
  documents: { id: string; page_count: number | null; size_bytes: number }[],
  limits: { maxPages?: number; maxBytes?: number } = {},
): DirectReadPlan {
  const maxPages = limits.maxPages ?? directReadMaxPages();
  const maxBytes = limits.maxBytes ?? DIRECT_READ_MAX_BYTES;
  const direct: string[] = [];
  const deferred: string[] = [];
  let bytes = 0;
  for (const doc of documents) {
    const small = doc.page_count === null || doc.page_count <= maxPages;
    if (small && bytes + doc.size_bytes <= maxBytes) {
      direct.push(doc.id);
      bytes += doc.size_bytes;
    } else {
      deferred.push(doc.id);
    }
  }
  return { direct, deferred };
}
