import type { CategoryMapInput, CategoryMapResult, CategoryMapper } from './types';

/** Specific Thai and English phrases only; generic words such as "sell" never decide a category. */
const TERMS: Record<string, readonly string[]> = {
  animal_feed: ['อาหารสัตว์', 'animal feed', 'pet food distributor'],
  household_products: ['ของใช้ในครัวเรือน', 'household products', 'household goods'],
  cleaning_products: ['ผลิตภัณฑ์ทำความสะอาด', 'น้ำยาทำความสะอาด', 'cleaning products', 'detergent'],
  pet_shop: ['สัตว์เลี้ยง', 'pet shop', 'pet supplies'],
  hardware_industrial: [
    'อุปกรณ์ฮาร์ดแวร์',
    'วัสดุอุตสาหกรรม',
    'hardware supplies',
    'industrial supplies',
  ],
  baby_children: [
    'สินค้าเด็ก',
    'สินค้าทารก',
    'ผลิตภัณฑ์เด็ก',
    'baby products',
    'children products',
  ],
  fashion_accessories: ['เครื่องประดับแฟชั่น', 'fashion accessories', 'fashion jewelry'],
  beauty_products: [
    'เครื่องสำอาง',
    'สกินแคร์',
    'แชมพู',
    'cosmetics',
    'skincare',
    'beauty products',
    'shampoo',
  ],
  motorcycle_parts: [
    'อะไหล่มอเตอร์ไซค์',
    'อะไหล่รถจักรยานยนต์',
    'motorcycle parts',
    'motorbike parts',
  ],
  food_products: ['อาหารแปรรูป', 'ผลิตภัณฑ์อาหาร', 'food products', 'processed food'],
  seafood: ['อาหารทะเล', 'seafood', 'กุ้งสด', 'ปลาทะเล'],
  car_accessories: [
    'อะไหล่รถยนต์',
    'อุปกรณ์ตกแต่งรถ',
    'car parts',
    'auto parts',
    'car accessories',
  ],
  educational_toys: [
    'ของเล่นเพื่อการศึกษา',
    'ของเล่นเสริมพัฒนาการ',
    'educational toys',
    'learning toys',
  ],
  stationery_office: ['เครื่องเขียน', 'stationery', 'office stationery'],
  it_house: ['คอมพิวเตอร์', 'เครื่องใช้ไฟฟ้า', 'computer equipment', 'electrical appliances'],
  restaurant_catering: ['ร้านอาหาร', 'จัดเลี้ยง', 'restaurant', 'catering'],
  software_it_services: ['ซอฟต์แวร์', 'พัฒนาแอป', 'software', 'it services', 'app development'],
  construction_renovation: ['ก่อสร้าง', 'ปรับปรุงอาคาร', 'construction', 'renovation'],
  furniture_home: ['เฟอร์นิเจอร์', 'โซฟา', 'furniture', 'home furnishings'],
  medical_health_products: ['เวชภัณฑ์', 'อุปกรณ์การแพทย์', 'medical supplies', 'health products'],
  tourism_travel: ['ท่องเที่ยว', 'tourism', 'travel agency', 'travel services'],
  education_training: [
    'ฝึกอบรม',
    'สอนพิเศษ',
    'training services',
    'education services',
    'tutoring',
  ],
  business_consulting: [
    'คำปรึกษาธุรกิจ',
    'ที่ปรึกษาทางธุรกิจ',
    'business consulting',
    'professional services',
  ],
  fruit_vegetables: ['ผักผลไม้', 'ผลไม้สด', 'ผักสด', 'fresh fruit', 'fresh vegetables'],
  hair_salon: [
    'ตัดผม',
    'ทำสีผม',
    'ร้านเสริมสวย',
    'บริการเสริมสวย',
    'hair salon',
    'haircut',
    'hair coloring',
  ],
  home_kitchen_supplies: ['เครื่องครัว', 'อุปกรณ์เครื่องครัว', 'kitchen supplies', 'kitchenware'],
  mobile_repair: ['ซ่อมโทรศัพท์', 'ซ่อมมือถือ', 'phone repair', 'mobile repair'],
  clothing_apparel: ['เสื้อผ้า', 'ชุดเดรส', 'clothing', 'apparel', 'garments', 'dresses'],
  convenience_store: ['ร้านสะดวกซื้อ', 'มินิมาร์ท', 'convenience store', 'mini mart'],
  coffee_beverage: ['ร้านกาแฟ', 'คาเฟ่', 'coffee shop', 'cafe', 'beverage shop'],
  bakery_dessert: ['เบเกอรี่', 'ขนมหวาน', 'bakery', 'dessert shop'],
  logistics_delivery: [
    'ขนส่งสินค้า',
    'โลจิสติกส์',
    'logistics',
    'delivery services',
    'freight transport',
  ],
  import_export: ['นำเข้า', 'ส่งออก', 'import', 'export'],
  packaging_materials: ['บรรจุภัณฑ์', 'กล่องบรรจุ', 'packaging', 'packing materials'],
  printing_signage: ['งานพิมพ์', 'ป้ายโฆษณา', 'printing', 'signage'],
  manufacturing: ['โรงงาน', 'รับผลิตสินค้า', 'manufacturing', 'factory production'],
  car_repair: ['ซ่อมรถยนต์', 'อู่ซ่อมรถ', 'car repair', 'auto repair', 'vehicle maintenance'],
  laundry_dry_cleaning: ['ซักรีด', 'ซักแห้ง', 'laundry', 'dry cleaning'],
  digital_marketing: ['การตลาดดิจิทัล', 'โฆษณาออนไลน์', 'digital marketing', 'online advertising'],
  agriculture_farming: ['เกษตรกรรม', 'ทำการเกษตร', 'agriculture', 'farming'],
};

const normal = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

function includesPhrase(text: string, phrase: string): boolean {
  const term = normal(phrase);
  if (!term) return false;
  if (!/[a-z0-9]/.test(term)) return text.includes(term);
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`).test(text);
}

/** Deterministic category matching from the manager's two business answers. */
export class RulesCategoryMapper implements CategoryMapper {
  readonly name = 'rules' as const;
  readonly model = 'rules-v1';

  async map(input: CategoryMapInput): Promise<CategoryMapResult> {
    const nature = normal(input.natureOfBusiness);
    const products = normal(input.productsServices ?? '');
    const matches = input.categories
      .map((category) => {
        const phrases = [...(TERMS[category.key] ?? []), category.label_en, category.label_th];
        const main = phrases.some((phrase) => includesPhrase(nature, phrase));
        const sold = phrases.some((phrase) => includesPhrase(products, phrase));
        return { key: category.key, score: (main ? 3 : 0) + (sold ? 1 : 0), main };
      })
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score);
    if (matches.length === 0 || matches[0].score === matches[1]?.score) {
      return { key: null, confidence: 0 };
    }
    return { key: matches[0].key, confidence: matches[0].main ? 0.95 : 0.8 };
  }
}
