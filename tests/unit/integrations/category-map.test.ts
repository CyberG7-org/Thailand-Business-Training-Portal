import { describe, expect, it } from 'vitest';
import { resolveCategoryMapProvider } from '@/lib/integrations/category-map';
import { ClaudeCategoryMapper } from '@/lib/integrations/category-map/claude';
import { FakeCategoryMapper } from '@/lib/integrations/category-map/fake';

const categories = [
  {
    key: 'clothing_fashion',
    label_th: 'ค้าส่งและค้าปลีกเสื้อผ้าและเครื่องแต่งกาย',
    label_en: 'Clothing and apparel wholesale and retail',
  },
  {
    key: 'furniture_home',
    label_th: 'ค้าเฟอร์นิเจอร์และของใช้ในบ้าน',
    label_en: 'Furniture and household goods',
  },
];

describe('resolveCategoryMapProvider', () => {
  it('follows the same rule as every adapter', () => {
    expect(resolveCategoryMapProvider({ CATEGORY_MAP_PROVIDER: 'off' })).toBe('off');
    expect(resolveCategoryMapProvider({ ANTHROPIC_API_KEY: 'k' })).toBe('claude');
    expect(resolveCategoryMapProvider({ NODE_ENV: 'production' })).toBe('off');
    expect(resolveCategoryMapProvider({})).toBe('fake');
  });
});

describe('FakeCategoryMapper', () => {
  const fake = new FakeCategoryMapper();

  it('maps a clear description with high confidence', async () => {
    await expect(
      fake.map({ natureOfBusiness: 'ขายเสื้อผ้าออนไลน์', productsServices: null, categories }),
    ).resolves.toEqual({ key: 'clothing_fashion', confidence: 0.95 });
  });

  it('offers a weak match at low confidence', async () => {
    await expect(
      fake.map({ natureOfBusiness: 'ขายบ้าน', productsServices: null, categories }),
    ).resolves.toEqual({ key: 'furniture_home', confidence: 0.6 });
  });

  it('maps nothing it cannot recognise', async () => {
    await expect(
      fake.map({ natureOfBusiness: 'zzzz qqqq', productsServices: null, categories }),
    ).resolves.toEqual({ key: null, confidence: 0 });
  });
});

function stub(parsed: unknown) {
  const calls: unknown[] = [];
  const client = {
    messages: {
      stream: (params: unknown) => {
        calls.push(params);
        return { finalMessage: async () => ({ stop_reason: 'end_turn', parsed_output: parsed }) };
      },
    },
  };
  return { client: client as never, calls };
}

describe('ClaudeCategoryMapper', () => {
  it('sends the dictionary and the business text, and takes the chosen key', async () => {
    const { client, calls } = stub({ key: 'clothing_fashion', confidence: 0.91 });
    const mapper = new ClaudeCategoryMapper(client);
    const result = await mapper.map({
      natureOfBusiness: 'ขายเสื้อผ้า',
      productsServices: 'เสื้อสตรี',
      categories,
    });
    expect(result).toEqual({ key: 'clothing_fashion', confidence: 0.91 });
    const params = calls[0] as { model: string; messages: { content: string }[] };
    expect(params.model).toBe('claude-sonnet-5');
    expect(params.messages[0].content).toContain('furniture_home');
    expect(params.messages[0].content).toContain('ขายเสื้อผ้า');
  });

  it('reads "none" as no category', async () => {
    const { client } = stub({ key: 'none', confidence: 0.2 });
    await expect(
      new ClaudeCategoryMapper(client).map({
        natureOfBusiness: 'x',
        productsServices: null,
        categories,
      }),
    ).resolves.toEqual({ key: null, confidence: 0.2 });
  });
});
