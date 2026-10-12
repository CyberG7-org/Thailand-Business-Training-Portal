import { describe, expect, it } from 'vitest';
import { extractCompanyImage } from '@/lib/integrations/extraction/company-image';

describe('company image reader', () => {
  it('accepts shareholder percentages returned as numeric text', async () => {
    const request: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      shareholders: [
                        { name: 'นางสาว ก', percent: '90%' },
                        { name: 'นางสาว ข', percent: '10' },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    const result = await extractCompanyImage(new Uint8Array([1]), 'image/png', {
      apiKey: 'test-key',
      request,
    });

    expect(result.shareholders).toEqual([
      { name: 'นางสาว ก', percent: 90 },
      { name: 'นางสาว ข', percent: 10 },
    ]);
  });

  it('sends the image to Gemini server-side and parses only stated facts', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const request = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      company_name_th: 'บริษัท ตัวอย่าง จำกัด',
                      registered_on: '7 เมษายน 2569',
                      nature_of_business: 'ร้านเสริมสวย',
                      product_samples: ['แชมพู'],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      };
    }) as typeof fetch;
    const image = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
    const result = await extractCompanyImage(image, 'image/jpeg', { apiKey: 'test-key', request });
    expect(result.company_name_th).toBe('บริษัท ตัวอย่าง จำกัด');
    expect(result.product_samples).toEqual(['แชมพู']);
    expect(result.website).toBe('');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('gemini-3.8-flash');
    expect(new Headers(calls[0].init.headers).get('x-goog-api-key')).toBe('test-key');
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.contents[0].parts[1].inlineData.data).toBe(Buffer.from(image).toString('base64'));
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });
});
