import { describe, expect, it } from 'vitest';
import { buildPlan, buildReadinessPlan } from '@/lib/domain/interview/plan';
import { ClaudeInterview } from '@/lib/integrations/interview/claude';

const facts = {
  company_name_th: 'บริษัท ทดสอบ จำกัด',
  juristic_id: '0105568233704',
  products_services: 'สินค้าทดสอบ',
};
const base = { facts, transcript: [], learnerMessage: null, pastedDetected: false, evasions: 0 };

/** A client that records the request and answers with a fixed parsed output. */
function stub(parsed: unknown) {
  const calls: unknown[] = [];
  const client = {
    messages: {
      stream: (params: unknown) => {
        calls.push(params);
        return {
          finalMessage: async () => ({
            stop_reason: 'end_turn',
            parsed_output: parsed,
            content: [{ type: 'text', text: 'สรุปผล' }],
          }),
        };
      },
    },
  };
  return { client: client as never, calls };
}

type Params = {
  model: string;
  system: { text: string; cache_control?: unknown }[];
  messages: { role: string; content: string }[];
  output_config: unknown;
};

describe('ClaudeInterview', () => {
  it('sends the fact sheet in a cached system block and forces the officer_turn shape', async () => {
    const { client, calls } = stub({
      say: 'สวัสดีค่ะ บริษัทชื่ออะไรคะ',
      assessment: null,
      next: { concept: 'company_name' },
    });
    const officer = new ClaudeInterview(client);
    const turn = await officer.turn({ ...base, plan: buildPlan(facts) });
    expect(turn.next).toEqual({ concept: 'company_name' });
    const params = calls[0] as Params;
    expect(params.model).toBe('claude-sonnet-5');
    expect(params.system.some((b) => b.text.includes('0105568233704') && b.cache_control)).toBe(
      true,
    );
    expect(params.output_config).toBeDefined();
    expect(params.messages.at(-1)?.role).toBe('user');
  });

  it('tells the officer the Owner’s tolerance for an amount (D101)', async () => {
    const { client, calls } = stub({
      say: 'สวัสดีค่ะ',
      assessment: null,
      next: { concept: 'company_name' },
    });
    await new ClaudeInterview(client).turn({ ...base, plan: buildPlan(facts) });
    const params = calls[0] as Params;
    expect(params.system[0].text).toContain('20%');
  });

  it('sends the current v3 binary rubric to the officer', async () => {
    const { client, calls } = stub({
      say: 'รับทราบค่ะ',
      assessment: { concept: 'registered_address', verdict: 'partial', note: 'บางส่วน' },
      next: { concept: 'actual_business' },
    });
    const plan = buildReadinessPlan({
      ...facts,
      head_office_address: 'เขตวัฒนา กรุงเทพมหานคร',
    });
    await new ClaudeInterview(client).turn({
      ...base,
      plan: { ...plan, cursor: 2 },
      learnerMessage: 'วัฒนา กรุงเทพมหานคร',
    });
    const params = calls[0] as Params;
    expect(params.system[0].text).toContain('correct หรือ wrong เท่านั้น');
    expect(params.messages.at(-1)?.content).toContain('จังหวัดและส่วนสำคัญอีกหนึ่งส่วน');
  });

  it('keeps the messages alternating: the transcript, then the answer with the state', async () => {
    const { client, calls } = stub({
      say: 'รับทราบค่ะ',
      assessment: { concept: 'company_name', verdict: 'correct', note: 'ตรง' },
      next: { concept: 'juristic_id' },
    });
    await new ClaudeInterview(client).turn({
      ...base,
      plan: buildPlan(facts),
      transcript: [{ role: 'officer', content: 'บริษัทชื่ออะไรคะ' }],
      learnerMessage: 'บริษัท ทดสอบ จำกัด',
    });
    const params = calls[0] as Params;
    expect(params.messages.map((m) => m.role)).toEqual(['assistant', 'user']);
    expect(params.messages[1].content).toContain('บริษัท ทดสอบ จำกัด');
  });

  it('refuses a turn whose next concept is not in the plan', async () => {
    const { client } = stub({ say: 'x', assessment: null, next: { concept: 'made_up' } });
    await expect(
      new ClaudeInterview(client).turn({ ...base, plan: buildPlan(facts) }),
    ).rejects.toThrow(/plan/);
  });

  it('writes the narrative with the verdict model as plain text', async () => {
    const { client, calls } = stub(null);
    const text = await new ClaudeInterview(client).narrate({
      facts,
      verdict: {
        verdict: 'not_ready',
        reasons: [{ concept: 'juristic_id', verdict: 'wrong', note: 'ตอบผิด', cardKey: null }],
      },
      transcript: [],
    });
    expect(text).toBe('สรุปผล');
    expect((calls[0] as Params).model).toBe('claude-opus-5');
  });
});
