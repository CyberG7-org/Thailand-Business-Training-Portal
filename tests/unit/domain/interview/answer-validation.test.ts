import { describe, expect, it } from 'vitest';
import { evaluateReadinessAnswer } from '@/lib/domain/interview/answer-validation';
import type { ConceptId, PlanItem } from '@/lib/domain/interview/types';

const mark = (concept: ConceptId, expected: string, answer: string) =>
  evaluateReadinessAnswer({ concept, expected } as PlanItem, answer);

describe('readiness answers expressed in the learner’s own words', () => {
  it('accepts the full Thai registered name with the English name added', () => {
    expect(
      mark(
        'company_name',
        'บริษัท วนทรัพย์ไทย จำกัด',
        'บริษัท วนทรัพย์ไทย จำกัด (WON SAP THAI CO., LTD.)',
      ),
    ).toBe('correct');
  });

  it('does not accept a different Thai registered name even with extra context', () => {
    expect(mark('company_name', 'บริษัท วนทรัพย์ไทย จำกัด', 'บริษัท วนทรัพย์ทอง จำกัด')).toBe(
      'wrong',
    );
  });

  it('accepts Director alone without a name, signing condition or seal', () => {
    expect(
      mark('authorized_representative', 'นายวรีโรจน์ ชาวนารี / นายวรีโรจน์ ชาวนารี', 'กรรมการ'),
    ).toBe('correct');
  });

  it('does not accept an unidentified or different signer just for saying sign', () => {
    const expected = 'นายวรีโรจน์ ชาวนารี / นายวรีโรจน์ ชาวนารี';
    expect(mark('authorized_representative', expected, 'ผมลงนาม')).toBe('wrong');
    expect(mark('authorized_representative', expected, 'คนอื่นลงนาม')).toBe('wrong');
    expect(mark('authorized_representative', expected, 'ผู้จัดการ')).toBe('wrong');
  });

  it('does not require signing conditions even when the registration has them', () => {
    const expected = 'นายหนึ่ง ใจดี, นางสาวสอง ใจดี / กรรมการสองคนลงนามร่วมกัน';
    expect(mark('authorized_representative', expected, 'นายหนึ่ง ใจดี')).toBe('wrong');
    expect(mark('authorized_representative', expected, 'กรรมการ')).toBe('correct');
  });

  it('accepts the director role independently of names in the certificate', () => {
    const expected = 'นายหนึ่ง ใจดี, นางสาวสอง ใจดี / นายหนึ่ง ใจดีลงนาม';
    expect(mark('authorized_representative', expected, 'นางสาวสอง ใจดี')).toBe('wrong');
    expect(mark('authorized_representative', expected, 'กรรมการ')).toBe('correct');
  });

  it('accepts an equivalent director role without requiring the word sign', () => {
    expect(
      mark('authorized_representative', 'นายหนึ่ง ใจดี / กรรมการหนึ่งคนลงนาม', 'กรรมการคนเดียว'),
    ).toBe('correct');
  });

  it('accepts the same registered date in English with the Gregorian year', () => {
    expect(mark('registration_date', '7 พฤษภาคม 2569', '7 May 2026')).toBe('correct');
  });

  it('accepts a numeric rendering of the same registered date', () => {
    expect(mark('registration_date', '7 พฤษภาคม 2569', '7/5/2026')).toBe('correct');
    expect(mark('registration_date', '7 พฤษภาคม 2569', '2026-05-07')).toBe('correct');
  });

  it('rejects a different month or day even when the year matches', () => {
    expect(mark('registration_date', '7 พฤษภาคม 2569', '7 June 2026')).toBe('wrong');
    expect(mark('registration_date', '7 พฤษภาคม 2569', '8 May 2026')).toBe('wrong');
  });

  it('does not count a generic company word as a business explanation', () => {
    expect(mark('actual_business', 'บริษัทจำหน่ายผลไม้สด', 'บริษัท')).toBe('wrong');
  });

  it('accepts a scaled amount with the same meaning as the saved amount', () => {
    expect(mark('monthly_revenue', 'ประมาณ 2,700,000 บาท', '2.7 ล้านบาทต่อเดือน')).toBe('correct');
  });

  it('accepts a plain-language account purpose without fixed wording', () => {
    expect(
      mark(
        'account_purpose',
        'รับเงินจากลูกค้าและจ่ายค่าใช้จ่ายของกิจการ',
        'ใช้รับชำระค่าสินค้า แล้วจ่ายค่าเช่าร้าน',
      ),
    ).toBe('correct');
  });

  it('accepts one documented way of finding customers without requiring a customer group', () => {
    const expected = 'Facebook และลูกค้าแนะนำ';
    expect(mark('customer_origin', expected, 'หาลูกค้าผ่าน Facebook')).toBe('correct');
    expect(mark('customer_origin', expected, 'ได้ลูกค้าจากการบอกต่อ')).toBe('correct');
    expect(mark('customer_origin', expected, 'ส่วนใหญ่เป็นลูกค้าธุรกิจ')).toBe('wrong');
    expect(mark('customer_origin', expected, 'จากเว็บไซต์')).toBe('wrong');
  });
});
