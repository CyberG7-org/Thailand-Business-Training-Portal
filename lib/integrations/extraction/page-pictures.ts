import { PDFDocument } from 'pdf-lib';
import { MAX_PAGE_IMAGES, renderPages, thinPages } from '@/lib/pdf/render-pages';

/** Pictures past this many bytes in one reading are left out: the request has a size ceiling. */
export const MAX_PICTURE_BYTES = 14 * 1024 * 1024;

export type PagePicture = { page: number; png: Uint8Array };
export type PictureBudget = { pages: number; bytes: number };

/**
 * Documents and pictures together stay under this: the reader refuses a request over 32 MB, and
 * base64 makes every byte a third larger on the way.
 */
export const MAX_READING_BYTES = 22 * 1024 * 1024;

/** What a reading may spend on pictures, given the size of the documents it already carries. */
export const newPictureBudget = (documentBytes = 0): PictureBudget => ({
  pages: MAX_PAGE_IMAGES,
  bytes: Math.max(0, Math.min(MAX_PICTURE_BYTES, MAX_READING_BYTES - documentBytes)),
});

/**
 * Sharp pictures of the pages of one document a reader cannot read as text (D98), within what
 * is left of the reading's budget, which it draws down. A document that cannot be drawn — not a
 * PDF, a broken page — simply has no pictures: the reading goes on from the PDF alone, as it
 * did before.
 */
export async function pagePictures(pdf: Uint8Array, budget: PictureBudget): Promise<PagePicture[]> {
  if (budget.pages <= 0) return [];
  try {
    const pages = (await thinPages(pdf)).slice(0, budget.pages);
    if (pages.length === 0) return [];
    const drawn = await renderPages(pdf, pages);
    const out: PagePicture[] = [];
    for (const [i, png] of drawn.entries()) {
      if (png.byteLength > budget.bytes) break;
      budget.bytes -= png.byteLength;
      budget.pages -= 1;
      out.push({ page: pages[i], png });
    }
    return out;
  } catch (error) {
    console.error('page pictures', error);
    return [];
  }
}

/**
 * Whether pages can be drawn where this is running: the canvas is a native module, and a
 * deployment that cannot load it reads every pack without pictures. The health probe reports it.
 */
export async function pdfRenderCheck(): Promise<'ok' | 'failed'> {
  try {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const [png] = await renderPages(await doc.save(), [1]);
    return png && png.byteLength > 0 ? 'ok' : 'failed';
  } catch (error) {
    console.error('pdf render check', error);
    return 'failed';
  }
}
