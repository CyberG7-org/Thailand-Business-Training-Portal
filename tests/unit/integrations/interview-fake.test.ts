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
