import { describe, expect, it } from 'vitest';
import { formatPageMarkers, parsePageMarkers } from '@/lib/domain/rag/transcript';
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
