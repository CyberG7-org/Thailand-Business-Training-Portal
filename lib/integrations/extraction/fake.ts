import type { DbdExtraction, DbdExtractor } from './types';

const at = (page: number | null, doc: number | null = 1) => ({
  source_page: page,
  source_document: doc,
});
const missing = { value: null, confidence: 0, source_text: null, ...at(null, null) };

/** Fictional company used by the fake extractor (dev/tests). Contains no real data. */
export const SAMPLE_EXTRACTION: DbdExtraction = {
  // Level 1
  company_name_th: {
    value: 'บริษัท ตัวอย่างการสกัด จำกัด',
    confidence: 0.97,
    source_text: 'ชื่อบริษัท บริษัท ตัวอย่างการสกัด จำกัด',
    ...at(1),
  },
  company_name_en: {
    value: 'SAMPLE EXTRACTION CO., LTD.',
    confidence: 0.9,
    source_text: null,
    ...at(1),
  },
  juristic_id: {
    value: '0105569000123',
    confidence: 0.98,
    source_text: 'เลขทะเบียน 0105569000123',
    ...at(1),
  },
  registered_on: {
    value: '10/04/2569',
    confidence: 0.93,
    source_text: 'จดทะเบียนเมื่อวันที่ 10 เมษายน 2569',
    ...at(1),
  },
  registered_capital: {
    value: 2000000,
    confidence: 0.96,
    source_text: 'ทุนจดทะเบียน 2,000,000.00 บาท',
    ...at(1),
  },
  directors: {
    value: [{ name_th: 'นางสาวตัวอย่าง ทดสอบ', name_en: 'Miss Sample Test' }],
    confidence: 0.9,
    source_text: 'กรรมการของบริษัทมี 1 คน',
    ...at(1),
  },
  signing_authority: {
    value: 'กรรมการหนึ่งคนลงลายมือชื่อและประทับตราสำคัญของบริษัท',
    confidence: 0.88,
    source_text: null,
    ...at(1),
  },
  head_office_address: {
    value: '99/9 หมู่ 1 ตำบลตัวอย่าง อำเภอตัวอย่าง จังหวัดตัวอย่าง',
    confidence: 0.62,
    source_text: 'สำนักงานแห่งใหญ่ ตั้งอยู่เลขที่ 99/9 หมู่ 1',
    ...at(1),
  },
  province: { value: 'ตัวอย่าง', confidence: 0.7, source_text: 'จังหวัดตัวอย่าง', ...at(1) },

  // Level 2
  objectives: {
    value: [
      { no: 1, text: 'ประกอบกิจการค้าปลีกและค้าส่งสินค้าอุปโภคบริโภค' },
      { no: 2, text: 'ประกอบกิจการนำเข้าและส่งออกสินค้าทุกชนิด' },
      { no: 3, text: 'ประกอบกิจการให้บริการคำปรึกษาทางธุรกิจ' },
    ],
    confidence: 0.9,
    source_text: 'วัตถุที่ประสงค์ (1) ประกอบกิจการค้าปลีก…',
    ...at(1, 2),
  },
  business_categories: {
    value: ['ค้าปลีก-ค้าส่ง', 'นำเข้า-ส่งออก', 'บริการให้คำปรึกษา'],
    confidence: 0.8,
    source_text: null,
    ...at(1, 2),
  },
  share_structure: {
    value: {
      total_shares: 20000,
      par_value: 100,
      paid_up_capital: 2000000,
      share_type: 'หุ้นสามัญ',
    },
    confidence: 0.92,
    source_text: 'หุ้นสามัญ 20,000 หุ้น มูลค่าหุ้นละ 100 บาท',
    ...at(1, 3),
  },
  shareholders: {
    value: [
      { name: 'นางสาวตัวอย่าง ทดสอบ', nationality: 'ไทย', shares: 19998, percent: 99.99 },
      { name: 'นายสอง ทดสอบ', nationality: 'ไทย', shares: 1, percent: 0.005 },
      { name: 'นายสาม ทดสอบ', nationality: 'ไทย', shares: 1, percent: 0.005 },
    ],
    confidence: 0.9,
    source_text: 'บัญชีรายชื่อผู้ถือหุ้น',
    ...at(1, 3),
  },
  promoters: {
    value: [
      { name: 'นางสาวตัวอย่าง ทดสอบ', nationality: 'ไทย' },
      { name: 'นายสอง ทดสอบ', nationality: 'ไทย' },
      { name: 'นายสาม ทดสอบ', nationality: 'ไทย' },
    ],
    confidence: 0.85,
    source_text: 'ผู้เริ่มก่อการ',
    ...at(1, 4),
  },

  // Level 3
  documents: [
    { index: 1, document_type: 'certificate', title_as_printed: 'หนังสือรับรอง', pages: 3 },
    { index: 2, document_type: 'objectives_sheet', title_as_printed: 'วัตถุที่ประสงค์', pages: 1 },
    {
      index: 3,
      document_type: 'shareholder_list',
      title_as_printed: 'บัญชีรายชื่อผู้ถือหุ้น (บอจ.5)',
      pages: 1,
    },
    {
      index: 4,
      document_type: 'memorandum',
      title_as_printed: 'หนังสือบริคณห์สนธิ (บอจ.2)',
      pages: 2,
    },
  ],
  certificate_no: {
    value: 'E00000000000001',
    confidence: 0.95,
    source_text: 'ที่ E00000000000001',
    ...at(1),
  },
  document_ref: { ...missing },
  issued_on: {
    value: '13/07/2569',
    confidence: 0.9,
    source_text: 'ออกให้ ณ วันที่ 13 กรกฎาคม 2569',
    ...at(2),
  },
  registrar_name: { ...missing },
  issuing_office: { ...missing },
  objectives_count: { value: 14, confidence: 0.85, source_text: 'วัตถุประสงค์ 14 ข้อ', ...at(1) },
};

export class FakeDbdExtractor implements DbdExtractor {
  readonly name = 'fake';
  constructor(private readonly result: DbdExtraction = SAMPLE_EXTRACTION) {}
  async extract(documents: Uint8Array[]): Promise<DbdExtraction> {
    const result = structuredClone(this.result);
    // Only claim the documents that were actually uploaded.
    result.documents = result.documents.slice(0, Math.max(1, documents.length));
    return result;
  }
}
