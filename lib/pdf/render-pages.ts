import { createCanvas } from '@napi-rs/canvas';

/**
 * Pictures of PDF pages for a reader (D98). A DBD shareholder list often carries its names as
 * drawn shapes with no text behind them, so a reader has to read the page from its picture —
 * and at the size a PDF is shown to it, small Thai print is misread. Measured on the Owner's
 * pack: sent as a PDF, both shareholder names were wrong in five readings of five; sent as a
 * picture three times the PDF's own size, they were right.
 *
 * Not `server-only`: the unit tests render the fixture PDFs with it.
 */

/** A page whose text layer holds fewer characters than this cannot carry its own words. */
export const THIN_PAGE_CHARS = 800;
/** Three times the PDF's own size: small Thai print keeps its marks. */
export const RENDER_SCALE = 3;
/**
 * A reading never carries more pictures than this. Every sample pack has thirteen such pages
 * (the forms behind the certificate, the shareholder list last), so the ceiling sits above that.
 */
export const MAX_PAGE_IMAGES = 16;

/** Opens the PDF, hands it to `work`, and releases pdf.js's hold on it whatever happens. */
async function withDocument<T>(
  pdf: Uint8Array,
  work: (doc: PdfDocument) => Promise<T>,
): Promise<T> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // pdf.js takes ownership of the bytes it is given, so it gets a copy.
  const task = pdfjs.getDocument({ data: pdf.slice(), useSystemFonts: false, verbosity: 0 });
  try {
    return await work(await task.promise);
  } finally {
    await task.destroy();
  }
}

type PdfDocument = Awaited<
  ReturnType<typeof import('pdfjs-dist/legacy/build/pdf.mjs').getDocument>['promise']
>;

async function textChars(doc: PdfDocument, pageNo: number): Promise<number> {
  const content = await (await doc.getPage(pageNo)).getTextContent();
  return content.items
    .map((item) => ('str' in item ? item.str : ''))
    .join('')
    .replace(/\s/g, '').length;
}

/** 1-based numbers of the pages a reader has to read from the picture, in order. */
export async function thinPages(pdf: Uint8Array): Promise<number[]> {
  return withDocument(pdf, async (doc) => {
    const thin: number[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      if ((await textChars(doc, n)) < THIN_PAGE_CHARS) thin.push(n);
    }
    return thin;
  });
}

/** PNG pictures of the given pages, in the order asked; a page past the end is left out. */
export async function renderPages(
  pdf: Uint8Array,
  pages: readonly number[],
): Promise<Uint8Array[]> {
  return withDocument(pdf, async (doc) => {
    const out: Uint8Array[] = [];
    for (const n of pages) {
      if (n < 1 || n > doc.numPages) continue;
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({
        canvasContext: canvas.getContext('2d') as never,
        viewport,
        canvas: canvas as never,
      }).promise;
      out.push(new Uint8Array(canvas.toBuffer('image/png')));
    }
    return out;
  });
}
