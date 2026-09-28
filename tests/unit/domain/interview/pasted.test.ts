import { describe, expect, it } from 'vitest';
import { detectPasted } from '@/lib/domain/interview/pasted';

const facts = {
  company_name_th: 'บริษัท ธาราวาณิช จำกัด',
  juristic_id: '0105568233704',
  head_office_address: 'เลขที่ 35/9 ซอย พหลโยธิน 54/1 แยก 4-22 แขวงสายไหม เขตสายไหม กรุงเทพมหานคร',
  products_services: 'ค้าปลีกสินค้าเกษตร ข้าวสาร ปุ๋ย และเครื่องมือการเกษตร',
};

/** Review Focus 2: typing a long fact is fine; dumping the record is not. */
describe('detectPasted', () => {
  it('lets a learner type the full address in their own answer', () => {
    expect(
      detectPasted(
        'เลขที่ 35/9 ซอย พหลโยธิน 54/1 แยก 4-22 แขวงสายไหม เขตสายไหม กรุงเทพมหานคร ครับ',
        facts,
      ),
    ).toBe(false);
  });

  it('lets a learner say the name and the number in one sentence', () => {
    expect(detectPasted('บริษัท ธาราวาณิช จำกัด เลขทะเบียน 0105568233704 ครับ', facts)).toBe(false);
  });

  it('flags two long facts reproduced verbatim together', () => {
    expect(detectPasted(facts.head_office_address + ' ' + facts.products_services, facts)).toBe(
      true,
    );
  });

  it('flags a system-style summary of label: value lines', () => {
    expect(
      detectPasted(
        'ชื่อบริษัท: บริษัท ธาราวาณิช จำกัด\nเลขทะเบียน: 0105568233704\nทุนจดทะเบียน: 1,000,000 บาท',
        facts,
      ),
    ).toBe(true);
  });
});
