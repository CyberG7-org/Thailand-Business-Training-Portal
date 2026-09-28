import { describe, expect, it } from 'vitest';
import { buildPlan } from '@/lib/domain/interview/plan';
import type { Assessment, FactSheet } from '@/lib/domain/interview/types';
import { decideVerdict } from '@/lib/domain/interview/verdict';

const facts: FactSheet = {
  company_name_th: 'บริษัท ธาราวาณิช จำกัด',
  juristic_id: '0105568233704',
  head_office_address: 'เลขที่ 35/9 แขวงสายไหม กรุงเทพมหานคร',
  directors: 'นางสาวพัชรณัฏฐ์ จิรเมธวัชร',
  directors_count: '1',
  nature_of_business: 'ค้าปลีกสินค้าเกษตร',
  products_services: 'ข้าวสาร',
  account_purpose: 'รับชำระค่าสินค้า',
};
const plan = buildPlan(facts);
const good: Assessment[] = [
  { concept: 'company_name', verdict: 'correct', note: '' },
  { concept: 'juristic_id', verdict: 'correct', note: '' },
  { concept: 'registered_address', verdict: 'correct', note: '' },
  { concept: 'directors_count', verdict: 'correct', note: '' },
  { concept: 'business_activity', verdict: 'partial', note: '' },
  { concept: 'account_purpose', verdict: 'correct', note: '' },
];

describe('decideVerdict', () => {
  it('is ready when the core facts are right, the business is coherent and the plan was completed', () => {
    const v = decideVerdict(plan, good, 'plan_complete');
    expect(v.verdict).toBe('ready');
    expect(v.reasons.filter((r) => r.verdict !== 'correct').map((r) => r.concept)).toEqual([
      'business_activity',
    ]);
  });

  it('is not ready when a core fact ended wrong, and names the card to revisit', () => {
    const v = decideVerdict(
      plan,
      good.map((a) => (a.concept === 'juristic_id' ? { ...a, verdict: 'wrong' as const } : a)),
      'plan_complete',
    );
    expect(v.verdict).toBe('not_ready');
    const reason = v.reasons.find((r) => r.concept === 'juristic_id')!;
    expect(reason.verdict).toBe('wrong');
    expect(reason.cardKey).toBe('bank-interview-1-identity');
  });

  it('lets a later correct answer override an earlier partial one', () => {
    const v = decideVerdict(
      plan,
      [{ concept: 'juristic_id', verdict: 'partial', note: '' }, ...good],
      'plan_complete',
    );
    expect(v.verdict).toBe('ready');
  });

  it('tolerates one evasion but not two', () => {
    const one = [...good, { concept: 'account_purpose', verdict: 'evasive' as const, note: '' }];
    expect(decideVerdict(plan, one, 'plan_complete').verdict).toBe('ready');
    const two = [...one, { concept: 'business_activity', verdict: 'evasive' as const, note: '' }];
    expect(decideVerdict(plan, two, 'plan_complete').verdict).toBe('not_ready');
  });

  it('is not ready when the learner ended early or the officer gave up', () => {
    expect(decideVerdict(plan, good, 'learner_ended').verdict).toBe('not_ready');
    expect(decideVerdict(plan, good, 'too_many_evasions').verdict).toBe('not_ready');
  });

  it('lists only the concepts the officer judged', () => {
    const v = decideVerdict(plan, good.slice(0, 2), 'too_many_evasions');
    expect(v.reasons.map((r) => r.concept)).toEqual(['company_name', 'juristic_id']);
  });

  it('does not require a core fact the record cannot verify', () => {
    // Review Focus 1: no address and no directors on the record.
    const thin = buildPlan({
      company_name_th: 'บริษัท ทดสอบ จำกัด',
      juristic_id: '0105568233704',
      nature_of_business: 'ทดสอบระบบ',
      products_services: 'สินค้าทดสอบ',
    });
    const v = decideVerdict(
      thin,
      [
        { concept: 'company_name', verdict: 'correct', note: '' },
        { concept: 'juristic_id', verdict: 'correct', note: '' },
        { concept: 'business_activity', verdict: 'partial', note: '' },
      ],
      'plan_complete',
    );
    expect(v.verdict).toBe('ready');
  });
});
