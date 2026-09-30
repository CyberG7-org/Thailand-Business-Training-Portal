-- P17a: the shared concept registry (spec 2026-09-30 §7.1; decisions D72, D76, D78). The 30 MCQ
-- concepts and the 13 chatbot slots are fixed product decisions; the rows mirror
-- lib/domain/concepts/registry.ts and tests/integration/evaluation-concepts.test.ts holds the two
-- equal. Staff read it; nobody writes it outside a migration.

create table public.evaluation_concepts (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,59}$'),
  domain text not null check (domain in
    ('identity', 'authority', 'ownership', 'business', 'financial', 'funds', 'banking', 'kyc', 'attendance')),
  source text not null check (source in ('DBD_FACT', 'BUSINESS_PROFILE', 'DERIVED', 'ROLE', 'KYC_POLICY')),
  facts text[] not null default '{}',
  answer_type text not null check (answer_type in
    ('name', 'id', 'date', 'address', 'count', 'names', 'text', 'money', 'shareholding', 'open_text', 'static')),
  mcq_order smallint unique check (mcq_order between 1 and 30),
  critical boolean not null default false,
  interview_slot smallint unique check (interview_slot between 1 and 13),
  interview_match text check (interview_match in ('exact', 'normalized', 'structured', 'semantic')),
  alternate_when text[] not null default '{}',
  title_th text not null,
  title_en text not null,
  title_zh text not null,
  -- Only an MCQ concept can be critical (D72).
  check (not critical or mcq_order is not null),
  -- A slot always has its grading tier, and a tier only belongs to a slot.
  check ((interview_slot is null) = (interview_match is null)),
  -- AI semantic grading only on open-text concepts (D78).
  check (interview_match is distinct from 'semantic' or answer_type = 'open_text'),
  -- KYC policy answers read no company fact, so they never raise a missing-fact exception (D74).
  check ((source = 'KYC_POLICY') = (cardinality(facts) = 0))
);

alter table public.evaluation_concepts enable row level security;

create policy "evaluation concepts: staff read" on public.evaluation_concepts
  for select to authenticated using (public.is_staff());

insert into public.evaluation_concepts
  (key, domain, source, facts, answer_type, mcq_order, critical, interview_slot, interview_match,
   alternate_when, title_th, title_en, title_zh)
values
  ('company_name', 'identity', 'DBD_FACT', array['company_name_th']::text[], 'name', 1, true, 1, 'normalized', '{}'::text[], 'ชื่อบริษัท', 'Company name', '公司名称'),
  ('registration_number', 'identity', 'DBD_FACT', array['juristic_id']::text[], 'id', 2, true, 2, 'exact', '{}'::text[], 'เลขทะเบียนนิติบุคคล', 'Juristic registration number', '法人注册号'),
  ('registration_date', 'identity', 'DBD_FACT', array['registered_on']::text[], 'date', 3, true, 8, 'normalized', '{}'::text[], 'วันที่จดทะเบียนบริษัท', 'Registration date', '公司注册日期'),
  ('registered_location', 'identity', 'DBD_FACT', array['address']::text[], 'address', 4, true, null, null, '{}'::text[], 'ที่ตั้งสำนักงานที่จดทะเบียน', 'Registered office location', '注册办公地点'),
  ('director_count', 'authority', 'DERIVED', array['directors']::text[], 'count', 5, true, null, null, '{}'::text[], 'จำนวนกรรมการ', 'Number of directors', '董事人数'),
  ('director_identity', 'authority', 'DBD_FACT', array['directors']::text[], 'names', 6, true, null, null, '{}'::text[], 'รายชื่อกรรมการ', 'Registered directors', '注册董事'),
  ('signing_authority', 'authority', 'DBD_FACT', array['signing_authority']::text[], 'text', 7, true, null, null, '{}'::text[], 'อำนาจกรรมการลงนาม', 'Company signing authority', '公司签字权'),
  ('registered_capital', 'ownership', 'DBD_FACT', array['registered_capital']::text[], 'money', 8, true, null, null, '{}'::text[], 'ทุนจดทะเบียน', 'Registered capital', '注册资本'),
  ('shareholder_count', 'ownership', 'DERIVED', array['shareholders']::text[], 'count', 9, false, null, null, '{}'::text[], 'จำนวนผู้ถือหุ้น', 'Number of shareholders', '股东人数'),
  ('learner_shareholding', 'ownership', 'ROLE', array['holder_name', 'shareholders']::text[], 'shareholding', 10, false, null, null, array['learner_is_shareholder']::text[], 'หุ้นที่ผู้เรียนถือ', 'Learner''s shareholding', '学员持股情况'),
  ('actual_business', 'business', 'BUSINESS_PROFILE', array['nature_of_business']::text[], 'open_text', 11, true, 4, 'semantic', '{}'::text[], 'ธุรกิจหลักที่ทำจริง', 'Actual main business', '实际主营业务'),
  ('products_services', 'business', 'BUSINESS_PROFILE', array['products_services']::text[], 'open_text', 12, false, 5, 'semantic', '{}'::text[], 'สินค้าหรือบริการ', 'Products or services', '产品或服务'),
  ('business_purpose', 'business', 'BUSINESS_PROFILE', array['business_purpose']::text[], 'open_text', 13, false, null, null, '{}'::text[], 'เหตุผลที่ตั้งบริษัท', 'Why the company was established', '公司成立原因'),
  ('main_clients', 'business', 'BUSINESS_PROFILE', array['main_clients']::text[], 'open_text', 14, false, 10, 'semantic', array['has_existing_customers']::text[], 'ลูกค้าหลัก', 'Main customers', '主要客户'),
  ('client_origin', 'business', 'BUSINESS_PROFILE', array['client_origin']::text[], 'open_text', 15, false, null, null, array['has_existing_customers']::text[], 'ที่มาของลูกค้า', 'Where customers come from', '客户来源'),
  ('main_suppliers', 'business', 'BUSINESS_PROFILE', array['main_suppliers']::text[], 'open_text', 16, false, null, null, array['has_regular_suppliers']::text[], 'ซัพพลายเออร์หลัก', 'Main suppliers', '主要供应商'),
  ('actual_business_location', 'business', 'BUSINESS_PROFILE', array['business_address']::text[], 'text', 17, false, null, null, array['operations_started']::text[], 'สถานที่ประกอบกิจการจริง', 'Actual place of business', '实际经营地点'),
  ('monthly_revenue', 'financial', 'BUSINESS_PROFILE', array['monthly_revenue']::text[], 'text', 18, false, null, null, array['operations_started']::text[], 'รายได้ต่อเดือนโดยประมาณ', 'Estimated monthly revenue', '预计月收入'),
  ('revenue_basis', 'financial', 'BUSINESS_PROFILE', array['revenue_basis']::text[], 'open_text', 19, false, null, null, array['operations_started']::text[], 'ที่มาของการประมาณรายได้', 'Basis of the revenue estimate', '收入估算依据'),
  ('average_transaction', 'financial', 'BUSINESS_PROFILE', array['average_transaction']::text[], 'text', 20, false, null, null, array['has_completed_transactions']::text[], 'ยอดธุรกรรมเฉลี่ยต่อครั้ง', 'Average transaction amount', '平均每笔交易金额'),
  ('monthly_transactions', 'financial', 'BUSINESS_PROFILE', array['monthly_transactions']::text[], 'text', 21, false, null, null, array['has_completed_transactions']::text[], 'จำนวนธุรกรรมต่อเดือน', 'Transactions per month', '每月交易笔数'),
  ('startup_source_of_funds', 'funds', 'BUSINESS_PROFILE', array['source_of_funds']::text[], 'open_text', 22, false, null, null, '{}'::text[], 'ที่มาของเงินทุนเริ่มต้น', 'Source of start-up capital', '启动资金来源'),
  ('first_incoming_funds', 'funds', 'BUSINESS_PROFILE', array['first_incoming_funds']::text[], 'open_text', 23, false, null, null, '{}'::text[], 'ที่มาและวัตถุประสงค์ของเงินเข้าก้อนแรก', 'Source and purpose of the first incoming funds', '首笔入账资金的来源与用途'),
  ('bank_account_purpose', 'banking', 'BUSINESS_PROFILE', array['account_purpose']::text[], 'open_text', 24, false, null, null, '{}'::text[], 'เหตุผลที่ต้องมีบัญชีบริษัท', 'Why the company needs a bank account', '公司开户原因'),
  ('promptpay_qr_purpose', 'banking', 'BUSINESS_PROFILE', array['promptpay_qr_purpose']::text[], 'open_text', 25, false, null, null, '{}'::text[], 'เหตุผลที่ต้องใช้พร้อมเพย์หรือ QR', 'Why PromptPay / QR is needed', '需要 PromptPay / QR 的原因'),
  ('internet_banking_control', 'kyc', 'KYC_POLICY', '{}'::text[], 'static', 26, false, null, null, '{}'::text[], 'ผู้ควบคุมอินเทอร์เน็ตแบงกิ้ง', 'Who controls internet banking', '网上银行由谁控制'),
  ('otp_control', 'kyc', 'KYC_POLICY', '{}'::text[], 'static', 27, false, null, null, '{}'::text[], 'ผู้ควบคุม OTP', 'Who controls the OTP', 'OTP 由谁控制'),
  ('transaction_explanation', 'kyc', 'KYC_POLICY', '{}'::text[], 'static', 28, false, null, null, '{}'::text[], 'การอธิบายที่มาและวัตถุประสงค์ของธุรกรรม', 'Explaining the source and purpose of transactions', '说明交易的来源与商业目的'),
  ('supporting_documents', 'kyc', 'KYC_POLICY', '{}'::text[], 'static', 29, false, null, null, '{}'::text[], 'เอกสารประกอบและใบแจ้งหนี้', 'Supporting documents and invoices', '证明文件与发票'),
  ('answer_consistency', 'kyc', 'KYC_POLICY', '{}'::text[], 'static', 30, false, null, null, '{}'::text[], 'ความสอดคล้องกับข้อมูลและเอกสารของบริษัท', 'Consistency with company facts and documents', '与公司信息及文件保持一致'),
  ('registered_address', 'identity', 'DBD_FACT', array['address']::text[], 'address', null, false, 3, 'structured', '{}'::text[], 'ที่อยู่ที่จดทะเบียน', 'Registered address', '注册地址'),
  ('authorized_representative', 'authority', 'DBD_FACT', array['directors', 'signing_authority']::text[], 'names', null, false, 6, 'structured', '{}'::text[], 'ผู้มีอำนาจลงนามแทนบริษัท', 'Authorised representative', '授权代表'),
  ('attendee_identity', 'attendance', 'ROLE', array['holder_name']::text[], 'name', null, false, 7, 'normalized', '{}'::text[], 'ผู้ที่มาติดต่อธนาคาร', 'Who is attending', '到场人员身份'),
  ('account_purpose', 'banking', 'BUSINESS_PROFILE', array['account_purpose']::text[], 'open_text', null, false, 9, 'semantic', '{}'::text[], 'วัตถุประสงค์ของการเปิดบัญชี', 'Purpose of the account', '开户目的'),
  ('customer_examples', 'business', 'BUSINESS_PROFILE', array['customer_examples']::text[], 'open_text', null, false, 11, 'semantic', array['has_existing_customers']::text[], 'ตัวอย่างลูกค้า', 'Customer examples', '客户示例'),
  ('customer_profile', 'business', 'BUSINESS_PROFILE', array['customer_profile']::text[], 'open_text', null, false, 12, 'semantic', array['has_existing_customers']::text[], 'ลักษณะของลูกค้า', 'Customer profile', '客户概况'),
  ('transaction_details', 'financial', 'BUSINESS_PROFILE', array['transaction_details']::text[], 'open_text', null, false, 13, 'semantic', array['has_completed_transactions']::text[], 'รายละเอียดการซื้อขายและการชำระเงิน', 'Transaction details', '交易与付款详情');
