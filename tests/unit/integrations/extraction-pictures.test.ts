import type Anthropic from '@anthropic-ai/sdk';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { ClaudeDbdExtractor } from '@/lib/integrations/extraction/claude';
import {
  MAX_PICTURE_BYTES,
  MAX_READING_BYTES,
  newPictureBudget,
  pagePictures,
  pdfRenderCheck,
} from '@/lib/integrations/extraction/page-pictures';
import { EXTRACTION_INSTRUCTIONS } from '@/lib/integrations/extraction/schema';
import { MAX_PAGE_IMAGES } from '@/lib/pdf/render-pages';
import { SAMPLE_API_EXTRACTION } from './api-extraction-fixture';

type Block = { type: string; text?: string; source?: { media_type?: string } };

/** A stub that keeps what it was sent. */
function recordingClient(calls: { content: Block[] }[]) {
  return {
    messages: {
      stream: (params: { messages: { content: Block[] }[] }) => {
        calls.push({ content: params.messages[0].content });
        return {
          finalMessage: async () => ({
            stop_reason: 'end_turn',
            parsed_output: SAMPLE_API_EXTRACTION,
          }),
        };
      },
    },
  } as unknown as Anthropic;
}

/** `full` pages carry plenty of text; the rest carry none, like a scanned form. */
async function pack(full: number, bare: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const line = 'The quick brown fox jumps over the lazy dog and keeps on running. ';
  for (let p = 0; p < full; p++) {
    const page = doc.addPage([300, 420]);
    for (let i = 0; i < 30; i++) page.drawText(line, { x: 10, y: 400 - i * 12, size: 6, font });
  }
  for (let p = 0; p < bare; p++) doc.addPage([300, 420]);
  return doc.save();
}

describe('the reader is given a picture of every page it cannot read as text (D98)', () => {
  it('sends each such page after its document, labelled, and none for a page with text', async () => {
    const calls: { content: Block[] }[] = [];
    await new ClaudeDbdExtractor(recordingClient(calls)).extract([await pack(1, 2)]);
    const content = calls[0].content;
    expect(content.map((b) => b.type)).toEqual([
      'text',
      'document',
      'text',
      'image',
      'text',
      'image',
      'text',
    ]);
    expect(content[2].text).toBe('Page 2 of document 1, as a sharp picture:');
    expect(content[4].text).toBe('Page 3 of document 1, as a sharp picture:');
    expect(content[3].source?.media_type).toBe('image/png');
    expect(content.at(-1)?.text).toBe(EXTRACTION_INSTRUCTIONS);
    expect(EXTRACTION_INSTRUCTIONS).toContain('as a sharp picture');
  });

  it('sends no picture when every page has its text, or when the bytes are not a PDF', async () => {
    const calls: { content: Block[] }[] = [];
    const extractor = new ClaudeDbdExtractor(recordingClient(calls));
    await extractor.extract([await pack(2, 0)]);
    await extractor.extract([new Uint8Array([1, 2, 3])]);
    for (const call of calls) {
      expect(call.content.map((b) => b.type)).toEqual(['text', 'document', 'text']);
    }
  });

  it('shares one budget of pages and bytes across the documents of a reading', async () => {
    const budget = newPictureBudget();
    expect(budget).toEqual({ pages: MAX_PAGE_IMAGES, bytes: MAX_PICTURE_BYTES });
    const first = await pagePictures(await pack(0, MAX_PAGE_IMAGES - 1), budget);
    expect(first.map((p) => p.page)).toEqual(
      Array.from({ length: MAX_PAGE_IMAGES - 1 }, (_, i) => i + 1),
    );
    // One page left for the second document, however many it has.
    const second = await pagePictures(await pack(0, 3), budget);
    expect(second.map((p) => p.page)).toEqual([1]);
    expect(await pagePictures(await pack(0, 3), budget)).toEqual([]);
    // A picture that does not fit what is left of the bytes is not sent.
    expect(await pagePictures(await pack(0, 1), { pages: 5, bytes: 10 })).toEqual([]);
  });

  it('leaves the pictures less room as the documents grow, and none past the request ceiling', () => {
    expect(newPictureBudget(2 * 1024 * 1024).bytes).toBe(MAX_PICTURE_BYTES);
    expect(newPictureBudget(MAX_READING_BYTES - 1000).bytes).toBe(1000);
    expect(newPictureBudget(MAX_READING_BYTES + 1).bytes).toBe(0);
  });

  it('can tell the health probe that pages are drawn here', async () => {
    expect(await pdfRenderCheck()).toBe('ok');
  });
});
