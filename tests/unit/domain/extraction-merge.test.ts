import { describe, expect, it } from 'vitest';
import { extractionToFormValues } from '@/lib/domain/extraction-merge';
import { SAMPLE_EXTRACTION } from '@/lib/integrations/extraction/fake';

describe('extractionToFormValues', () => {
  const s = extractionToFormValues(SAMPLE_EXTRACTION);

  it('normalizes printed BE dates to CE and records the reading', () => {
    expect(s.values.issued_on).toBe('2026-07-13');
    expect(s.dateNotes.issued_on).toEqual({ raw: '13/07/2569', iso: '2026-07-13', wasBe: true });
    expect(s.values.registered_on).toBe('2026-04-10');
  });

  it('keeps a CE date as-is and marks it as not BE', () => {
    const out = extractionToFormValues({
      ...SAMPLE_EXTRACTION,
      issued_on: { value: '2026-07-13', confidence: 1, source_text: null },
    });
    expect(out.dateNotes.issued_on).toEqual({ raw: '2026-07-13', iso: '2026-07-13', wasBe: false });
  });

  it('turns numbers into input strings and directors into the textarea format', () => {
    expect(s.values.registered_capital).toBe('2000000');
    expect(s.values.objectives_count).toBe('14');
    expect(s.values.directors_text).toBe('นางสาวตัวอย่าง ทดสอบ | Miss Sample Test');
  });

  it('lists low-confidence fields that have a value, and never fabricates missing ones', () => {
    expect(s.lowConfidence).toEqual(['head_office_address']);
    expect(s.values.document_ref).toBe('');
    expect(s.values.issuing_office).toBe('');
    expect(s.confidence.document_ref).toBe(0);
  });

  it('leaves an unparseable printed date in place so the admin sees it', () => {
    const out = extractionToFormValues({
      ...SAMPLE_EXTRACTION,
      issued_on: { value: 'thirteen July', confidence: 0.4, source_text: null },
    });
    expect(out.values.issued_on).toBe('thirteen July');
    expect(out.dateNotes.issued_on.iso).toBeNull();
    expect(out.lowConfidence).toContain('issued_on');
  });
});
