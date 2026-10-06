import { describe, expect, it } from 'vitest';
import { EMPTY_INTERVIEW_PROFILE } from '@/lib/domain/bank-interview';
import { EMPTY_BUSINESS_PROFILE, type StructuredData } from '@/lib/domain/dbd-profile';
import { buildFactSheet } from '@/lib/domain/facts/fact-sheet';
import type { RegisteredAddress } from '@/lib/domain/geo/resolve';
import {
  validateFacts,
  type Finding,
  type ValidationRecord,
} from '@/lib/domain/validation/validators';

const resolved: RegisteredAddress = {
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
  postcode_source: 'geography',
  status: 'resolved',
  issues: [],
};

const record: ValidationRecord = {
  company_name_th: 'บริษัท ตรวจสอบ จำกัด',
  company_name_en: null,
  juristic_id: '0105568233704',
  registered_on: '2026-04-16',
  issued_on: '2026-08-05',
  registered_capital: 2_000_000,
  objectives_count: 3,
  directors: [{ name_th: 'นางสาวกุลธิดา พลเยี่ยม', name_en: null }],
  signing_authority: 'กรรมการหนึ่งคนลงลายมือชื่อและประทับตราสำคัญของบริษัท',
  head_office_address: resolved.full,
};

const structured: StructuredData = {
  business: {
    ...EMPTY_BUSINESS_PROFILE,
    objectives: [
      { no: 1, text: 'ค้าเสื้อผ้า' },
      { no: 2, text: 'นำเข้า' },
      { no: 3, text: 'ที่ปรึกษา' },
    ],
    shareholders: [
      { name: 'นางสาวกุลธิดา พลเยี่ยม', nationality: null, shares: 18_000, percent: 90 },
      { name: 'นายสมชาย ใจดี', nationality: null, shares: 2_000, percent: 10 },
    ],
    share_structure: {
      total_shares: 20_000,
      par_value: 100,
      paid_up_capital: null,
      share_type: null,
    },
  },
  interview: {
    ...EMPTY_INTERVIEW_PROFILE,
    contact_email: 'info@x.co.th',
    contact_phone: '02-000-0000',
    nature_of_business: 'ค้าส่งเสื้อผ้า',
    products_services: 'เสื้อผ้าสตรี',
    business_purpose: 'จำหน่ายเสื้อผ้า',
    main_clients: 'ร้านค้าปลีก',
    client_origin: 'ออนไลน์',
    main_suppliers: 'โรงงาน',
    business_address: 'ร้อยเอ็ด',
    monthly_revenue: '300,000',
    revenue_basis: 'ลูกค้า 30 ราย',
    average_transaction: '10,000',
    monthly_transactions: '30',
    source_of_funds: 'เงินออม',
    first_incoming_funds: 'ทุนจดทะเบียน',
    account_purpose: 'รับชำระ',
    promptpay_qr_purpose: 'สะดวก',
    customer_examples: 'ร้านบุษบา',
    customer_profile: 'ค้าปลีก',
    transaction_details: 'โอน',
    operations_started: 'yes',
    has_existing_customers: 'yes',
    has_completed_transactions: 'yes',
    has_regular_suppliers: 'yes',
  },
  category: {
    key: 'clothing_fashion',
    candidate_key: null,
    confidence: 0.95,
    source: 'auto',
    status: 'mapped',
    model: null,
    input_hash: 'h',
    error: null,
    decided_at: null,
  },
  provenance: {},
  address: resolved,
};

const thresholds = { autoAcceptPercent: 95, reviewPercent: 75 };
const TODAY = '2026-10-01';

function run(patch: {
  record?: Partial<typeof record>;
  structured?: Partial<StructuredData>;
  address?: RegisteredAddress;
}): Finding[] {
  const r = { ...record, ...patch.record };
  const s = { ...structured, ...patch.structured };
  const a = patch.address ?? resolved;
  return validateFacts({
    record: r,
    structured: s,
    address: a,
    facts: buildFactSheet({ record: r, structured: s, address: a, role: null }),
    thresholds,
    today: TODAY,
  });
}
const keys = (f: Finding[]) => f.map((x) => `${x.kind}:${x.field}:${x.blocks}`).sort();

describe('validateFacts (spec §5.5)', () => {
  it('finds nothing wrong with a clean, complete record', () => {
    expect(run({})).toEqual([]);
  });

  it('refuses a bad check digit and dates out of order or in the future', () => {
    expect(keys(run({ record: { juristic_id: '0105568233705' } }))).toEqual([
      'invalid:juristic_id:acceptance',
    ]);
    expect(keys(run({ record: { issued_on: '2026-04-01' } }))).toEqual([
      'invalid:issued_on:acceptance',
    ]);
    expect(keys(run({ record: { issued_on: '2027-01-01' } }))).toEqual([
      'invalid:issued_on:acceptance',
    ]);
  });

  it('reconciles shares, percents and capital; a short list is only a note', () => {
    const over = run({
      structured: {
        business: {
          ...structured.business!,
          shareholders: [
            { name: 'ก', nationality: null, shares: 15_000, percent: 60 },
            { name: 'ข', nationality: null, shares: 15_000, percent: 60 },
          ],
        },
      },
    });
    expect(keys(over)).toEqual([
      'conflict:shareholders.percent:acceptance',
      'conflict:shareholders.shares:acceptance',
    ]);
    const under = run({
      structured: {
        business: {
          ...structured.business!,
          shareholders: [{ name: 'ก', nationality: null, shares: 15_000, percent: 75 }],
        },
      },
    });
    expect(keys(under)).toEqual([
      'conflict:shareholders.percent:none',
      'conflict:shareholders.shares:none',
    ]);
    expect(keys(run({ record: { registered_capital: 1_500_000 } }))).toEqual([
      'conflict:registered_capital:acceptance',
    ]);
    expect(run({ record: { registered_capital: 1_500_000 } })[0]!.detail).toMatchObject({
      expected: 2_000_000,
      actual: 1_500_000,
    });
  });

  it('notes an objectives count that differs from the list, and a signer who is no director', () => {
    expect(keys(run({ record: { objectives_count: 14 } }))).toEqual([
      'conflict:objectives_count:none',
    ]);
    expect(
      keys(run({ record: { signing_authority: 'นายสมชาย ใจดี ลงลายมือชื่อและประทับตรา' } })),
    ).toEqual(['conflict:signing_authority:none']);
    expect(run({ record: { signing_authority: 'นางสาวกุลธิดา พลเยี่ยม ลงลายมือชื่อ' } })).toEqual(
      [],
    );
  });

  it('blocks acceptance on an address that does not resolve, and the version on a missing one', () => {
    const partial = {
      ...resolved,
      status: 'partial' as const,
      issues: ['district_not_found' as const],
    };
    expect(keys(run({ address: partial }))).toEqual([
      'geo_mismatch:head_office_address:acceptance',
    ]);
    const none: RegisteredAddress = {
      ...resolved,
      full: '',
      house_no: null,
      moo: null,
      subdistrict: null,
      district: null,
      province: null,
      postcode: null,
      province_id: null,
      district_id: null,
      subdistrict_id: null,
      postcode_source: null,
      status: 'unresolved',
      issues: ['no_address'],
    };
    expect(keys(run({ record: { head_office_address: null }, address: none }))).toEqual([
      'missing:address:version',
    ]);
  });

  it('tiers missing facts: the certificate facts and the two answers block acceptance, the rest the version', () => {
    const f = run({
      record: { juristic_id: null, issued_on: null },
      structured: {
        interview: {
          ...structured.interview!,
          contact_phone: null,
          products_services: null,
          monthly_revenue: null,
          // A company status is never asked for (D91).
          has_existing_customers: null,
        },
      },
    });
    // The learner's phone is the learner's (D80), never the record's to owe (D101).
    expect(keys(f)).toEqual([
      'missing:issued_on:version',
      'missing:juristic_id:acceptance',
      'missing:monthly_revenue:version',
      'missing:products_services:acceptance',
    ]);
    expect(f.find((x) => x.field === 'monthly_revenue')!.detail).toMatchObject({
      concepts: ['monthly_revenue'],
    });
  });

  it('reports a missing source once, not the standard answers worked out from it (D91)', () => {
    const missing = (interview: Partial<NonNullable<StructuredData['interview']>>) =>
      keys(run({ structured: { interview: { ...structured.interview!, ...interview } } })).filter(
        (k) => k.startsWith('missing:'),
      );
    // An amount: not transactions per month or the basis of the revenue figure as well.
    expect(missing({ monthly_revenue: null })).toEqual(['missing:monthly_revenue:version']);
    // The kind of customers is fixed for every company (D101): never missing.
    expect(missing({ customer_profile: null })).toEqual([]);
    // What the business does: not the purpose built from it.
    expect(missing({ nature_of_business: null })).toEqual([
      'missing:nature_of_business:acceptance',
    ]);
  });

  it('reports transactions per month when the amounts are there but not in digits', () => {
    const f = run({
      structured: { interview: { ...structured.interview!, monthly_revenue: 'สามแสนบาท' } },
    });
    expect(keys(f)).toEqual(['missing:monthly_transactions:version']);
    expect(f[0].detail).toMatchObject({ concepts: ['monthly_transactions'] });
  });

  it('weighs extraction confidence on the fields the sheet reads: silent, review, or a person', () => {
    const f = run({
      structured: {
        provenance: {
          juristic_id: { confidence: 0.98, source_page: 1, source_document: 1 },
          registered_capital: { confidence: 0.9, source_page: 1, source_document: 1 },
          directors: { confidence: 0.6, source_page: 1, source_document: 1 },
          registrar_name: { confidence: 0.1, source_page: 1, source_document: 1 },
        },
      },
    });
    expect(keys(f)).toEqual([
      'low_confidence:directors:acceptance',
      'low_confidence:registered_capital:none',
    ]);
    expect(f.find((x) => x.field === 'directors')!.detail).toMatchObject({
      confidence: 0.6,
      signature: 'directors:0.6',
    });
  });

  it('flags a business with no category for a person, never blocking', () => {
    const f = run({
      structured: {
        category: {
          ...structured.category!,
          status: 'unmapped',
          key: null,
          candidate_key: null,
          confidence: null,
          error: 'provider',
        },
      },
    });
    expect(keys(f)).toEqual(['category_review:business_category:none']);
    expect(run({ structured: { category: null } })).toEqual([]);
  });
});
