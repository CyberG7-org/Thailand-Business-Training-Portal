import { describe, expect, it } from 'vitest';
import { BANK_INTERVIEW_CARDS } from '@/lib/content/bank-interview-cards';
import {
  advance,
  buildPlan,
  buildReadinessPlan,
  currentItem,
  nextReadinessStep,
  probingItems,
  READINESS_ITEMS,
} from '@/lib/domain/interview/plan';
import type { Assessment, FactSheet } from '@/lib/domain/interview/types';

const facts: FactSheet = {
  company_name_th: 'บริษัท ธาราวาณิช จำกัด',
  company_name_en: 'THARA VANICH CO., LTD.',
  juristic_id: '0105568233704',
  head_office_address: null,
  directors: null,
  directors_count: null,
  registered_on: '13 กรกฎาคม 2569',
  nature_of_business: 'ค้าปลีกสินค้าเกษตร',
  products_services: 'ข้าวสาร',
  account_purpose: 'รับชำระค่าสินค้าจากลูกค้า',
  my_position: 'กรรมการผู้จัดการ',
};

describe('buildPlan', () => {
  it('asks only what the record can verify, identity first, the registration number second', () => {
    const plan = buildPlan(facts);
    const ids = plan.items.map((i) => i.concept);
    expect(ids.slice(0, 3)).toEqual(['company_name', 'juristic_id', 'incorporation_date']);
    expect(ids).not.toContain('registered_address');
    expect(ids).not.toContain('directors_count');
    expect(ids).toContain('business_activity');
    expect(plan.cursor).toBe(0);
    expect(plan.items.every((i) => i.phase === 'facts' && i.attempts === 0)).toBe(true);
  });

  it('marks the core concepts and carries the expected values', () => {
    const plan = buildPlan(facts);
    const name = plan.items.find((i) => i.concept === 'company_name')!;
    expect(name.core).toBe(true);
    expect(name.expected).toContain('บริษัท ธาราวาณิช จำกัด');
    expect(name.question.length).toBeGreaterThan(0);
    const purpose = plan.items.find((i) => i.concept === 'account_purpose')!;
    expect(purpose.core).toBe(false);
  });

  it('skips a concept the record cannot verify, so every item carries a value', () => {
    const plan = buildPlan({ ...facts, source_of_funds: null, operations_status: null });
    expect(plan.items.every((i) => i.expected.length > 0)).toBe(true);
    expect(plan.items.map((i) => i.concept)).not.toContain('source_of_funds');
  });
});

describe('buildReadinessPlan v2', () => {
  it('freezes the 11 simple questions and the 9-of-11 threshold', () => {
    const plan = buildReadinessPlan({
      ...facts,
      head_office_address: 'กรุงเทพมหานคร',
      directors: 'นางสาว กรรมการ ตัวอย่าง',
      signing_authority: 'กรรมการหนึ่งคนลงนาม',
      my_name: 'นางสาว ผู้เรียน ตัวอย่าง',
      customer_profile: 'ธุรกิจและบุคคลทั่วไปในประเทศไทย',
      transaction_details: 'รับเงินลูกค้าผ่านการโอนและ QR และจ่ายซัพพลายเออร์',
    });
    expect(plan).toMatchObject({ version: 2, passScore: 9, cursor: 0 });
    expect(plan.items.map((item) => item.concept)).toEqual([
      'company_name',
      'registration_number',
      'registered_address',
      'actual_business',
      'products_services',
      'authorized_representative',
      'attendee_identity',
      'registration_date',
      'account_purpose',
      'customer_profile',
      'transaction_details',
    ]);
    expect(plan.items).toHaveLength(11);
    expect(plan.items.every((item) => item.core === false)).toBe(true);
    expect(plan.items.every((item) => item.question.length > 8)).toBe(true);
  });

  it('has a readable label in every language and an explicit study card for every question', () => {
    const realCardKeys = new Set(BANK_INTERVIEW_CARDS.map((card) => card.contentKey));
    expect(READINESS_ITEMS).toHaveLength(11);
    for (const item of READINESS_ITEMS) {
      expect(item.question.th).not.toBe(item.concept);
      expect(item.question.en).not.toBe(item.concept);
      expect(item.question.zh).not.toBe(item.concept);
      expect(item.cardKey).toMatch(/^bank-interview-[1-5]-/);
      expect(realCardKeys.has(item.cardKey)).toBe(true);
    }
    expect(READINESS_ITEMS.find((item) => item.concept === 'account_purpose')?.cardKey).toBe(
      'bank-interview-4-role',
    );
  });

  it('owns the sequence even when the provider tries to close, jump or repeat', () => {
    const plan = buildReadinessPlan(facts);
    expect(
      nextReadinessStep(plan, { concept: 'company_name', verdict: 'correct', note: '' }),
    ).toEqual({ next: { concept: 'registration_number' }, kind: 'next' });

    const followUp = nextReadinessStep(plan, {
      concept: 'company_name',
      verdict: 'wrong',
      note: '',
    });
    expect(followUp).toEqual({ next: { concept: 'company_name' }, kind: 'follow_up' });

    const afterFollowUp = advance(plan, followUp.next);
    expect(
      nextReadinessStep(afterFollowUp, {
        concept: 'company_name',
        verdict: 'wrong',
        note: '',
      }),
    ).toEqual({ next: { concept: 'registration_number' }, kind: 'next' });

    const last = { ...plan, cursor: plan.items.length - 1 };
    expect(
      nextReadinessStep(last, {
        concept: 'transaction_details',
        verdict: 'correct',
        note: '',
      }),
    ).toEqual({ next: { close: 'plan_complete' }, kind: 'complete' });
  });
});

describe('probingItems', () => {
  it('revisits partial, wrong and evasive concepts, at most four, as probing items', () => {
    const plan = buildPlan(facts);
    const assessments: Assessment[] = [
      { concept: 'company_name', verdict: 'correct', note: '' },
      { concept: 'juristic_id', verdict: 'wrong', note: '' },
      { concept: 'business_activity', verdict: 'partial', note: '' },
      { concept: 'account_purpose', verdict: 'evasive', note: '' },
      { concept: 'my_position', verdict: 'partial', note: '' },
      { concept: 'incorporation_date', verdict: 'wrong', note: '' },
    ];
    const items = probingItems(plan, assessments);
    expect(items.length).toBe(4);
    expect(items.every((i) => i.phase === 'probing')).toBe(true);
    expect(items.map((i) => i.concept)).not.toContain('company_name');
  });
});

describe('advance', () => {
  it('moves the cursor to the named concept and counts an attempt when it stays', () => {
    const plan = buildPlan(facts);
    const same = advance(plan, { concept: 'company_name' });
    expect(same.cursor).toBe(0);
    expect(currentItem(same)!.attempts).toBe(1);
    const next = advance(same, { concept: 'juristic_id' });
    expect(next.cursor).toBe(1);
    expect(currentItem(next)!.attempts).toBe(0);
  });

  it('parks the cursor past the end on close', () => {
    const plan = buildPlan(facts);
    const closed = advance(plan, { close: 'plan_complete' });
    expect(currentItem(closed)).toBeNull();
  });

  it('prefers the probing copy of a concept at or after the cursor', () => {
    const plan = buildPlan(facts);
    const probing = { ...plan.items[1], phase: 'probing' as const, attempts: 0 };
    const withProbing = { items: [...plan.items, probing], cursor: plan.items.length - 1 };
    const moved = advance(withProbing, { concept: probing.concept });
    expect(moved.cursor).toBe(plan.items.length);
    expect(currentItem(moved)!.phase).toBe('probing');
  });
});
