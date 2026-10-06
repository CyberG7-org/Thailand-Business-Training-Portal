import { MAX_DOCUMENT_BYTES } from '@/lib/domain/document-upload';

/**
 * What a company zip holds, sorted before anything is uploaded (spec 2026-10-06 §2, D101). Folder
 * and file names are hints: an invoice is a PDF under an invoice folder or named like one; an
 * agreement likewise; every other PDF is part of the DBD pack and the reader classifies it page
 * by page, as today. A small text-like file may carry the company's addresses. Everything else
 * is left out.
 */
export type PackGroup = 'pack' | 'invoice' | 'agreement';
export type PackEntry = { path: string; size: number };
export type SortedEntry = PackEntry & { group: PackGroup };
export type PackProblem = 'no-document' | 'too-many-files' | 'file-too-large' | 'zip-too-large';
export type SortedPack = {
  documents: SortedEntry[];
  linkFiles: PackEntry[];
  ignored: string[];
  problem: PackProblem | null;
};

/** A zip may hold this many documents and this much in all; one file keeps the bucket's limit. */
export const MAX_PACK_FILES = 40;
export const MAX_PACK_BYTES = 200 * 1024 * 1024;
/** A link file is a sentence with an address in it; anything larger is not one. */
export const MAX_LINK_FILE_BYTES = 1024 * 1024;

const PDF = /\.pdf$/i;
const INVOICE_FOLDER = /(^|\/)(invoices?|ใบแจ้งหนี้|ใบกำกับภาษี)[^/]*\/[^/]+$/i;
const INVOICE_NAME = /(^|\/)(invoice|ใบแจ้งหนี้|ใบกำกับภาษี)[^/]*$/i;
const AGREEMENT_FOLDER = /(^|\/)(agreements?|contracts?|สัญญา)[^/]*\/[^/]+$/i;
const AGREEMENT_NAME = /(^|\/)(agreement|contract|สัญญา)[^/]*$/i;
const LINK = /\.(doc|docx|txt|url|html?)$/i;
/** Apple's resource forks and dot files: never part of a pack. */
const JUNK = /(^|\/)(__MACOSX\/|\.)/;

function groupOf(path: string): PackGroup | 'link' | null {
  if (JUNK.test(path) || path.endsWith('/')) return null;
  if (PDF.test(path)) {
    if (INVOICE_FOLDER.test(path) || INVOICE_NAME.test(path)) return 'invoice';
    if (AGREEMENT_FOLDER.test(path) || AGREEMENT_NAME.test(path)) return 'agreement';
    return 'pack';
  }
  if (LINK.test(path)) return 'link';
  return null;
}

export function sortPackEntries(entries: readonly PackEntry[]): SortedPack {
  const documents: SortedEntry[] = [];
  const linkFiles: PackEntry[] = [];
  const ignored: string[] = [];
  for (const entry of entries) {
    const group = groupOf(entry.path);
    if (group === null) ignored.push(entry.path);
    else if (group === 'link') {
      if (entry.size <= MAX_LINK_FILE_BYTES) linkFiles.push(entry);
      else ignored.push(entry.path);
    } else documents.push({ ...entry, group });
  }
  const total = documents.reduce((n, d) => n + d.size, 0);
  const problem: PackProblem | null =
    documents.length > MAX_PACK_FILES
      ? 'too-many-files'
      : documents.some((d) => d.size > MAX_DOCUMENT_BYTES)
        ? 'file-too-large'
        : total > MAX_PACK_BYTES
          ? 'zip-too-large'
          : documents.length === 0
            ? 'no-document'
            : null;
  return { documents, linkFiles, ignored, problem };
}

/** The file's own name, for the record's document list. */
export function baseName(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? path;
}
