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
  it('asks five questions and fills ten, and no field is both', () => {
    expect(ASKED_INTERVIEW_FIELDS).toEqual([
      'client_origin',
      'customer_profile',
      'main_suppliers',
      'monthly_revenue',
      'average_transaction',
    ]);
    expect(STANDARD_ANSWER_FIELDS).toHaveLength(10);
    for (const f of STANDARD_ANSWER_FIELDS) expect(ASKED_INTERVIEW_FIELDS).not.toContain(f);
  });

  it('answers "main customers" with what kind of customers they are (quiz question 14)', () => {
    const p = withStandardAnswers(
      { ...typed, customer_profile: 'ร้านค้าปลีกในประเทศ', main_clients: 'คำตอบเดิม' },
      { address: ADDRESS },
    );
    expect(p.main_clients).toBe('ร้านค้าปลีกในประเทศ');
    expect(withStandardAnswers(typed, { address: ADDRESS }).main_clients).toBeNull();
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
