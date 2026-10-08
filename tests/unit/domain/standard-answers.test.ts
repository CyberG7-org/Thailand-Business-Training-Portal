// tests/unit/domain/standard-answers.test.ts
import { describe, expect, it } from 'vitest';
import { EMPTY_INTERVIEW_PROFILE } from '@/lib/domain/bank-interview';
import {
  ASKED_INTERVIEW_FIELDS,
  FIXED_ANSWERS,
  STANDARD_ANSWER_FIELDS,
  firstAmount,
  withStandardAnswers,
} from '@/lib/domain/standard-answers';

const ADDRESS = 'เลขที่ 87 หมู่ที่ 9 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด';
const typed = {
  ...EMPTY_INTERVIEW_PROFILE,
  nature_of_business: 'ค้าส่งและค้าปลีกเสื้อผ้าสตรี',
  monthly_revenue: 'ประมาณ 300,000 บาท',
  average_transaction: 'ประมาณ 10,000 บาท',
};

describe('firstAmount', () => {
  it('reads the first number, with separators, decimals or Thai digits', () => {
    expect(firstAmount('ประมาณ 300,000 บาท')).toBe(300000);
    expect(firstAmount('1,250.50')).toBe(1250.5);
    expect(firstAmount('๓๐๐,๐๐๐ บาท')).toBe(300000);
  });

  it('refuses what it cannot divide by: no digits, zero, or a number scaled by a word', () => {
    expect(firstAmount('สามแสนบาท')).toBeNull();
    expect(firstAmount('0 บาท')).toBeNull();
    expect(firstAmount('3 แสนบาท')).toBeNull();
    expect(firstAmount('300k')).toBeNull();
    expect(firstAmount('30 万')).toBeNull();
    expect(firstAmount(null)).toBeNull();
  });
});

describe('withStandardAnswers', () => {
  it('asks two amounts and fills thirteen, and no field is both', () => {
    expect(ASKED_INTERVIEW_FIELDS).toEqual(['monthly_revenue', 'average_transaction']);
    expect(STANDARD_ANSWER_FIELDS).toHaveLength(13);
    for (const f of STANDARD_ANSWER_FIELDS) expect(ASKED_INTERVIEW_FIELDS).not.toContain(f);
  });

  it('answers the customers, where they come from and the suppliers the same for every company (D101)', () => {
    const p = withStandardAnswers(
      { ...typed, customer_profile: 'ร้านค้าปลีกในประเทศ', main_clients: 'คำตอบเดิม' },
      { address: ADDRESS },
    );
    expect(p.customer_profile).toBe(FIXED_ANSWERS.customer_profile);
    expect(p.main_clients).toBe(FIXED_ANSWERS.customer_profile);
    expect(p.client_origin).toContain('Facebook และ TikTok');
    expect(p.client_origin).not.toContain('เว็บไซต์');
    expect(p.main_suppliers).toBe(FIXED_ANSWERS.main_suppliers);
    expect(p.clients_location).toBe(FIXED_ANSWERS.customer_profile);
    expect(p.suppliers_location).toBe(FIXED_ANSWERS.main_suppliers);
  });

  it('mentions the website only when the company pack contains one', () => {
    const withWebsite = withStandardAnswers(typed, {
      address: ADDRESS,
      website: 'https://example.co.th',
    });
    expect(withWebsite.client_origin).toContain('เว็บไซต์');

    const withoutWebsite = withStandardAnswers(typed, { address: ADDRESS, website: null });
    expect(withoutWebsite.client_origin).not.toContain('เว็บไซต์');
  });

  it('fills the place of business, the fixed answers and the purpose', () => {
    const p = withStandardAnswers(typed, { address: ADDRESS });
    expect(p.business_address).toBe(ADDRESS);
    expect(p.business_purpose).toBe('จัดตั้งขึ้นเพื่อประกอบธุรกิจ ค้าส่งและค้าปลีกเสื้อผ้าสตรี');
    expect(p.account_purpose).toBe(FIXED_ANSWERS.account_purpose);
    expect(p.promptpay_qr_purpose).toBe(FIXED_ANSWERS.promptpay_qr_purpose);
    expect(p.source_of_funds).toBe(FIXED_ANSWERS.source_of_funds);
    expect(p.first_incoming_funds).toBe(FIXED_ANSWERS.first_incoming_funds);
  });

  it('works the money answers out from the two amounts', () => {
    const p = withStandardAnswers(typed, { address: ADDRESS });
    expect(p.monthly_transactions).toBe('ประมาณ 30 รายการต่อเดือน');
    expect(p.revenue_basis).toBe('ยอดขายประมาณ 30 รายการต่อเดือน เฉลี่ยรายการละ 10,000 บาท');
    expect(p.transaction_details).toBe(
      'ลูกค้าชำระด้วยการโอนเงินผ่านธนาคารและ PromptPay / QR เฉลี่ยรายการละประมาณ 10,000 บาท',
    );
    // Never fewer than one sale a month.
    const small = withStandardAnswers(
      { ...typed, monthly_revenue: '5,000', average_transaction: '20,000' },
      { address: ADDRESS },
    );
    expect(small.monthly_transactions).toBe('ประมาณ 1 รายการต่อเดือน');
  });

  it('leaves a computed answer empty when an amount is missing or not a number', () => {
    const p = withStandardAnswers({ ...typed, monthly_revenue: 'สามแสนบาท' }, { address: null });
    expect(p.monthly_transactions).toBeNull();
    expect(p.revenue_basis).toBeNull();
    expect(p.business_address).toBeNull();
    // How sales are paid is always answered; the amount is added when there is one.
    expect(p.transaction_details).toContain('เฉลี่ยรายการละประมาณ 10,000 บาท');
    expect(
      withStandardAnswers({ ...typed, average_transaction: null }, { address: null })
        .transaction_details,
    ).toBe('ลูกค้าชำระด้วยการโอนเงินผ่านธนาคารและ PromptPay / QR');
    expect(
      withStandardAnswers({ ...typed, nature_of_business: null }, { address: null })
        .business_purpose,
    ).toBeNull();
  });

  it('always answers yes to the company status, and ignores an earlier typed answer (D91)', () => {
    const p = withStandardAnswers(
      {
        ...typed,
        has_existing_customers: 'no',
        operations_started: null,
        account_purpose: 'คำตอบเดิมของผู้จัดการ',
        business_address: 'ที่อยู่เดิม',
      },
      { address: ADDRESS },
    );
    expect(p.operations_started).toBe('yes');
    expect(p.has_existing_customers).toBe('yes');
    expect(p.has_completed_transactions).toBe('yes');
    expect(p.has_regular_suppliers).toBe('yes');
    expect(p.account_purpose).toBe(FIXED_ANSWERS.account_purpose);
    expect(p.business_address).toBe(ADDRESS);
  });

  it('lets a blank earlier answer follow the new one, and keeps one that was written', () => {
    const p = withStandardAnswers(
      {
        ...typed,
        customer_profile: 'ร้านค้าปลีกในประเทศ',
        main_suppliers: 'โรงงานในกรุงเทพมหานคร',
        suppliers_location: 'กรุงเทพมหานครและสมุทรปราการ',
      },
      { address: ADDRESS },
    );
    expect(p.monthly_volume).toBe('ประมาณ 300,000 บาท');
    expect(p.clients_location).toBe(FIXED_ANSWERS.customer_profile);
    expect(p.suppliers_location).toBe('กรุงเทพมหานครและสมุทรปราการ');
    expect(p.operations_status).toBe('เริ่มดำเนินธุรกิจแล้ว');
  });

  it('keeps what the manager is still asked exactly as typed', () => {
    const asked = {
      ...typed,
      client_origin: 'หน้าร้านและออนไลน์',
      customer_profile: 'ร้านค้าปลีกในประเทศ',
      main_suppliers: 'โรงงานในกรุงเทพมหานคร',
    };
    const p = withStandardAnswers(asked, { address: ADDRESS });
    for (const f of ASKED_INTERVIEW_FIELDS) expect(p[f]).toBe(asked[f]);
    expect(p.nature_of_business).toBe(asked.nature_of_business);
  });
});
