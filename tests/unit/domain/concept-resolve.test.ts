import { describe, expect, it } from 'vitest';
import { EVALUATION_CONCEPTS } from '@/lib/domain/concepts/registry';
import { conceptCoverage, resolveConcept } from '@/lib/domain/concepts/resolve';
import type { FactSheet } from '@/lib/domain/facts/fact-sheet';

const resolvedAddress = {
  full: 'เลขที่ 87 หมู่ที่ 9 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด',
  house_no: '87',
  moo: '9',
  road: null,
  subdistrict: 'หนองใหญ่',
  district: 'โพนทอง',
  province: 'ร้อยเอ็ด',
  postcode: '45110',
  province_id: 33,
  district_id: 4507,
  subdistrict_id: 450705,
  postcode_source: 'geography' as const,
  status: 'resolved' as const,
  issues: [],
};

/** A company with every fact in place and a learner who holds shares. */
function complete(): FactSheet {
  return {
    company_name_th: 'บริษัท ซินเนอร์จี แล็บ จำกัด',
    company_name_en: 'SYNERGY LAB CO., LTD.',
    juristic_id: '0455569000808',
    registered_on: '2026-04-16',
    registered_capital: 2_000_000,
    directors: [{ name_th: 'นางสาวกุลธิดา พลเยี่ยม', name_en: null }],
    signing_authority: 'กรรมการหนึ่งคนลงลายมือชื่อและประทับตรา',
    address: resolvedAddress,
    shareholders: [
      { name: 'นางสาวกุลธิดา พลเยี่ยม', nationality: null, shares: 18_000, percent: 90 },
    ],
    total_shares: 20_000,
    nature_of_business: 'ค้าส่งและค้าปลีกเสื้อผ้า',
    products_services: 'ชุดเดรส เสื้อ กระโปรงสตรี',
    business_purpose: 'จำหน่ายเสื้อผ้าสตรีในภาคอีสาน',
    main_clients: 'ร้านค้าปลีกเสื้อผ้า',
    client_origin: 'หน้าร้านและออนไลน์',
    main_suppliers: 'โรงงานตัดเย็บในกรุงเทพฯ',
    business_address: 'ร้อยเอ็ด',
    monthly_revenue: '300,000 บาท',
    revenue_basis: 'ลูกค้า 30 ราย เฉลี่ย 10,000 บาท',
    average_transaction: '10,000 บาท',
    monthly_transactions: '30',
    source_of_funds: 'เงินออมของกรรมการ',
    first_incoming_funds: 'ทุนจดทะเบียนจากผู้ถือหุ้น',
    account_purpose: 'รับชำระค่าสินค้า',
    promptpay_qr_purpose: 'ให้ลูกค้าชำระเงินสะดวก',
    customer_examples: 'ร้านบุษบา ร้อยเอ็ด',
    customer_profile: 'ร้านค้าปลีกในประเทศ',
    transaction_details: 'โอนผ่านบัญชีบริษัท',
    operations_started: true,
    has_existing_customers: true,
    has_completed_transactions: true,
    has_regular_suppliers: true,
    learner_is_shareholder: true,
    business_category: 'clothing_fashion',
    holder_name: 'นางสาวกุลธิดา พลเยี่ยม',
    position: 'กรรมการ',
    director_count: 1,
    shareholder_count: 1,
    my_shares: 18_000,
    my_share_percent: 90,
  };
}

const concept = (key: string) => EVALUATION_CONCEPTS.find((c) => c.key === key)!;

describe('conceptCoverage (spec §7.3, D74)', () => {
  it('counts a record on its company-level concepts only: 29/29 and 12/12, never 30 or 13', () => {
    const c = conceptCoverage(complete(), 'company');
    expect(c.mcq).toEqual({ ready: 29, total: 29 });
    expect(c.interview).toEqual({ ready: 12, total: 12 });
    expect(c.perLearner).toEqual(['learner_shareholding', 'attendee_identity']);
    expect(c.missingFacts).toEqual([]);
  });

  it('counts an assignment 30/30 and 13/13 once the role facts resolve', () => {
    const c = conceptCoverage(complete(), 'assignment');
    expect(c.mcq).toEqual({ ready: 30, total: 30 });
    expect(c.interview).toEqual({ ready: 13, total: 13 });
    expect(c.perLearner).toEqual([]);
  });

  it('keeps an assignment below 30/30 and 13/13 while a role fact is missing', () => {
    const c = conceptCoverage(
      {
        ...complete(),
        holder_name: null,
        learner_is_shareholder: null,
        my_shares: null,
        my_share_percent: null,
      },
      'assignment',
    );
    expect(c.mcq).toEqual({ ready: 29, total: 30 });
    expect(c.interview).toEqual({ ready: 12, total: 13 });
    expect(c.missingFacts).toEqual(['holder_name', 'learner_is_shareholder']);
  });

  it('is unchanged by a missing or low-confidence category (D73)', () => {
    expect(conceptCoverage({ ...complete(), business_category: null }, 'company')).toEqual(
      conceptCoverage(complete(), 'company'),
    );
  });

  it('keeps KYC policy concepts ready when every business fact is blank (D74)', () => {
    const facts = { ...complete(), products_services: null, main_clients: '  ' };
    for (const key of ['internet_banking_control', 'otp_control', 'answer_consistency']) {
      expect(resolveConcept(concept(key), facts, 'company').status).toBe('policy');
    }
  });

  it('names a blank fact and every concept that needs it', () => {
    const c = conceptCoverage({ ...complete(), products_services: '' }, 'company');
    expect(c.missingFacts).toEqual(['products_services']);
    expect(c.concepts.filter((x) => x.status === 'missing').map((x) => x.key)).toEqual([
      'products_services',
    ]);
    expect(c.mcq).toEqual({ ready: 28, total: 29 });
    expect(c.interview).toEqual({ ready: 11, total: 12 });
  });

  it('needs the address resolved to the subdistrict', () => {
    const facts = { ...complete(), address: { ...resolvedAddress, status: 'partial' as const } };
    expect(resolveConcept(concept('registered_location'), facts, 'company')).toEqual({
      key: 'registered_location',
      status: 'missing',
      missing: ['address'],
    });
  });

  it('needs the status fact behind an alternate wording', () => {
    const c = conceptCoverage({ ...complete(), has_existing_customers: null }, 'company');
    expect(c.missingFacts).toEqual(['has_existing_customers']);
    expect(c.concepts.filter((x) => x.status === 'missing').map((x) => x.key)).toEqual([
      'main_clients',
      'client_origin',
      'customer_examples',
      'customer_profile',
    ]);
  });

  it('treats a stated "no" as present', () => {
    const facts = { ...complete(), has_existing_customers: false };
    expect(resolveConcept(concept('customer_examples'), facts, 'company').status).toBe('resolved');
  });

  it('needs an amount when the learner holds shares, and none when they do not', () => {
    const noAmount = { ...complete(), my_shares: null, my_share_percent: null };
    expect(resolveConcept(concept('learner_shareholding'), noAmount, 'assignment')).toEqual({
      key: 'learner_shareholding',
      status: 'missing',
      missing: ['shareholders'],
    });
    const outsider = { ...noAmount, learner_is_shareholder: false };
    expect(resolveConcept(concept('learner_shareholding'), outsider, 'assignment').status).toBe(
      'resolved',
    );
  });
});
