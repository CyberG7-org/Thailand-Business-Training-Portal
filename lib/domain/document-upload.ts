/** Matches the `dbd-documents` bucket's `file_size_limit` (migration 0013). */
export const MAX_DOCUMENT_BYTES = 30 * 1024 * 1024;
/** A pack is a handful of PDFs (certificate, objectives sheet, บอจ.5, บอจ.2…). */
export const MAX_DOCUMENT_FILES = 6;

export type DocumentFileMeta = { name: string; size: number; type: string };

/** What the browser and the server both check before a file travels to the bucket. */
export function checkDocumentFiles(files: DocumentFileMeta[]): 'no-file' | 'invalid-file' | null {
  const present = files.filter((f) => f.size > 0);
  if (present.length === 0) return 'no-file';
  if (present.length > MAX_DOCUMENT_FILES) return 'invalid-file';
  for (const f of present) {
    if (f.type !== 'application/pdf' || f.size > MAX_DOCUMENT_BYTES) return 'invalid-file';
  }
  return null;
}
