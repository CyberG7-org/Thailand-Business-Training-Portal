/** Versioned primary classification taxonomy. Legacy 40-key planning data remains in business-natures.ts. */
export const CATEGORY_TAXONOMY_VERSION = 'primary-25-v1';
export const CATEGORY_RULES_VERSION = 'rules-v2';

export type CategoryTerm = { concept: string; phrases: readonly string[]; weight: 10 | 5 | 2 };
export type PrimaryCategory = {
  key: string;
  en: string;
  th: string;
  terms: readonly CategoryTerm[];
  /** Existing illustrative figures only; never verified company facts. */
  legacyFiguresKey: string | null;
};

const activity = (concept: string, ...phrases: string[]): CategoryTerm => ({
  concept,
  phrases,
  weight: 10,
});
const product = (concept: string, ...phrases: string[]): CategoryTerm => ({
  concept,
  phrases,
  weight: 5,
});
export const PRIMARY_CATEGORIES: readonly PrimaryCategory[] = [
  {
    key: 'food_agricultural_trading',
    en: 'Food, Beverage & Agricultural Products Trading',
    th: 'ค้าอาหาร เครื่องดื่ม และผลผลิตการเกษตร',
    legacyFiguresKey: 'food_products',
    terms: [
      activity(
        'food_distribution',
        'food distribution',
        'ขายส่งผลไม้',
        'ขายส่งผัก',
        'จำหน่ายอาหารสด',
        'ค้าอาหารทะเล',
      ),
      product(
        'fresh_produce',
        'ผลไม้สด',
        'ผักสด',
        'ผลไม้',
        'ผัก',
        'fresh fruit',
        'fresh vegetables',
        'agricultural produce',
        'ผลผลิตทางการเกษตร',
      ),
      product('seafood', 'seafood', 'อาหารทะเล'),
      product('frozen_food', 'frozen food', 'อาหารแช่แข็ง'),
      product('food_products', 'food products', 'อาหารแปรรูป', 'ผลิตภัณฑ์อาหาร'),
    ],
  },
  {
    key: 'restaurant_cafe_catering',
    en: 'Restaurant, Café & Catering Services',
    th: 'ร้านอาหาร คาเฟ่ และบริการจัดเลี้ยง',
    legacyFiguresKey: 'restaurant_catering',
    terms: [
      activity('restaurant', 'restaurant', 'ร้านอาหาร'),
      activity('cafe', 'cafe', 'coffee shop', 'คาเฟ่', 'ร้านกาแฟ'),
      activity('catering', 'catering service', 'รับจัดเลี้ยง', 'จัดเลี้ยง'),
      activity('bakery_shop', 'bakery shop', 'dessert shop', 'ร้านเบเกอรี่', 'ร้านขนม'),
    ],
  },
  {
    key: 'clothing_fashion_accessories',
    en: 'Clothing, Fashion & Accessories',
    th: 'เสื้อผ้า แฟชั่น และเครื่องประดับ',
    legacyFiguresKey: 'clothing_apparel',
    terms: [
      product('clothing', 'clothing', 'apparel', 'garments', 'เสื้อผ้า', 'เครื่องนุ่งห่ม'),
      product('fashion', 'fashion accessories', 'เครื่องประดับแฟชั่น'),
      product('bags', 'handbags', 'กระเป๋า'),
      product('shoes', 'shoes', 'รองเท้า'),
    ],
  },
  {
    key: 'beauty_cosmetics_products',
    en: 'Beauty, Cosmetics & Personal Care Products',
    th: 'เครื่องสำอางและผลิตภัณฑ์ดูแลส่วนบุคคล',
    legacyFiguresKey: 'beauty_products',
    terms: [
      product('cosmetics', 'cosmetics', 'เครื่องสำอาง'),
      product('skincare', 'skincare products', 'ผลิตภัณฑ์บำรุงผิว', 'สกินแคร์'),
      product('makeup', 'makeup products', 'ผลิตภัณฑ์แต่งหน้า'),
      product('perfume', 'perfume', 'น้ำหอม'),
      product('personal_care', 'personal care', 'ผลิตภัณฑ์ดูแลส่วนบุคคล'),
    ],
  },
  {
    key: 'hair_beauty_services',
    en: 'Hair Salon & Beauty Services',
    th: 'ร้านทำผมและบริการเสริมสวย',
    legacyFiguresKey: 'hair_salon',
    terms: [
      activity('salon', 'hair salon', 'beauty salon', 'ร้านทำผม', 'ร้านเสริมสวย'),
      activity('haircut', 'haircut service', 'haircut', 'บริการตัดผม', 'ตัดผม'),
      activity('hair_color', 'hair coloring service', 'ทำสีผม', 'ย้อมผม'),
    ],
  },
  {
    key: 'household_office_kitchen',
    en: 'Household, Office & Kitchen Supplies',
    th: 'ของใช้ในบ้าน อุปกรณ์สำนักงานและเครื่องครัว',
    legacyFiguresKey: 'home_kitchen_supplies',
    terms: [
      product('kitchenware', 'kitchenware', 'เครื่องครัว', 'อุปกรณ์เครื่องครัว'),
      product('cookware', 'cookware', 'อุปกรณ์ทำอาหาร', 'หม้อ', 'กระทะ'),
      product('stationery', 'stationery', 'เครื่องเขียน'),
      product('office_supplies', 'office supplies', 'อุปกรณ์สำนักงาน'),
      product('household_goods', 'household goods', 'ของใช้ในบ้าน'),
      product('tableware', 'tableware', 'เครื่องใช้บนโต๊ะอาหาร', 'จานชาม'),
    ],
  },
  {
    key: 'furniture_furnishings',
    en: 'Furniture & Home Furnishings',
    th: 'เฟอร์นิเจอร์และของตกแต่งบ้าน',
    legacyFiguresKey: 'furniture_home',
    terms: [
      product('furniture', 'furniture', 'เฟอร์นิเจอร์', 'office furniture', 'เฟอร์นิเจอร์สำนักงาน'),
      product('sofa', 'sofa', 'โซฟา'),
      product('wardrobe', 'wardrobe', 'ตู้เสื้อผ้า'),
      product('cabinet', 'cabinet', 'ตู้เก็บของ'),
      product('bed_frame', 'bed frame', 'โครงเตียง'),
    ],
  },
  {
    key: 'electronics_device_trading',
    en: 'Electronics, Computers & Mobile Devices Trading',
    th: 'ค้าอุปกรณ์อิเล็กทรอนิกส์ คอมพิวเตอร์ และโทรศัพท์มือถือ',
    legacyFiguresKey: 'it_house',
    terms: [
      activity(
        'phone_sales',
        'mobile phone sales',
        'smartphones for sale',
        'จำหน่ายโทรศัพท์มือถือ',
        'ขายสมาร์ทโฟน',
      ),
      activity('computer_sales', 'computers for sale', 'จำหน่ายคอมพิวเตอร์'),
      activity('appliance_sales', 'electrical appliances trading', 'จำหน่ายเครื่องใช้ไฟฟ้า'),
      product('mobile_devices', 'โทรศัพท์มือถือ', 'smartphones'),
      product('computers', 'คอมพิวเตอร์', 'computers'),
    ],
  },
  {
    key: 'electronics_device_repair',
    en: 'Electronics & Mobile Device Repair Services',
    th: 'บริการซ่อมอุปกรณ์อิเล็กทรอนิกส์และโทรศัพท์มือถือ',
    legacyFiguresKey: 'mobile_repair',
    terms: [
      activity(
        'phone_repair',
        'mobile phone repair',
        'phone repair',
        'ซ่อมโทรศัพท์มือถือ',
        'ซ่อมมือถือ',
      ),
      activity(
        'computer_repair',
        'computer repair',
        'laptop repair',
        'ซ่อมคอมพิวเตอร์',
        'ซ่อมโน้ตบุ๊ก',
      ),
      activity('screen_repair', 'screen replacement', 'เปลี่ยนหน้าจอ'),
    ],
  },
  {
    key: 'automotive_parts_trading',
    en: 'Automotive & Motorcycle Parts Trading',
    th: 'ค้าอะไหล่รถยนต์และรถจักรยานยนต์',
    legacyFiguresKey: 'car_accessories',
    terms: [
      product('car_parts', 'auto parts', 'vehicle spare parts', 'อะไหล่รถยนต์', 'จำหน่ายอะไหล่'),
      product('motorcycle_parts', 'motorcycle parts', 'อะไหล่รถจักรยานยนต์'),
      product('tyres', 'tyres trading', 'จำหน่ายยางรถยนต์'),
    ],
  },
  {
    key: 'automotive_repair_services',
    en: 'Automotive Repair & Maintenance Services',
    th: 'บริการซ่อมและบำรุงรักษายานยนต์',
    legacyFiguresKey: 'car_repair',
    terms: [
      activity('car_repair', 'car repair', 'automotive workshop', 'ซ่อมรถยนต์', 'อู่ซ่อมรถ'),
      activity('motorcycle_repair', 'motorcycle repair', 'ซ่อมรถจักรยานยนต์'),
      activity('vehicle_service', 'vehicle servicing', 'บำรุงรักษารถยนต์'),
    ],
  },
  {
    key: 'hardware_industrial_materials',
    en: 'Hardware, Industrial & Construction Supplies',
    th: 'วัสดุก่อสร้าง ฮาร์ดแวร์ และอุปกรณ์อุตสาหกรรม',
    legacyFiguresKey: 'hardware_industrial',
    terms: [
      activity('building_materials', 'building materials sales', 'จำหน่ายวัสดุก่อสร้าง'),
      product('materials', 'วัสดุก่อสร้าง', 'building materials'),
      product('hardware', 'hardware supplies', 'อุปกรณ์ช่าง'),
      product('industrial', 'industrial equipment trading', 'จำหน่ายอุปกรณ์อุตสาหกรรม'),
      product('power_tools', 'power tools sales', 'จำหน่ายเครื่องมือไฟฟ้า'),
    ],
  },
  {
    key: 'construction_installation_services',
    en: 'Construction, Renovation & Installation Services',
    th: 'บริการก่อสร้าง ปรับปรุง และติดตั้ง',
    legacyFiguresKey: 'construction_renovation',
    terms: [
      activity('contractor', 'construction contractor', 'รับเหมาก่อสร้าง'),
      activity('renovation', 'building renovation', 'ปรับปรุงอาคาร'),
      activity('electrical_installation', 'electrical installation', 'รับติดตั้งระบบไฟฟ้า'),
      activity('plumbing', 'plumbing installation', 'ติดตั้งระบบประปา'),
    ],
  },
  {
    key: 'pet_animal_feed',
    en: 'Pet Products & Animal Feed',
    th: 'สินค้าและอาหารสัตว์เลี้ยง',
    legacyFiguresKey: 'animal_feed',
    terms: [
      product('feed', 'animal feed', 'pet food', 'อาหารสัตว์', 'อาหารสัตว์เลี้ยง'),
      product('pet_supplies', 'pet supplies', 'อุปกรณ์สัตว์เลี้ยง'),
      product('dog_food', 'dog food', 'อาหารสุนัข'),
      product('cat_food', 'cat food', 'อาหารแมว'),
    ],
  },
  {
    key: 'baby_children_educational_products',
    en: "Baby, Children's & Educational Products",
    th: 'สินค้าเด็กและสื่อการศึกษา',
    legacyFiguresKey: 'baby_children',
    terms: [
      product('baby', 'baby products', 'infant products', 'สินค้าเด็กอ่อน', 'ของใช้เด็ก'),
      product('toys', "children's toys", 'ของเล่นเด็ก'),
      product('educational_toys', 'educational toys', 'ของเล่นเสริมพัฒนาการ'),
    ],
  },
  {
    key: 'medical_health_products',
    en: 'Medical & Health Products Trading',
    th: 'ค้าเวชภัณฑ์และอุปกรณ์การแพทย์',
    legacyFiguresKey: 'medical_health_products',
    terms: [
      product(
        'medical_equipment',
        'medical equipment',
        'medical devices',
        'อุปกรณ์การแพทย์',
        'เครื่องมือแพทย์',
      ),
      product('medical_supplies', 'medical supplies', 'เวชภัณฑ์'),
      product('surgical', 'surgical supplies', 'อุปกรณ์ผ่าตัด'),
    ],
  },
  {
    key: 'general_retail_convenience',
    en: 'General Retail, Wholesale & Convenience Stores',
    th: 'ค้าปลีก ค้าส่งทั่วไป และร้านสะดวกซื้อ',
    legacyFiguresKey: 'convenience_store',
    terms: [
      activity('convenience_store', 'convenience store', 'ร้านสะดวกซื้อ'),
      activity('minimart', 'minimart', 'มินิมาร์ท'),
      activity(
        'general_store',
        'general merchandise shop',
        'variety store',
        'ร้านขายของชำ',
        'ร้านค้าสินค้าเบ็ดเตล็ด',
      ),
    ],
  },
  {
    key: 'logistics_transport',
    en: 'Logistics, Transportation & Delivery Services',
    th: 'บริการโลจิสติกส์ ขนส่ง และจัดส่ง',
    legacyFiguresKey: 'logistics_delivery',
    terms: [
      activity('logistics', 'logistics services', 'บริการโลจิสติกส์'),
      activity('freight', 'freight transport', 'ขนส่งสินค้า'),
      activity('courier', 'courier service', 'บริการจัดส่งพัสดุ'),
      activity('warehousing', 'warehousing', 'คลังสินค้า'),
      activity('delivery', 'delivery services', 'บริการขนส่ง'),
    ],
  },
  {
    key: 'manufacturing_production',
    en: 'Manufacturing, Packaging & Production',
    th: 'การผลิตสินค้าและบรรจุภัณฑ์',
    legacyFiguresKey: 'manufacturing',
    terms: [
      activity('factory', 'factory manufacturing', 'โรงงานผลิต'),
      activity(
        'manufacture',
        'product manufacturing',
        'contract manufacturing',
        'ผลิตสินค้า',
        'รับจ้างผลิต',
      ),
      activity('packaging', 'packaging production', 'ผลิตบรรจุภัณฑ์'),
    ],
  },
  {
    key: 'printing_signage',
    en: 'Printing, Signage & Advertising Production',
    th: 'งานพิมพ์ ป้าย และสื่อโฆษณา',
    legacyFiguresKey: 'printing_signage',
    terms: [
      activity('printing', 'printing service', 'printing house', 'บริการพิมพ์', 'โรงพิมพ์'),
      activity(
        'signage',
        'signage production',
        'banners printing',
        'ผลิตป้ายโฆษณา',
        'พิมพ์ป้ายไวนิล',
      ),
    ],
  },
  {
    key: 'software_it_digital',
    en: 'Software, IT & Digital Services',
    th: 'บริการซอฟต์แวร์ ไอที และดิจิทัล',
    legacyFiguresKey: 'software_it_services',
    terms: [
      activity('software', 'software development', 'พัฒนาซอฟต์แวร์'),
      activity('it', 'it services', 'บริการไอที'),
      activity('website', 'website development', 'พัฒนาเว็บไซต์'),
      activity(
        'digital_marketing',
        'digital marketing services',
        'บริการการตลาดดิจิทัล',
        'การตลาดดิจิทัล',
      ),
      activity('online_ads', 'online advertising', 'โฆษณาออนไลน์'),
    ],
  },
  {
    key: 'education_training_consulting',
    en: 'Education, Training & Consulting Services',
    th: 'บริการการศึกษา ฝึกอบรม และที่ปรึกษา',
    legacyFiguresKey: 'education_training',
    terms: [
      activity('training', 'training centre', 'ศูนย์ฝึกอบรม', 'ฝึกอบรม'),
      activity('tutoring', 'tutoring', 'สถาบันกวดวิชา'),
      activity('education', 'education services', 'บริการการศึกษา'),
      activity(
        'consulting',
        'business consulting',
        'management consulting',
        'ที่ปรึกษาธุรกิจ',
        'ที่ปรึกษาด้านการจัดการ',
      ),
    ],
  },
  {
    key: 'travel_tourism_hospitality',
    en: 'Travel, Tourism & Hospitality Services',
    th: 'บริการท่องเที่ยวและที่พัก',
    legacyFiguresKey: 'tourism_travel',
    terms: [
      activity('agency', 'travel agency', 'tour operator', 'บริษัทนำเที่ยว', 'บริษัททัวร์'),
      activity('hotel', 'hotel accommodation', 'โรงแรม', 'บริการที่พัก'),
      activity('tour_packages', 'tour packages', 'แพ็กเกจทัวร์'),
    ],
  },
  {
    key: 'cleaning_laundry_facility',
    en: 'Cleaning, Laundry & Facility Services',
    th: 'บริการทำความสะอาด ซักรีด และดูแลอาคาร',
    legacyFiguresKey: 'laundry_dry_cleaning',
    terms: [
      activity(
        'cleaning',
        'cleaning services',
        'commercial cleaning',
        'บริการทำความสะอาด',
        'รับทำความสะอาดสำนักงาน',
      ),
      activity('laundry', 'laundry service', 'dry cleaning', 'บริการซักรีด', 'ซักแห้ง'),
      activity('facility', 'facility cleaning', 'ทำความสะอาดอาคาร'),
    ],
  },
  {
    key: 'general_other',
    en: 'General / Other Business',
    th: 'ธุรกิจทั่วไป / อื่น ๆ',
    legacyFiguresKey: null,
    terms: [],
  },
] as const;

export const primaryCategory = (key: string | null | undefined) =>
  PRIMARY_CATEGORIES.find((item) => item.key === key) ?? null;

/** Explicit compatibility map; legacy keys remain valid on historical/manual records. */
export const LEGACY_CATEGORY_CROSSWALK: Readonly<Record<string, { key: string; reason: string }>> =
  {
    animal_feed: { key: 'pet_animal_feed', reason: 'animal feed product' },
    household_products: { key: 'household_office_kitchen', reason: 'household goods' },
    cleaning_products: {
      key: 'household_office_kitchen',
      reason: 'cleaning products as goods, not services',
    },
    pet_shop: { key: 'pet_animal_feed', reason: 'pet products' },
    hardware_industrial: { key: 'hardware_industrial_materials', reason: 'hardware supplies' },
    baby_children: { key: 'baby_children_educational_products', reason: 'child products' },
    fashion_accessories: { key: 'clothing_fashion_accessories', reason: 'fashion goods' },
    beauty_products: {
      key: 'beauty_cosmetics_products',
      reason: 'beauty products rather than salon',
    },
    motorcycle_parts: { key: 'automotive_parts_trading', reason: 'vehicle parts' },
    food_products: { key: 'food_agricultural_trading', reason: 'food products' },
    seafood: { key: 'food_agricultural_trading', reason: 'seafood products' },
    car_accessories: { key: 'automotive_parts_trading', reason: 'car parts and accessories' },
    educational_toys: { key: 'baby_children_educational_products', reason: 'learning products' },
    stationery_office: { key: 'household_office_kitchen', reason: 'office supplies' },
    it_house: { key: 'electronics_device_trading', reason: 'electronics goods' },
    restaurant_catering: { key: 'restaurant_cafe_catering', reason: 'food service' },
    software_it_services: { key: 'software_it_digital', reason: 'IT services' },
    construction_renovation: {
      key: 'construction_installation_services',
      reason: 'contracting service',
    },
    furniture_home: { key: 'furniture_furnishings', reason: 'furniture goods' },
    medical_health_products: { key: 'medical_health_products', reason: 'medical products' },
    tourism_travel: { key: 'travel_tourism_hospitality', reason: 'travel service' },
    education_training: { key: 'education_training_consulting', reason: 'education service' },
    business_consulting: { key: 'education_training_consulting', reason: 'consulting service' },
    fruit_vegetables: { key: 'food_agricultural_trading', reason: 'fresh produce trading' },
    hair_salon: { key: 'hair_beauty_services', reason: 'salon service' },
    home_kitchen_supplies: {
      key: 'household_office_kitchen',
      reason: 'office and kitchen supplies',
    },
    mobile_repair: { key: 'electronics_device_repair', reason: 'repair service' },
    clothing_apparel: { key: 'clothing_fashion_accessories', reason: 'clothing goods' },
    convenience_store: { key: 'general_retail_convenience', reason: 'convenience retail' },
    coffee_beverage: { key: 'restaurant_cafe_catering', reason: 'cafe service' },
    bakery_dessert: { key: 'restaurant_cafe_catering', reason: 'bakery service' },
    logistics_delivery: { key: 'logistics_transport', reason: 'transport service' },
    import_export: { key: 'general_other', reason: 'trade mode alone does not reveal products' },
    packaging_materials: {
      key: 'hardware_industrial_materials',
      reason: 'packaging supplies; actual production needs reclassification',
    },
    printing_signage: { key: 'printing_signage', reason: 'printing production' },
    manufacturing: { key: 'manufacturing_production', reason: 'actual manufacturing' },
    car_repair: { key: 'automotive_repair_services', reason: 'vehicle repair service' },
    laundry_dry_cleaning: { key: 'cleaning_laundry_facility', reason: 'laundry service' },
    digital_marketing: { key: 'software_it_digital', reason: 'digital service' },
    agriculture_farming: {
      key: 'food_agricultural_trading',
      reason: 'agricultural product; activity should be reclassified from text',
    },
  };
