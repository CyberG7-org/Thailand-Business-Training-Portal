import { describe, expect, it } from 'vitest';
import { buildPlan } from '@/lib/domain/interview/plan';
import { FakeInterview } from '@/lib/integrations/interview/fake';

const facts = {
  company_name_th: 'บริษัท ทดสอบ จำกัด',
  juristic_id: '0105568233704',
  nature_of_business: 'ทดสอบระบบ',
  products_services: 'สินค้าทดสอบ',
};
const base = { facts, transcript: [], pastedDetected: false, evasions: 0 };

describe('FakeInterview', () => {
  it('opens with a greeting and the first question, in Thai', async () => {
    const officer = new FakeInterview();
    const plan = buildPlan(facts);
    const turn = await officer.turn({ ...base, plan, learnerMessage: null });
    expect(turn.assessment).toBeNull();
    expect(turn.say).toMatch(/สวัสดี/);
    expect(turn.say).toContain(plan.items[0].question);
    expect(turn.next).toEqual({ concept: 'company_name' });
  });

  it('marks an answer containing the expected value correct and moves on', async () => {
    const officer = new FakeInterview();
    const plan = buildPlan(facts);
    const turn = await officer.turn({ ...base, plan, learnerMessage: 'บริษัท ทดสอบ จำกัด ครับ' });
    expect(turn.assessment).toEqual({
      concept: 'company_name',
      verdict: 'correct',
      note: expect.any(String),
    });
    expect(turn.next).toEqual({ concept: 'juristic_id' });
    expect(turn.say).not.toContain('0105568233704');
  });

  it('grades an amount with the Owner’s tolerance: within 20%, or inside the range (D101)', async () => {
    const officer = new FakeInterview();
    const money = { ...facts, monthly_volume: 'ประมาณ 641,400 บาท' };
    const plan = buildPlan(money);
    const cursor = plan.items.findIndex((i) => i.concept === 'monthly_volume');
    expect(cursor).toBeGreaterThan(0);
    const at = { ...plan, cursor };
    const near = await officer.turn({
      ...base,
      facts: money,
      plan: at,
      learnerMessage: 'ประมาณ 700,000 บาทครับ',
    });
    expect(near.assessment?.verdict).toBe('correct');
    const far = await officer.turn({
      ...base,
      facts: money,
      plan: at,
      learnerMessage: 'ประมาณ 900,000 บาทครับ',
    });
    expect(far.assessment?.verdict).toBe('wrong');

    const ranged = { ...facts, monthly_volume: 'ระหว่าง 11,500 ถึง 53,000 บาท' };
    const rangedPlan = { ...buildPlan(ranged), cursor };
    const inside = await officer.turn({
      ...base,
      facts: ranged,
      plan: rangedPlan,
      learnerMessage: '20,000 บาท',
    });
    expect(inside.assessment?.verdict).toBe('correct');
    const outside = await officer.turn({
      ...base,
      facts: ranged,
      plan: rangedPlan,
      learnerMessage: '60,000 บาท',
    });
    expect(outside.assessment?.verdict).toBe('wrong');

    // An ID number is not an amount: one digit off is wrong, not close enough.
    const id = { ...plan, cursor: plan.items.findIndex((i) => i.concept === 'juristic_id') };
    const off = await officer.turn({ ...base, plan: id, learnerMessage: '0105568233705' });
    expect(off.assessment?.verdict).toBe('wrong');
  });

  it('marks "ไม่ทราบ" evasive, asks again once, then moves on', async () => {
    const officer = new FakeInterview();
    const plan = buildPlan(facts);
    const first = await officer.turn({ ...base, plan, learnerMessage: 'ไม่ทราบ' });
    expect(first.assessment?.verdict).toBe('evasive');
    expect(first.next).toEqual({ concept: 'company_name' });
    const again = {
      ...plan,
      items: plan.items.map((i, n) => (n === 0 ? { ...i, attempts: 1 } : i)),
    };
    const second = await officer.turn({
      ...base,
      plan: again,
      learnerMessage: 'ไม่ทราบ',
      evasions: 1,
    });
    expect(second.assessment?.verdict).toBe('evasive');
    expect(second.next).toEqual({ concept: 'juristic_id' });
  });

  it('closes on the third evasion and at the end of the plan', async () => {
    const officer = new FakeInterview();
    const plan = buildPlan(facts);
    const closed = await officer.turn({ ...base, plan, learnerMessage: 'ไม่ทราบ', evasions: 2 });
    expect(closed.next).toEqual({ close: 'too_many_evasions' });
    const last = { ...plan, cursor: plan.items.length - 1 };
    const done = await officer.turn({ ...base, plan: last, learnerMessage: 'สินค้าทดสอบ ครับ' });
    expect(done.assessment?.verdict).toBe('correct');
    expect(done.next).toEqual({ close: 'plan_complete' });
  });

  it('marks a wrong answer, asks once more, and never says the fact', async () => {
    const officer = new FakeInterview();
    const plan = buildPlan(facts);
    const turn = await officer.turn({ ...base, plan, learnerMessage: 'บริษัท อื่น จำกัด ครับ' });
    expect(turn.assessment?.verdict).toBe('wrong');
    expect(turn.next).toEqual({ concept: 'company_name' });
    expect(turn.say).not.toContain('บริษัท ทดสอบ จำกัด');
  });

  it('asks for a pasted answer in the learner’s own words', async () => {
    const officer = new FakeInterview();
    const plan = buildPlan(facts);
    const turn = await officer.turn({
      ...base,
      plan,
      learnerMessage: 'ชื่อ: x\nเลข: y\nทุน: z',
      pastedDetected: true,
    });
    expect(turn.assessment?.verdict).toBe('pasted');
    expect(turn.say).toContain('คำพูดของคุณเอง');
  });

  it('writes a Thai narrative that names the weak concepts', async () => {
    const officer = new FakeInterview();
    const text = await officer.narrate({
      facts,
      transcript: [],
      verdict: {
        verdict: 'not_ready',
        reasons: [{ concept: 'juristic_id', verdict: 'wrong', note: 'x', cardKey: null }],
      },
    });
    expect(text).toContain('juristic_id');
    expect(text).toMatch(/ธนาคาร/);
  });
});
