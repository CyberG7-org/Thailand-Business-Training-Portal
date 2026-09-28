import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Reads a PDF back the way a viewer does (pdf.js, the legacy build runs in Node): the text
 * items of each page, one item per text object the renderer wrote (a line, or a word of a
 * wrapped Thai block). Tests use it to see what a person would see, not what was asked for.
 */
// pdf.js wants a directory ending in a forward slash, on Windows too.
const standardFontDataUrl =
  path
    .join(
      path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')),
      'standard_fonts',
    )
    .replaceAll(path.sep, '/') + '/';

export async function pdfTextItems(bytes: Uint8Array): Promise<string[][]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // pdf.js takes ownership of the buffer it is given, so it gets a copy.
  const task = getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl,
  });
  const doc = await task.promise;
  try {
    const pages: string[][] = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(content.items.flatMap((item) => ('str' in item ? [item.str] : [])));
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
