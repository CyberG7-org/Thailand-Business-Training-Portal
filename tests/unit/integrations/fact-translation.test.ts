import { describe, expect, it } from 'vitest';
import { GeminiFactTranslator } from '@/lib/integrations/translation/gemini';

describe('GeminiFactTranslator', () => {
  it('keeps source numbers and ignores output that changes them', async () => {
    const calls: RequestInit[] = [];
    const request = (async (_url: string, init: RequestInit) => {
      calls.push(init);
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      monthly_revenue: 'About 300,000 THB',
                      average_transaction: 'About 20,000 THB',
                    }),
                  },
                ],
              },
            },
          ],
        }),
      };
    }) as typeof fetch;
    const translated = await new GeminiFactTranslator('secret', request).translate(
      { monthly_revenue: 'ประมาณ 300,000 บาท', average_transaction: 'ประมาณ 10,000 บาท' },
      'en',
    );
    expect(translated.monthly_revenue).toBe('About 300,000 THB');
    expect(translated.average_transaction).toBeUndefined();
    expect(new Headers(calls[0].headers).get('x-goog-api-key')).toBe('secret');
  });
});
