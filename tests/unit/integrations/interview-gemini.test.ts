import { describe, expect, it } from 'vitest';
import { buildReadinessPlan } from '@/lib/domain/interview/plan';
import { GeminiInterview } from '@/lib/integrations/interview/gemini';

const facts = { company_name_th: 'บริษัท ทดสอบ จำกัด', juristic_id: '0105568233704' };
const plan = buildReadinessPlan(facts);

function mockRequest(output: unknown, ok = true) {
  const calls: { url: string; init: RequestInit }[] = [];
  const request = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return {
      ok,
      status: ok ? 200 : 429,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }],
      }),
    };
  }) as typeof fetch;
  return { request, calls };
}

describe('GeminiInterview', () => {
  it('uses the AI Studio key server-side and validates the officer turn', async () => {
    const { request, calls } = mockRequest({
      say: 'บริษัทชื่ออะไรคะ',
      assessment: null,
      next: { concept: plan.items[0].concept },
    });
    const turn = await new GeminiInterview('secret', request).turn({
      facts,
      plan,
      transcript: [],
      learnerMessage: null,
      pastedDetected: false,
      evasions: 0,
    });
    expect(turn.say).toContain('บริษัท');
    expect(calls).toHaveLength(1);
    expect(new Headers(calls[0].init.headers).get('x-goog-api-key')).toBe('secret');
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.systemInstruction.parts[0].text).toContain('0105568233704');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('rejects a concept outside the plan', async () => {
    const { request } = mockRequest({
      say: 'คำถามค่ะ',
      assessment: null,
      next: { concept: 'made_up' },
    });
    await expect(
      new GeminiInterview('secret', request).turn({
        facts,
        plan,
        transcript: [],
        learnerMessage: null,
        pastedDetected: false,
        evasions: 0,
      }),
    ).rejects.toThrow(/plan/);
  });

  it('does not call Google without a key', async () => {
    const { request, calls } = mockRequest({});
    await expect(
      new GeminiInterview('', request).turn({
        facts,
        plan,
        transcript: [],
        learnerMessage: null,
        pastedDetected: false,
        evasions: 0,
      }),
    ).rejects.toThrow(/GEMINI_API_KEY/);
    expect(calls).toHaveLength(0);
  });

  it('reports API failures without returning a remote response body', async () => {
    const { request } = mockRequest({}, false);
    await expect(
      new GeminiInterview('secret', request).turn({
        facts,
        plan,
        transcript: [],
        learnerMessage: null,
        pastedDetected: false,
        evasions: 0,
      }),
    ).rejects.toThrow('Gemini interview request failed (429)');
  });
});
