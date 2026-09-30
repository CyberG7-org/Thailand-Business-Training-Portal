-- P17a: the Owner's controlled business categories (spec 2026-09-30 §5.3, decision D73). They feed
-- BUSINESS_ALTERNATIVE distractors (P17d) and the automatic mapping of `nature_of_business`.
-- The seed is a draft for the Owner to edit in Admin → Business categories.

create table public.business_categories (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,59}$'),
  label_th text not null check (length(trim(label_th)) > 0),
  label_en text not null check (length(trim(label_en)) > 0),
  label_zh text not null check (length(trim(label_zh)) > 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger business_categories_set_updated_at
  before update on public.business_categories
  for each row execute function public.set_updated_at();

create trigger business_categories_audit
  after insert or update or delete on public.business_categories
  for each row execute function public.audit_row_change();

alter table public.business_categories enable row level security;

-- Staff read the dictionary; only the Owner edits it, through their own session so the audit
-- names them (D30). Nothing deletes a key: a category is retired by switching it off, because
-- stored mappings and future questions refer to it.
create policy "business categories: staff read" on public.business_categories
  for select to authenticated using (public.is_staff());
create policy "business categories: owner inserts" on public.business_categories
  for insert to authenticated with check (public.is_admin());
create policy "business categories: owner updates" on public.business_categories
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.business_categories (key, label_th, label_en, label_zh, sort_order) values
  ('clothing_fashion', 'ค้าส่งและค้าปลีกเสื้อผ้าและเครื่องแต่งกาย', 'Clothing and apparel wholesale and retail', '服装批发与零售', 10),
  ('cosmetics_beauty', 'ค้าเครื่องสำอางและผลิตภัณฑ์ความงาม', 'Cosmetics and beauty products', '化妆品与美容产品', 20),
  ('food_beverage_trade', 'ค้าส่งและค้าปลีกอาหารและเครื่องดื่ม', 'Food and beverage wholesale and retail', '食品饮料批发零售', 30),
  ('restaurant_catering', 'ร้านอาหารและบริการจัดเลี้ยง', 'Restaurants and catering', '餐饮与宴会服务', 40),
  ('electronics_it_equipment', 'ค้าเครื่องใช้ไฟฟ้า อุปกรณ์อิเล็กทรอนิกส์และคอมพิวเตอร์', 'Electronics, appliances and computer equipment', '电子电器与电脑设备', 50),
  ('software_it_services', 'บริการซอฟต์แวร์และเทคโนโลยีสารสนเทศ', 'Software and IT services', '软件与信息技术服务', 60),
  ('construction_contracting', 'รับเหมาก่อสร้างและตกแต่ง', 'Construction and renovation contracting', '建筑与装修承包', 70),
  ('building_materials', 'ค้าวัสดุก่อสร้าง', 'Building materials trading', '建材贸易', 80),
  ('real_estate', 'พัฒนาและบริหารอสังหาริมทรัพย์', 'Real estate development and management', '房地产开发与管理', 90),
  ('logistics_transport', 'ขนส่งและโลจิสติกส์', 'Transport and logistics', '运输与物流', 100),
  ('import_export_general', 'นำเข้าและส่งออกสินค้าทั่วไป', 'General import and export trading', '一般进出口贸易', 110),
  ('agriculture_produce', 'ค้าผลผลิตและสินค้าเกษตร', 'Agricultural produce trading', '农产品贸易', 120),
  ('jewelry_gems_gold', 'ค้าอัญมณี เครื่องประดับและทองคำ', 'Jewellery, gems and gold', '珠宝、宝石与黄金', 130),
  ('auto_parts_vehicles', 'ค้ายานยนต์และอะไหล่', 'Vehicles and auto parts', '汽车与汽车零部件', 140),
  ('furniture_home', 'ค้าเฟอร์นิเจอร์และของใช้ในบ้าน', 'Furniture and household goods', '家具与家居用品', 150),
  ('health_medical', 'ค้าอุปกรณ์การแพทย์และผลิตภัณฑ์สุขภาพ', 'Medical supplies and health products', '医疗用品与健康产品', 160),
  ('tourism_travel', 'ท่องเที่ยวและบริการนำเที่ยว', 'Tourism and travel services', '旅游与导游服务', 170),
  ('education_training', 'การศึกษาและฝึกอบรม', 'Education and training', '教育与培训', 180),
  ('consulting_services', 'บริการที่ปรึกษาธุรกิจ', 'Business consulting services', '商业咨询服务', 190),
  ('marketing_advertising', 'การตลาด โฆษณาและสิ่งพิมพ์', 'Marketing, advertising and printing', '市场营销、广告与印刷', 200),
  ('cleaning_facility', 'บริการทำความสะอาดและดูแลอาคาร', 'Cleaning and facility services', '清洁与物业服务', 210),
  ('brokerage_agency', 'ตัวแทนและนายหน้าซื้อขายสินค้า', 'Trading agent and brokerage', '贸易代理与经纪', 220);

-- The automatic mapping is accepted at or above this confidence (percent); below it the
-- candidate waits for review. Seeded with the code default (lib/config/policy-defaults.ts).
insert into public.policy_config (key, value)
values ('business_category_min_confidence_percent', '85'::jsonb)
on conflict (key) do nothing;
