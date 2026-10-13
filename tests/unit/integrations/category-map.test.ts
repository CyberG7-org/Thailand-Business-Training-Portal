import { describe, expect, it } from 'vitest';
import { resolveCategoryMapProvider } from '@/lib/integrations/category-map';
import { ClaudeCategoryMapper } from '@/lib/integrations/category-map/claude';
import { FakeCategoryMapper } from '@/lib/integrations/category-map/fake';
import { GeminiCategoryMapper } from '@/lib/integrations/category-map/gemini';
import { RulesCategoryMapper } from '@/lib/integrations/category-map/rules';
import { BUSINESS_NATURES } from '@/lib/domain/business-natures';

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
  it('uses local rules in production even when AI keys or an old provider setting exist', () => {
    expect(resolveCategoryMapProvider({ CATEGORY_MAP_PROVIDER: 'off' })).toBe('off');
    expect(resolveCategoryMapProvider({ ANTHROPIC_API_KEY: 'k' })).toBe('rules');
    expect(resolveCategoryMapProvider({ GEMINI_API_KEY: 'k', NODE_ENV: 'production' })).toBe(
      'rules',
    );
    expect(resolveCategoryMapProvider({ CATEGORY_MAP_PROVIDER: 'gemini' })).toBe('rules');
    expect(resolveCategoryMapProvider({ NODE_ENV: 'production' })).toBe('rules');
    expect(resolveCategoryMapProvider({})).toBe('rules');
  });
});

describe('RulesCategoryMapper', () => {
  const mapper = new RulesCategoryMapper();
  const catalog = BUSINESS_NATURES.map(([key, label_en, , , , label_th]) => ({
    key,
    label_en,
    label_th,
  }));

  it.each([
    ['animal_feed', 'จำหน่ายอาหารสัตว์'],
    ['household_products', 'ขายของใช้ในครัวเรือน'],
    ['cleaning_products', 'จำหน่ายผลิตภัณฑ์ทำความสะอาด'],
    ['pet_shop', 'ร้านขายสัตว์เลี้ยงและอาหารแมว'],
    ['hardware_industrial', 'ขายอุปกรณ์ฮาร์ดแวร์'],
    ['baby_children', 'ขายสินค้าเด็กและทารก'],
    ['fashion_accessories', 'ขายเครื่องประดับแฟชั่น'],
    ['beauty_products', 'ขายเครื่องสำอางและสกินแคร์'],
    ['motorcycle_parts', 'ขายอะไหล่มอเตอร์ไซค์'],
    ['food_products', 'จำหน่ายอาหารแปรรูป'],
    ['seafood', 'จำหน่ายอาหารทะเล'],
    ['car_accessories', 'ขายอะไหล่รถยนต์'],
    ['educational_toys', 'ขายของเล่นเพื่อการศึกษา'],
    ['stationery_office', 'ขายเครื่องเขียน'],
    ['it_house', 'ขายคอมพิวเตอร์และเครื่องใช้ไฟฟ้า'],
    ['restaurant_catering', 'เปิดร้านอาหารและรับจัดเลี้ยง'],
    ['software_it_services', 'พัฒนาซอฟต์แวร์'],
    ['construction_renovation', 'รับเหมาก่อสร้าง'],
    ['furniture_home', 'จำหน่ายเฟอร์นิเจอร์'],
    ['medical_health_products', 'ขายเวชภัณฑ์'],
    ['tourism_travel', 'บริการท่องเที่ยว'],
    ['education_training', 'บริการฝึกอบรม'],
    ['business_consulting', 'ให้คำปรึกษาธุรกิจ'],
    ['fruit_vegetables', 'ขายผักผลไม้สด'],
    ['hair_salon', 'ให้บริการตัดผม ทำสีผม'],
    ['home_kitchen_supplies', 'ขายอุปกรณ์เครื่องครัว'],
    ['mobile_repair', 'รับซ่อมโทรศัพท์มือถือ'],
    ['clothing_apparel', 'ขายเสื้อผ้าออนไลน์'],
    ['convenience_store', 'เปิดร้านสะดวกซื้อ'],
    ['coffee_beverage', 'เปิดร้านกาแฟ'],
    ['bakery_dessert', 'เปิดร้านเบเกอรี่'],
    ['logistics_delivery', 'ให้บริการขนส่งสินค้า'],
    ['import_export', 'นำเข้าและส่งออกสินค้า'],
    ['packaging_materials', 'ขายวัสดุบรรจุภัณฑ์'],
    ['printing_signage', 'รับทำป้ายโฆษณาและงานพิมพ์'],
    ['manufacturing', 'รับผลิตสินค้าในโรงงาน'],
    ['car_repair', 'บริการซ่อมรถยนต์'],
    ['laundry_dry_cleaning', 'บริการซักรีด'],
    ['digital_marketing', 'บริการการตลาดดิจิทัล'],
    ['agriculture_farming', 'ประกอบกิจการเกษตรกรรม'],
  ])('maps %s from a Thai business description', async (key, natureOfBusiness) => {
    const result = await mapper.map({
      natureOfBusiness,
      productsServices: null,
      categories: catalog,
    });
    expect(result.key).toBe(key);
  });

  it('uses the main business over a secondary product', async () => {
    const result = await mapper.map({
      natureOfBusiness: 'ให้บริการเสริมสวย ตัดผม ทำสีผม',
      productsServices: 'ขายแชมพูและเครื่องสำอางด้วย',
      categories: catalog,
    });
    expect(result.key).toBe('hair_salon');
  });

  it('uses the products when the business description is too general', async () => {
    const result = await mapper.map({
      natureOfBusiness: 'จำหน่ายสินค้าปลีก',
      productsServices: 'เสื้อผ้าและชุดเดรส',
      categories: catalog,
    });
    expect(result.key).toBe('clothing_apparel');
  });

  it('does not guess when two main businesses are equally supported', async () => {
    const result = await mapper.map({
      natureOfBusiness: 'จำหน่ายอาหารทะเลและเสื้อผ้า',
      productsServices: null,
      categories: catalog,
    });
    expect(result.key).toBeNull();
  });

  it('does not guess from generic or absent text', async () => {
    for (const natureOfBusiness of ['', 'จำหน่ายสินค้าทั่วไป']) {
      const result = await mapper.map({
        natureOfBusiness,
        productsServices: null,
        categories: catalog,
      });
      expect(result.key).toBeNull();
    }
  });
});

describe('GeminiCategoryMapper', () => {
  it('sends the two business answers and accepts only listed category keys', async () => {
    const request = async (_url: string, options: RequestInit) => {
      expect(JSON.stringify(options.body)).toContain('ขายเสื้อผ้า');
      expect(JSON.stringify(options.body)).toContain('เสื้อสตรี');
      return new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: '{"key":"clothing_fashion","confidence":0.91}' }] } },
          ],
        }),
        { status: 200 },
      );
    };
    const mapper = new GeminiCategoryMapper('test-key', request as typeof fetch);
    await expect(
      mapper.map({ natureOfBusiness: 'ขายเสื้อผ้า', productsServices: 'เสื้อสตรี', categories }),
    ).resolves.toEqual({ key: 'clothing_fashion', confidence: 0.91 });
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
