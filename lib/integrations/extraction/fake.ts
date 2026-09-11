import type { DbdExtraction, DbdExtractor } from './types';

/** Fictional company used by the fake extractor (dev/tests). Contains no real data. */
export const SAMPLE_EXTRACTION: DbdExtraction = {
  juristic_id: {
    value: '0105569000123',
    confidence: 0.98,
    source_text: 'เลขทะเบียน 0105569000123',
  },
  certificate_no: {
    value: 'E00000000000001',
    confidence: 0.95,
    source_text: 'ที่ E00000000000001',
  },
  document_ref: { value: null, confidence: 0, source_text: null },
  company_name_th: {
    value: 'บริษัท ตัวอย่างการสกัด จำกัด',
    confidence: 0.97,
    source_text: 'ชื่อบริษัท บริษัท ตัวอย่างการสกัด จำกัด',
  },
  company_name_en: { value: 'SAMPLE EXTRACTION CO., LTD.', confidence: 0.9, source_text: null },
  registered_on: {
    value: '10/04/2569',
    confidence: 0.93,
    source_text: 'จดทะเบียนเมื่อวันที่ 10 เมษายน 2569',
  },
  issued_on: {
    value: '13/07/2569',
    confidence: 0.9,
    source_text: 'ออกให้ ณ วันที่ 13 กรกฎาคม 2569',
  },
  registered_capital: {
    value: 2000000,
    confidence: 0.96,
    source_text: 'ทุนจดทะเบียน 2,000,000.00 บาท',
  },
  head_office_address: {
    value: '99/9 หมู่ 1 ตำบลตัวอย่าง อำเภอตัวอย่าง จังหวัดตัวอย่าง',
    confidence: 0.62,
    source_text: 'สำนักงานแห่งใหญ่ ตั้งอยู่เลขที่ 99/9 หมู่ 1',
  },
  signing_authority: {
    value: 'กรรมการหนึ่งคนลงลายมือชื่อและประทับตราสำคัญของบริษัท',
    confidence: 0.88,
    source_text: null,
  },
  objectives_count: { value: 14, confidence: 0.85, source_text: 'วัตถุประสงค์ 14 ข้อ' },
  issuing_office: { value: null, confidence: 0, source_text: null },
  registrar_name: { value: null, confidence: 0, source_text: null },
  directors: {
    value: [{ name_th: 'นางสาวตัวอย่าง ทดสอบ', name_en: 'Miss Sample Test' }],
    confidence: 0.9,
    source_text: 'กรรมการของบริษัทมี 1 คน',
  },
};

export class FakeDbdExtractor implements DbdExtractor {
  readonly name = 'fake';
  constructor(private readonly result: DbdExtraction = SAMPLE_EXTRACTION) {}
  async extract(): Promise<DbdExtraction> {
    return structuredClone(this.result);
  }
}
