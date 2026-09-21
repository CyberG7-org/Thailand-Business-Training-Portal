import type { DbdExtractionApi } from '@/lib/integrations/extraction/schema';

const read = (field: DbdExtractionApi['provenance'][number]['field']) => ({
  field,
  confidence: 0.9,
  source_text: 'snippet',
  source_page: 2,
  source_document: 1,
});

/** A model answer in the flat, union-free API shape (fictional company). */
export const SAMPLE_API_EXTRACTION: DbdExtractionApi = {
  company_name_th: 'บริษัท ทดสอบ จำกัด',
  company_name_en: '',
  juristic_id: '0105569000123',
  registered_on: '10/04/2569',
  registered_capital: 2000000,
  directors: [{ name_th: 'นางสาวตัวอย่าง ทดสอบ', name_en: '' }],
  signing_authority: '',
  head_office_address: '99/9 หมู่ 1',
  province: '',
  objectives: [
    { no: 1, text: 'ค้าปลีก' },
    { no: 0, text: 'ไม่มีเลขข้อ' },
  ],
  business_categories: [],
  share_structure: { total_shares: 20000, par_value: 100, paid_up_capital: 0, share_type: '' },
  shareholders: [{ name: 'นางสาวตัวอย่าง ทดสอบ', nationality: 'ไทย', shares: 19998, percent: 0 }],
  promoters: [],
  documents: [{ index: 1, document_type: 'certificate', title_as_printed: '', pages: 0 }],
  certificate_no: '',
  document_ref: '',
  issued_on: '13/07/2569',
  registrar_name: '',
  issuing_office: '',
  objectives_count: 14,
  provenance: [
    read('company_name_th'),
    read('juristic_id'),
    read('registered_on'),
    read('registered_capital'),
    read('directors'),
    read('head_office_address'),
    read('objectives'),
    read('share_structure'),
    read('shareholders'),
    read('issued_on'),
    read('objectives_count'),
  ],
};
