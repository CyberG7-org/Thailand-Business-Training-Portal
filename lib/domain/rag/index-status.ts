/** `dbd_documents.index_status` values (migration 0015). */
export const INDEX_STATUSES = ['none', 'queued', 'indexing', 'ready', 'failed', 'skipped'] as const;
export type IndexStatus = (typeof INDEX_STATUSES)[number];

/**
 * An admin may (re)index a document unless a job is live on it: documents uploaded before P14
 * (`none`) or while the provider was off (`skipped`) are indexed for the first time, `failed`
 * ones retried, `ready` ones re-read. Queued/indexing work is never reset from the page.
 */
export function canRequestIndex(status: IndexStatus): boolean {
  return status !== 'queued' && status !== 'indexing';
}
