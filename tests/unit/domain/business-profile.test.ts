import { describe, expect, it } from 'vitest';
import {
  COMPANY_STATUS_FACTS,
  EMPTY_INTERVIEW_PROFILE,
  LEGACY_INTERVIEW_FIELDS,
  interviewProfileSchema,
  isShareholder,
} from '@/lib/domain/bank-interview';
import { EMPTY_BUSINESS_PROFILE } from '@/lib/domain/dbd-profile';

describe('the expanded business profile (spec §5.4)', () => {
  it('has every field the registry needs, empty by default', () => {
    for (const field of [
      'business_purpose',
      'main_clients',
      'client_origin',
      'main_suppliers',
      'monthly_revenue',
      'revenue_basis',
      'average_transaction',
      'monthly_transactions',
      'first_incoming_funds',
      'promptpay_qr_purpose',
      'customer_examples',
      'customer_profile',
      'transaction_details',
    ] as const) {
      expect(EMPTY_INTERVIEW_PROFILE[field]).toBeNull();
    }
    expect(interviewProfileSchema.parse({ main_clients: '   ' }).main_clients).toBeNull();
  });

  it('takes status facts as yes or no, blank as unset, and refuses anything else', () => {
    expect(COMPANY_STATUS_FACTS).toEqual([
      'operations_started',
      'has_existing_customers',
      'has_completed_transactions',
      'has_regular_suppliers',
    ]);
    const p = interviewProfileSchema.parse({
      operations_started: 'yes',
      has_existing_customers: '',
    });
    expect(p.operations_started).toBe('yes');
    expect(p.has_existing_customers).toBeNull();
    expect(interviewProfileSchema.safeParse({ operations_started: 'maybe' }).success).toBe(false);
  });

  it('keeps the earlier answers exactly as written', () => {
    expect(LEGACY_INTERVIEW_FIELDS).toEqual([
      'monthly_volume',
      'clients_location',
      'suppliers_location',
      'operations_status',
    ]);
    expect(interviewProfileSchema.parse({ monthly_volume: 'ประมาณ 1 ล้าน' }).monthly_volume).toBe(
      'ประมาณ 1 ล้าน',
    );
  });
});

describe('isShareholder', () => {
  const business = {
    ...EMPTY_BUSINESS_PROFILE,
    shareholders: [
      { name: 'นางสาว กุลธิดา พลเยี่ยม', nationality: null, shares: 90, percent: null },
    ],
  };

  it('matches the role name against the list, ignoring spaces', () => {
    expect(isShareholder(business, 'นางสาวกุลธิดา พลเยี่ยม')).toBe(true);
    expect(isShareholder(business, 'นายสมชาย ใจดี')).toBe(false);
  });

  it('does not know without a name or a shareholder list', () => {
    expect(isShareholder(business, null)).toBeNull();
    expect(isShareholder(EMPTY_BUSINESS_PROFILE, 'นายสมชาย ใจดี')).toBeNull();
  });
});
