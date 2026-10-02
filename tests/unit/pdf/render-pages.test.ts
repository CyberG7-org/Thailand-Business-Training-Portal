import { readFileSync } from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { RENDER_SCALE, THIN_PAGE_CHARS, renderPages, thinPages } from '@/lib/pdf/render-pages';

const fixture = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/${name}`));
const PNG = [0x89, 0x50, 0x4e, 0x47];

/** One page with plenty of text, one with a line, one with nothing. */
async function mixedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const full = doc.addPage([595, 842]);
  const line = 'The quick brown fox jumps over the lazy dog and keeps on running. ';
  for (let i = 0; i < 30; i++) full.drawText(line, { x: 30, y: 800 - i * 20, size: 10, font });
  doc
    .addPage([595, 842])
    .drawText('Page two has one short line.', { x: 30, y: 800, size: 10, font });
  doc.addPage([595, 842]);
  return doc.save();
}

describe('thinPages', () => {
  it('names the pages whose text layer cannot carry the page', async () => {
    expect(await thinPages(await mixedPdf())).toEqual([2, 3]);
    expect(THIN_PAGE_CHARS).toBe(800);
  });

  it('reads a fixture pack without changing the bytes it was given', async () => {
    const pdf = fixture('three-pages.pdf');
    const before = pdf.slice();
    const thin = await thinPages(pdf);
    expect(thin.every((n) => n >= 1 && n <= 3)).toBe(true);
    expect(pdf).toEqual(before);
  });
});

describe('renderPages', () => {
  it('draws each page asked for as a PNG three times the page size', async () => {
    const pictures = await renderPages(await mixedPdf(), [2, 3]);
    expect(pictures).toHaveLength(2);
    for (const png of pictures) {
      expect([...png.slice(0, 4)]).toEqual(PNG);
      // Width and height sit in the PNG header, big-endian, at bytes 16 and 20.
      const view = new DataView(png.buffer, png.byteOffset);
      expect(view.getUint32(16)).toBe(595 * RENDER_SCALE);
      expect(view.getUint32(20)).toBe(842 * RENDER_SCALE);
    }
  });

  it('leaves out a page that is not there', async () => {
    expect(await renderPages(await mixedPdf(), [0, 4, 99])).toEqual([]);
  });
});
