import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { formatPageMarkers, parsePageMarkers } from '@/lib/domain/rag/transcript';
import { ClaudeDbdExtractor } from '@/lib/integrations/extraction/claude';
import { FakeDbdExtractor, fakePageText } from '@/lib/integrations/extraction/fake';
import {
  DEFAULT_TRANSCRIPTION_MODEL,
  transcriptionModel,
  transcriptionPrompt,
} from '@/lib/integrations/extraction/transcribe';

describe('transcription prompt', () => {
  it('tells the model the original page numbers and the exact markers to emit', () => {
    const prompt = transcriptionPrompt({ firstPage: 6, lastPage: 8 });
    expect(prompt).toContain('page 6 of the original');
    expect(prompt).toContain('=== PAGE 6 ===, === PAGE 7 ===, === PAGE 8 ===');
    expect(prompt).toContain('verbatim');
  });

  it('uses Sonnet unless TRANSCRIPTION_MODEL overrides it', () => {
    expect(transcriptionModel({})).toBe(DEFAULT_TRANSCRIPTION_MODEL);
    expect(transcriptionModel({ TRANSCRIPTION_MODEL: 'claude-opus-5' })).toBe('claude-opus-5');
  });
});

describe('fake transcriber', () => {
  it('returns every page of the slice with fictional Thai text that survives the marker format', async () => {
    const pages = await new FakeDbdExtractor().transcribe(new Uint8Array(), {
      firstPage: 1,
      lastPage: 3,
    });
    expect(pages.map((p) => p.page)).toEqual([1, 2, 3]);
    expect(pages[0].text).toContain('ทุนจดทะเบียน 2,000,000 บาท');
    expect(pages[1].text).toMatch(/^วัตถุที่ประสงค์/);
    expect(pages[2].text).toContain('บอจ.5');
    expect(parsePageMarkers(formatPageMarkers(pages), { firstPage: 1, lastPage: 3 })).toEqual(
      pages,
    );
    expect(fakePageText(7)).toContain('หน้า 7');
  });
});

describe('Claude transcriber (stubbed SDK client)', () => {
  const clientReturning = (message: { stop_reason: string; content: unknown[] }) =>
    ({
      messages: {
        stream: () => ({ finalMessage: async () => message }),
      },
    }) as unknown as Anthropic;

  it('parses the pages of a complete transcript', async () => {
    const extractor = new ClaudeDbdExtractor(
      clientReturning({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: '=== PAGE 3 ===\nสาม\n=== PAGE 4 ===\nสี่' }],
      }),
    );
    await expect(
      extractor.transcribe(new Uint8Array(), { firstPage: 3, lastPage: 4 }),
    ).resolves.toEqual([
      { page: 3, text: 'สาม' },
      { page: 4, text: 'สี่' },
    ]);
  });

  it('refuses a transcript cut off by the output limit instead of storing a truncated page', async () => {
    const extractor = new ClaudeDbdExtractor(
      clientReturning({
        stop_reason: 'max_tokens',
        content: [{ type: 'text', text: '=== PAGE 3 ===\nสาม\n=== PAGE 4 ===\nสี่ (ถูกตัด' }],
      }),
    );
    await expect(
      extractor.transcribe(new Uint8Array(), { firstPage: 3, lastPage: 4 }),
    ).rejects.toMatchObject({ code: 'too_large' });
  });

  it('reports a refusal as invalid output', async () => {
    const extractor = new ClaudeDbdExtractor(
      clientReturning({ stop_reason: 'refusal', content: [] }),
    );
    await expect(
      extractor.transcribe(new Uint8Array(), { firstPage: 1, lastPage: 1 }),
    ).rejects.toMatchObject({ code: 'invalid_output' });
  });
});
