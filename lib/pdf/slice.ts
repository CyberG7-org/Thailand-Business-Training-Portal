import { PDFDocument } from 'pdf-lib';
import type { Slice } from '@/lib/domain/rag/transcript';

const LOAD = { ignoreEncryption: true, updateMetadata: false } as const;

/** Page count of a PDF; throws for bytes that are not a PDF. */
export async function countPages(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, LOAD);
  return doc.getPageCount();
}

/** A new PDF holding pages firstPage..lastPage of the original (clamped to the document). */
export async function slicePdf(bytes: Uint8Array, slice: Slice): Promise<Uint8Array> {
  const source = await PDFDocument.load(bytes, LOAD);
  const out = await PDFDocument.create();
  const last = Math.min(slice.lastPage, source.getPageCount());
  const indices: number[] = [];
  for (let page = Math.max(1, slice.firstPage); page <= last; page++) indices.push(page - 1);
  const pages = await out.copyPages(source, indices);
  for (const page of pages) out.addPage(page);
  return out.save();
}
