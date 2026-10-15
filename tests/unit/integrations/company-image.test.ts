import { describe, expect, it } from 'vitest';
import { extractCompanyImage } from '@/lib/integrations/extraction/company-image';
import { companyImageToDraft } from '@/lib/domain/company-image';

describe('company image reader', () => {
  it('accepts a formatted capital amount from Gemini and creates a numeric draft', async () => {
    const request: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ registered_capital: '4,000,000 บาท' }) }],
              },
            },
          ],
        }),
        { status: 200 },
      );

    const profile = await extractCompanyImage(new Uint8Array([1]), 'image/png', {
      apiKey: 'test-key',
      request,
    });

    expect(profile.registered_capital).toBe(4_000_000);
    expect(companyImageToDraft(profile).record.registered_capital).toBe(4_000_000);
  });

  it('reports unreadable capital text as an invalid image reading', async () => {
    const request: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ registered_capital: 'about four million' }) }],
              },
            },
          ],
        }),
        { status: 200 },
      );

    await expect(
      extractCompanyImage(new Uint8Array([1]), 'image/png', { apiKey: 'test-key', request }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

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
    expect(body.generationConfig.maxOutputTokens).toBe(8192);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' });
  });

  it('refuses PDF input so the PDF path cannot consume Gemini credits', async () => {
    let called = false;
    const request = (async () => {
      called = true;
      throw new Error('Gemini must not be called for PDFs');
    }) as typeof fetch;
    await expect(
      extractCompanyImage(new TextEncoder().encode('%PDF-1.7'), 'application/pdf', {
        apiKey: 'test-key',
        request,
      }),
    ).rejects.toThrow(/PDF.*Claude/);
    expect(called).toBe(false);
  });

  it('reports a truncated Gemini result without exposing its partial contents', async () => {
    const request: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: 'MAX_TOKENS',
              content: { parts: [{ text: '{"company_name_th":"private' }] },
            },
          ],
        }),
        { status: 200 },
      );

    await expect(
      extractCompanyImage(new Uint8Array([1]), 'image/png', { apiKey: 'test-key', request }),
    ).rejects.toMatchObject({
      code: 'incomplete',
      message: 'Gemini stopped before finishing the image. Please try again.',
    });
  });

  it('reports malformed JSON as an image-reading error', async () => {
    const request: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"name":"broken' }] } }],
        }),
        { status: 200 },
      );

    await expect(
      extractCompanyImage(new Uint8Array([1]), 'image/png', { apiKey: 'test-key', request }),
    ).rejects.toMatchObject({
      code: 'invalid',
      message: 'Gemini returned an incomplete image reading. Please try again.',
    });
  });
});
