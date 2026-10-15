import { describe, expect, it } from 'vitest';
import { RulesCategoryMapper } from '@/lib/integrations/category-map/rules';

const mapper = new RulesCategoryMapper();
const classify = (natureOfBusiness: string, productsServices: string | null = null) =>
  mapper.map({ natureOfBusiness, productsServices, categories: [] });

describe('deterministic business category selection', () => {
  it.each([
    ['จำหน่ายผักสดและผลไม้สดทั่วประเทศ', 'food_agricultural_trading'],
    ['เปิดร้านทำผมให้บริการตัดผมและทำสีผม', 'hair_beauty_services'],
    ['จำหน่ายโทรศัพท์มือถือรุ่นใหม่', 'electronics_device_trading'],
    ['รับซ่อมโทรศัพท์มือถือและซ่อมโน้ตบุ๊ก', 'electronics_device_repair'],
    ['จำหน่ายวัสดุก่อสร้างและอุปกรณ์ช่าง', 'hardware_industrial_materials'],
    ['รับเหมาก่อสร้างและปรับปรุงอาคาร', 'construction_installation_services'],
    ['เปิดร้านอาหารและรับจัดเลี้ยง', 'restaurant_cafe_catering'],
    ['จำหน่ายเสื้อผ้าและกระเป๋า', 'clothing_fashion_accessories'],
    ['จำหน่ายเครื่องสำอางและผลิตภัณฑ์บำรุงผิว', 'beauty_cosmetics_products'],
    ['ขายเครื่องเขียนและอุปกรณ์สำนักงาน', 'household_office_kitchen'],
    ['จำหน่ายเฟอร์นิเจอร์สำนักงานและโซฟา', 'furniture_furnishings'],
    ['จำหน่ายอะไหล่รถยนต์', 'automotive_parts_trading'],
    ['เปิดอู่ซ่อมรถยนต์', 'automotive_repair_services'],
    ['จำหน่ายอาหารสัตว์เลี้ยงและอาหารแมว', 'pet_animal_feed'],
    ['ขายสินค้าเด็กอ่อนและของเล่นเสริมพัฒนาการ', 'baby_children_educational_products'],
    ['จำหน่ายเวชภัณฑ์และอุปกรณ์การแพทย์', 'medical_health_products'],
    ['เปิดร้านสะดวกซื้อ', 'general_retail_convenience'],
    ['บริการขนส่งสินค้าและจัดส่งพัสดุ', 'logistics_transport'],
    ['รับจ้างผลิตสินค้าในโรงงาน', 'manufacturing_production'],
    ['บริการพิมพ์ป้ายไวนิล', 'printing_signage'],
    ['พัฒนาซอฟต์แวร์และเว็บไซต์', 'software_it_digital'],
    ['ให้บริการฝึกอบรมและที่ปรึกษาธุรกิจ', 'education_training_consulting'],
    ['บริษัทนำเที่ยวและแพ็กเกจทัวร์', 'travel_tourism_hospitality'],
    ['บริการซักรีดและซักแห้ง', 'cleaning_laundry_facility'],
  ])('maps %s to %s', async (description, key) => {
    expect((await classify(description)).key).toBe(key);
  });

  it('does not confuse office furniture with office supplies', async () => {
    expect((await classify('จำหน่ายเฟอร์นิเจอร์สำนักงาน')).key).toBe('furniture_furnishings');
  });

  it('uses the stored objective only when direct activity and products are missing', async () => {
    const result = await mapper.map({
      natureOfBusiness: '',
      productsServices: null,
      dbdObjectives: ['บริษัทจำหน่ายผลไม้สด'],
      categories: [],
    });
    expect(result.key).toBe('food_agricultural_trading');
    expect(result.matchedEvidence?.some((hit) => hit.sourceField === 'dbd_objectives')).toBe(true);
  });

  it('uses diverse non-furniture evidence for a mixed furniture and kitchen poster', async () => {
    const result = await classify(
      'จำหน่ายเฟอร์นิเจอร์สำนักงาน เฟอร์นิเจอร์บ้าน เครื่องครัว อุปกรณ์ทำอาหาร และเครื่องเขียน',
      'โต๊ะทำงาน โซฟา หม้อ กระทะ และอุปกรณ์สำนักงาน',
    );
    expect(result.key).toBe('household_office_kitchen');
    expect(result.method).toBe('rules');
    expect(result.matchedEvidence?.length).toBeGreaterThan(0);
  });

  it('honours explicit primary furniture activity despite kitchen side products', async () => {
    const result = await classify(
      'ธุรกิจหลักจำหน่ายเฟอร์นิเจอร์สำนักงานและโซฟา พร้อมขายเครื่องครัว',
      'เฟอร์นิเจอร์สำนักงาน โซฟา เครื่องครัว',
    );
    expect(result.key).toBe('furniture_furnishings');
  });

  it.each(['ค้าขาย', 'trading import export', ''])(
    'falls back for generic text %s',
    async (text) => {
      expect(await classify(text)).toMatchObject({
        key: 'general_other',
        method: 'fallback',
        evidenceLevel: 'none',
      });
    },
  );

  it('does not increase evidence score from repeated mentions', async () => {
    const once = await classify('ขายเฟอร์นิเจอร์');
    const repeated = await classify(`ขาย${'เฟอร์นิเจอร์'.repeat(20)}`);
    expect(repeated.key).toBe(once.key);
    expect(repeated.score).toBe(once.score);
  });

  it('resolves positive ties deterministically and records the reason', async () => {
    const result = await classify('ขายอาหารทะเลและเสื้อผ้า');
    expect(result.key).not.toBeNull();
    expect(result.key).not.toBe('general_other');
    expect(result.method).toBe('tie_break');
  });

  it('is reproducible without provider credentials or network', async () => {
    const input = 'จำหน่ายเครื่องครัวและอุปกรณ์สำนักงาน';
    expect(await classify(input)).toEqual(await classify(input));
  });
});
