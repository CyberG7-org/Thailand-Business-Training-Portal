import { describe, expect, it } from 'vitest';
import { applyExtractionToRecord, extractionToFormValues } from '@/lib/domain/extraction-merge';
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
      issued_on: { ...SAMPLE_EXTRACTION.issued_on, value: '2026-07-13', confidence: 1 },
    });
    expect(out.dateNotes.issued_on).toEqual({ raw: '2026-07-13', iso: '2026-07-13', wasBe: false });
  });

  it('turns numbers into input strings and directors into the textarea format', () => {
    expect(s.values.registered_capital).toBe('2000000');
    expect(s.values.objectives_count).toBe('14');
    expect(s.values.directors_text).toBe('นางสาวตัวอย่าง ทดสอบ | Miss Sample Test');
  });

  it('lists low-confidence fields that have a value, and never fabricates missing ones', () => {
    expect(s.lowConfidence).toEqual(['head_office_address', 'province']);
    expect(s.values.document_ref).toBe('');
    expect(s.values.issuing_office).toBe('');
    expect(s.confidence.document_ref).toBe(0);
  });

  it('leaves an unparseable printed date in place so the admin sees it', () => {
    const out = extractionToFormValues({
      ...SAMPLE_EXTRACTION,
      issued_on: { ...SAMPLE_EXTRACTION.issued_on, value: 'thirteen July', confidence: 0.4 },
    });
    expect(out.values.issued_on).toBe('thirteen July');
    expect(out.dateNotes.issued_on.iso).toBeNull();
    expect(out.lowConfidence).toContain('issued_on');
  });
});

describe('applyExtractionToRecord', () => {
  it('fills only empty fields, keeps admin values, and normalizes dates and numbers', () => {
    const current = { company_name_th: 'บริษัท ที่แอดมินพิมพ์ จำกัด', juristic_id: '' };
    const { input, applied, rejected } = applyExtractionToRecord(SAMPLE_EXTRACTION, current);
    expect(input.company_name_th).toBe('บริษัท ที่แอดมินพิมพ์ จำกัด');
    expect(input.juristic_id).toBe('0105569000123');
    expect(input.issued_on).toBe('2026-07-13');
    expect(input.registered_capital).toBe(2000000);
    expect(input.directors.length).toBeGreaterThan(0);
    expect(applied).toContain('juristic_id');
    expect(applied).not.toContain('company_name_th');
    expect(rejected).toEqual([]);
  });

  it('drops an invalid extracted value on its own and keeps the rest', () => {
    const broken = structuredClone(SAMPLE_EXTRACTION);
    broken.juristic_id.value = '12345'; // not 13 digits
    const { input, applied, rejected } = applyExtractionToRecord(broken, {});
    expect(input.juristic_id).toBeNull();
    expect(input.company_name_th).toBe('บริษัท ตัวอย่างการสกัด จำกัด');
    expect(rejected).toEqual(['juristic_id']);
    expect(applied).not.toContain('juristic_id');
  });
});
