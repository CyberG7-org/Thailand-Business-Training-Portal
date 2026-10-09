import { describe, expect, it } from 'vitest';
import { buildPlan, buildReadinessPlan } from '@/lib/domain/interview/plan';
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

  it('does not end a v2 readiness interview early after evasive or pasted answers', async () => {
    const officer = new FakeInterview();
    const plan = buildReadinessPlan({
      ...facts,
      head_office_address: 'กรุงเทพมหานคร',
      directors: 'นางสาว กรรมการ ตัวอย่าง',
      signing_authority: 'กรรมการหนึ่งคนลงนาม',
      my_name: 'นางสาว ผู้เรียน ตัวอย่าง',
      my_position: 'กรรมการ',
      registered_on: '13 กรกฎาคม 2569',
      account_purpose: 'รับเงินลูกค้า',
      customer_profile: 'ลูกค้าในประเทศไทย',
      transaction_details: 'รับเงินด้วยการโอนและ QR',
    });
    const evasive = await officer.turn({
      ...base,
      plan,
      learnerMessage: 'ไม่ทราบ',
      evasions: 2,
    });
    expect(evasive.next).toEqual({ concept: 'company_name' });
    const pasted = await officer.turn({
      ...base,
      plan,
      learnerMessage: 'คัดลอกคำตอบ',
      pastedDetected: true,
      evasions: 4,
    });
    expect(pasted.next).toEqual({ concept: 'company_name' });
  });

  it('accepts the loose v3 rubric and emits only correct or wrong evaluations', async () => {
    const officer = new FakeInterview();
    const readinessFacts = {
      ...facts,
      company_name_th: 'บริษัท ลัคกี้ชิป ฟู้ด จำกัด',
      juristic_id: '0105569000134',
      head_office_address: 'เลขที่ 99/9 ถนนสุขุมวิท แขวงคลองตัน เขตวัฒนา กรุงเทพมหานคร',
      nature_of_business: 'จำหน่ายอาหารและขนมขบเคี้ยวทางออนไลน์',
      products_services: 'มันฝรั่งทอด ขนม และเครื่องดื่ม',
      directors: 'นางสาว ตัวอย่าง ทดสอบ',
      signing_authority: 'กรรมการหนึ่งคนลงลายมือชื่อและประทับตราสำคัญของบริษัท',
      my_name: 'นางสาว ตัวอย่าง ทดสอบ',
      my_position: 'กรรมการ',
      registered_on: '10 เมษายน 2569',
      account_purpose: 'รับเงินจากลูกค้าและจ่ายค่าใช้จ่ายของกิจการ',
      customer_profile: 'ลูกค้าธุรกิจและลูกค้าบุคคลทั่วไปในประเทศไทย',
      client_origin: 'Facebook, TikTok, เว็บไซต์, การแนะนำจากลูกค้าเดิม และลูกค้าที่เข้ามาที่ร้าน',
      monthly_revenue: 'ประมาณ 641,400 บาท',
      monthly_transactions: 'ประมาณ 30 รายการต่อเดือน',
      average_transaction: 'ประมาณ 21,380 บาท',
    };
    const plan = buildReadinessPlan(readinessFacts);
    const answer = async (concept: string, learnerMessage: string) => {
      const cursor = plan.items.findIndex((item) => item.concept === concept);
      const turn = await officer.turn({
        ...base,
        facts: readinessFacts,
        plan: { ...plan, cursor },
        learnerMessage,
      });
      return turn.assessment?.verdict;
    };

    expect(await answer('company_name', 'บริษัทลัคกี้ชิปฟู้ดจำกัด')).toBe('correct');
    expect(await answer('registration_number', '010-5569-00013-4')).toBe('correct');
    expect(await answer('registered_address', 'วัฒนา กรุงเทพมหานคร')).toBe('correct');
    expect(await answer('actual_business', 'ขายขนมออนไลน์')).toBe('correct');
    expect(await answer('products_services', 'ขายมันฝรั่งทอด')).toBe('correct');
    expect(await answer('authorized_representative', 'กรรมการหนึ่งคนลงนามพร้อมตราบริษัท')).toBe(
      'correct',
    );
    expect(await answer('attendee_identity', 'ตัวอย่าง ทดสอบ เป็นกรรมการ')).toBe('correct');
    expect(await answer('registration_date', '10 เมษายน 2026')).toBe('correct');
    expect(await answer('account_purpose', 'รับเงินลูกค้าและจ่ายค่าใช้จ่ายบริษัท')).toBe('correct');
    expect(await answer('customer_origin', 'ลูกค้าบุคคลทั่วไปจาก Facebook')).toBe('correct');
    expect(await answer('customer_origin', 'Facebook')).toBe('wrong');
    expect(await answer('monthly_revenue', 'ประมาณ 600,000 บาท')).toBe('correct');
    expect(await answer('monthly_transactions', 'ประมาณ 27 รายการ')).toBe('correct');
    expect(await answer('average_transaction', 'ประมาณ 20,000 บาท')).toBe('correct');

    expect(await answer('registration_number', '0105569000999')).toBe('wrong');
    expect(await answer('monthly_revenue', '100,000 บาท')).toBe('wrong');
    expect(await answer('company_name', 'ไม่ทราบ')).toBe('wrong');
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
