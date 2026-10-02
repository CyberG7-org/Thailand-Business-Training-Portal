import { describe, expect, it } from 'vitest';
import {
  applyExtractionToRecord,
  extractionToFormValues,
  restoreProfileMarks,
  restoresMarks,
} from '@/lib/domain/extraction-merge';
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
    expect(input.juristic_id).toBe('0105569000134');
    expect(input.issued_on).toBe('2026-07-13');
    expect(input.registered_capital).toBe(2000000);
    expect(input.directors.length).toBeGreaterThan(0);
    expect(applied).toContain('juristic_id');
    expect(applied).not.toContain('company_name_th');
    expect(rejected).toEqual([]);
  });

  it('replaces a stored value that is the new reading with Thai marks missing (D92)', () => {
    const fresh = {
      ...SAMPLE_EXTRACTION,
      head_office_address: {
        ...SAMPLE_EXTRACTION.head_office_address,
        value: 'เลขที่ 194/3 หมู่ที่ 2 ตำบลวังใหญ่ อำเภอเทพา จังหวัดสงขลา',
      },
      signing_authority: {
        ...SAMPLE_EXTRACTION.signing_authority,
        value: 'กรรมการหนึ่งคนลงลายมือชื่อและประทับตราสำคัญของบริษัท',
      },
    };
    const current = {
      company_name_th: 'บริษัท ที่แอดมินพิมพ์ จำกัด',
      juristic_id: '0105569000134',
      // Read earlier by a reader that dropped the low marks.
      head_office_address: 'เลขที่ 194/3 หมูที่ 2  ตำบลวังใหญ อำเภอเทพา จังหวัดสงขลา',
      // Typed by a person: different words, not lost marks.
      signing_authority: 'กรรมการสองคนลงลายมือชื่อร่วมกัน',
    };
    const { input, applied } = applyExtractionToRecord(fresh, current);
    expect(input.head_office_address).toBe(
      'เลขที่ 194/3 หมู่ที่ 2 ตำบลวังใหญ่ อำเภอเทพา จังหวัดสงขลา',
    );
    expect(applied).toContain('head_office_address');
    expect(input.signing_authority).toBe('กรรมการสองคนลงลายมือชื่อร่วมกัน');
    expect(input.company_name_th).toBe('บริษัท ที่แอดมินพิมพ์ จำกัด');
    expect(restoresMarks('ผูถือหุน', 'ผู้ถือหุ้น')).toBe(true);
    expect(restoresMarks('ผู้ถือหุ้น', 'ผู้ถือหุ้น')).toBe(false);
    expect(restoresMarks(undefined, 'ผู้ถือหุ้น')).toBe(false);
  });

  it('takes dates as the certificate prints them (first real pack on staging: "9 เมษายน 2569")', () => {
    const printed = structuredClone(SAMPLE_EXTRACTION);
    printed.registered_on.value = '9 เมษายน 2569';
    printed.issued_on.value = '5 เดือน สิงหาคม พ.ศ. 2569';
    const { input, applied, rejected } = applyExtractionToRecord(printed, {});
    expect(input.registered_on).toBe('2026-04-09');
    expect(input.issued_on).toBe('2026-08-05');
    expect(applied).toEqual(expect.arrayContaining(['registered_on', 'issued_on']));
    expect(rejected).toEqual([]);
    const notes = extractionToFormValues(printed).dateNotes;
    expect(notes.registered_on).toEqual({ raw: '9 เมษายน 2569', iso: '2026-04-09', wasBe: true });
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

describe('restoreProfileMarks (D92)', () => {
  const share_structure = {
    total_shares: 20000,
    par_value: 100,
    paid_up_capital: null,
    share_type: null,
  };
  const stored = {
    objectives: [
      { no: 1, text: 'ซื้อ ขาย หุน และถือหุนในบริษัทอื่น' },
      { no: 2, text: 'ประกอบกิจการค้าที่ผู้จัดการแก้ไขเอง' },
    ],
    business_categories: ['คาปลีก', 'บริการ'],
    share_structure,
    shareholders: [
      { name: 'นายตัวอยาง ทดสอบ', nationality: 'ไทย', shares: 18000, percent: null },
      { name: 'นางสาวสมหญิง ตัวอย่าง', nationality: 'ไทย', shares: 2000, percent: null },
    ],
    promoters: [{ name: 'นายสมพงษ ทดสอบ', nationality: 'ไทย' }],
  };
  const fresh = {
    objectives: [
      { no: 1, text: 'ซื้อ ขาย หุ้น และถือหุ้นในบริษัทอื่น' },
      { no: 2, text: 'ประกอบกิจการค้าปลีกและค้าส่ง' },
    ],
    business_categories: ['ค้าปลีก', 'บริการที่ปรึกษา'],
    share_structure: { ...share_structure, total_shares: 99 },
    shareholders: [
      { name: 'นายตัวอย่าง ทดสอบ', nationality: 'ไทย', shares: 1, percent: 50 },
      // The two readings disagree on a letter here: nobody's to choose.
      { name: 'นางสาวสมหญิง ตัวอย่าก', nationality: 'ไทย', shares: 2000, percent: null },
    ],
    promoters: [{ name: 'นายสมพงษ์ ทดสอบ', nationality: null }],
  };

  it('puts the marks back row by row and changes nothing else', () => {
    const out = restoreProfileMarks(stored, fresh);
    expect(out.objectives).toEqual([
      { no: 1, text: 'ซื้อ ขาย หุ้น และถือหุ้นในบริษัทอื่น' },
      { no: 2, text: 'ประกอบกิจการค้าที่ผู้จัดการแก้ไขเอง' },
    ]);
    expect(out.business_categories).toEqual(['ค้าปลีก', 'บริการ']);
    expect(out.shareholders).toEqual([
      { name: 'นายตัวอย่าง ทดสอบ', nationality: 'ไทย', shares: 18000, percent: null },
      stored.shareholders[1],
    ]);
    expect(out.promoters).toEqual([{ name: 'นายสมพงษ์ ทดสอบ', nationality: 'ไทย' }]);
    expect(out.share_structure).toEqual(share_structure);
  });

  it('returns the stored profile itself when no row lost a mark', () => {
    expect(restoreProfileMarks(fresh, fresh)).toBe(fresh);
    expect(
      restoreProfileMarks(stored, {
        ...fresh,
        objectives: [],
        shareholders: [],
        promoters: [],
        business_categories: [],
      }),
    ).toBe(stored);
  });
});
