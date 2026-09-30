import { describe, expect, it } from 'vitest';
import { EMPTY_INTERVIEW_PROFILE } from '@/lib/domain/bank-interview';
import { EMPTY_BUSINESS_PROFILE } from '@/lib/domain/dbd-profile';
import { STATUS_FACTS, buildFactSheet } from '@/lib/domain/facts/fact-sheet';

const record = {
  company_name_th: 'บริษัท ซินเนอร์จี แล็บ จำกัด',
  company_name_en: 'SYNERGY LAB CO., LTD.',
  juristic_id: '0455569000808',
  registered_on: '2026-04-16',
  registered_capital: 2_000_000,
  directors: [{ name_th: 'นางสาวกุลธิดา พลเยี่ยม', name_en: null }],
  signing_authority: 'กรรมการหนึ่งคนลงลายมือชื่อและประทับตราสำคัญของบริษัท',
};
const structured = {
  business: {
    ...EMPTY_BUSINESS_PROFILE,
    shareholders: [
      { name: 'นางสาวกุลธิดา พลเยี่ยม', nationality: null, shares: 18_000, percent: null },
      { name: 'นายสมชาย ใจดี', nationality: null, shares: 2_000, percent: null },
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
    nature_of_business: 'ค้าส่งและค้าปลีกเสื้อผ้า',
    has_existing_customers: 'no' as const,
    operations_started: 'yes' as const,
  },
  category: {
    key: 'clothing_fashion',
    candidate_key: null,
    confidence: 0.95,
    source: 'auto' as const,
    status: 'mapped' as const,
    model: null,
    input_hash: 'h',
    error: null,
    decided_at: null,
  },
};

describe('buildFactSheet (spec §7.2)', () => {
  it('lists the five status facts', () => {
    expect(STATUS_FACTS).toEqual([
      'operations_started',
      'has_existing_customers',
      'has_completed_transactions',
      'has_regular_suppliers',
      'learner_is_shareholder',
    ]);
  });

  it('builds the company facts, status facts as booleans, and the derived counts', () => {
    const f = buildFactSheet({ record, structured, address: null, role: null });
    expect(f).toMatchObject({
      company_name_th: 'บริษัท ซินเนอร์จี แล็บ จำกัด',
      juristic_id: '0455569000808',
      director_count: 1,
      shareholder_count: 2,
      operations_started: true,
      has_existing_customers: false,
      has_completed_transactions: null,
      business_category: 'clothing_fashion',
      learner_is_shareholder: null,
      holder_name: null,
    });
  });

  it('adds the learner: shareholder or not, and their shares', () => {
    const holder = buildFactSheet({
      record,
      structured,
      address: null,
      role: {
        holder_name: 'นางสาวกุลธิดา พลเยี่ยม',
        position: 'กรรมการ',
        responsibilities: null,
        relationship_to_shareholders: null,
      },
    });
    expect(holder).toMatchObject({
      learner_is_shareholder: true,
      my_shares: 18_000,
      my_share_percent: 90,
    });
    const outsider = buildFactSheet({
      record,
      structured,
      address: null,
      role: {
        holder_name: 'นายภายนอก',
        position: null,
        responsibilities: null,
        relationship_to_shareholders: null,
      },
    });
    expect(outsider).toMatchObject({ learner_is_shareholder: false, my_shares: null });
  });

  it('uses a category only once it is mapped', () => {
    const f = buildFactSheet({
      record,
      structured: {
        ...structured,
        category: { ...structured.category, status: 'needs_review' as const, key: null },
      },
      address: null,
      role: null,
    });
    expect(f.business_category).toBeNull();
  });
});
