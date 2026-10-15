import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { companyPdfAvailable, extractCompanyPdf } from '@/lib/integrations/extraction/company-pdf';

describe('company PDF poster reader', () => {
  it('needs Claude and indexing, not a Gemini key', () => {
    expect(
      companyPdfAvailable({
        NODE_ENV: 'production',
        ANTHROPIC_API_KEY: 'claude-key',
        PINECONE_API_KEY: 'pinecone-key',
        GEMINI_API_KEY: undefined,
      }),
    ).toBe(true);
    expect(
      companyPdfAvailable({
        NODE_ENV: 'production',
        GEMINI_API_KEY: 'gemini-key',
        PINECONE_API_KEY: 'pinecone-key',
      }),
    ).toBe(false);
    expect(
      companyPdfAvailable({
        NODE_ENV: 'production',
        ANTHROPIC_API_KEY: 'claude-key',
      }),
    ).toBe(false);
    expect(
      companyPdfAvailable({
        NODE_ENV: 'production',
        ANTHROPIC_API_KEY: 'claude-key',
        VECTOR_PROVIDER: 'fake',
      }),
    ).toBe(false);
  });
  it('reads poster facts through Claude without a Gemini request', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.7 poster');
    let sentContent: unknown;
    const client = {
      messages: {
        stream: (_args: { messages: { content: unknown }[] }) => {
          sentContent = _args.messages[0].content;
          return {
            finalMessage: async () => ({
              stop_reason: 'end_turn',
              parsed_output: {
                company_name_th: 'บริษัท ตัวอย่าง จำกัด',
                company_name_en: 'EXAMPLE CO., LTD.',
                juristic_id: '0105568233704',
                registered_on: '7 เมษายน 2569',
                registered_capital: 1000000,
                total_shares: 40_000,
                directors: [{ name_th: 'นางสาว ก', name_en: '' }],
                shareholders: [{ name: 'นางสาว ก', shares: 36_000, percent: 90 }],
                objectives: ['จำหน่ายสินค้า'],
                head_office_address: 'Bangkok',
                province: 'Bangkok',
                website: 'https://example.com',
                facebook_page: 'https://facebook.com/example',
                nature_of_business: 'Beauty salon',
                products_services: 'Hair care services',
                product_samples: ['Shampoo'],
              },
            }),
          };
        },
      },
    } as unknown as Anthropic;

    const result = await extractCompanyPdf(pdf, { client });

    expect(result.company_name_en).toBe('EXAMPLE CO., LTD.');
    expect(result.shareholders).toEqual([{ name: 'นางสาว ก', shares: 36_000, percent: 90 }]);
    expect(result.total_shares).toBe(40_000);
    expect(result.products_services).toBe('Hair care services');
    expect(sentContent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'document',
          source: expect.objectContaining({
            media_type: 'application/pdf',
            data: Buffer.from(pdf).toString('base64'),
          }),
        }),
      ]),
    );
  });
});
