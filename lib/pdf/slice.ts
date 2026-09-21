import { PDFDocument } from 'pdf-lib';
import type { Slice } from '@/lib/domain/rag/transcript';

// `ignoreEncryption` lets the parser open an encrypted file so we can *report* it as unreadable
// instead of failing on a parse error; the model would only ever see ciphertext.
const LOAD = { ignoreEncryption: true, updateMetadata: false } as const;

async function load(bytes: Uint8Array): Promise<PDFDocument> {
  const doc = await PDFDocument.load(bytes, LOAD);
  if (doc.isEncrypted) throw new Error('unreadable_pdf');
  return doc;
}

/** Page count of a PDF; throws for bytes that are not a PDF or a password-protected one. */
export async function countPages(bytes: Uint8Array): Promise<number> {
  return (await load(bytes)).getPageCount();
}

/** A new PDF holding pages firstPage..lastPage of the original (clamped to the document). */
export async function slicePdf(bytes: Uint8Array, slice: Slice): Promise<Uint8Array> {
  const source = await load(bytes);
  const out = await PDFDocument.create();
  const last = Math.min(slice.lastPage, source.getPageCount());
  const indices: number[] = [];
  for (let page = Math.max(1, slice.firstPage); page <= last; page++) indices.push(page - 1);
  const pages = await out.copyPages(source, indices);
  for (const page of pages) out.addPage(page);
  return out.save();
}
