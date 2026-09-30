import type { FactKey, StatusFact } from '@/lib/domain/facts/fact-sheet';

/**
 * The shared concept registry (spec 2026-09-30 §7; decisions D72, D76, D78). One row per concept
 * either evaluation asks about: the 30 MCQ concepts are fixed product decisions, the 13 chatbot
 * slots are fixed in the Owner's order. `supabase/migrations/20261001030000_evaluation_concepts.sql`
 * seeds the same rows and `tests/integration/evaluation-concepts.test.ts` holds the two equal.
 */
export const CONCEPT_SOURCES = [
  'DBD_FACT',
  'BUSINESS_PROFILE',
  'DERIVED',
  'ROLE',
  'KYC_POLICY',
] as const;
export type ConceptSource = (typeof CONCEPT_SOURCES)[number];

export const CONCEPT_DOMAINS = [
  'identity',
  'authority',
  'ownership',
  'business',
  'financial',
  'funds',
  'banking',
  'kyc',
  'attendance',
] as const;
export type ConceptDomain = (typeof CONCEPT_DOMAINS)[number];

export const ANSWER_TYPES = [
  'name',
  'id',
  'date',
  'address',
  'count',
  'names',
  'text',
  'money',
  'shareholding',
  'open_text',
  'static',
] as const;
export type AnswerType = (typeof ANSWER_TYPES)[number];

export const MATCH_TYPES = ['exact', 'normalized', 'structured', 'semantic'] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

export type ConceptDef = {
  key: string;
  domain: ConceptDomain;
  source: ConceptSource;
  /** Facts that must be present for the concept to resolve (spec §7.3). */
  facts: readonly FactKey[];
  answer: AnswerType;
  /** 1–30: position in the MCQ; null = chatbot only. */
  mcqOrder: number | null;
  critical: boolean;
  /** 1–13: chatbot slot; null = MCQ only. */
  interviewSlot: number | null;
  interviewMatch: MatchType | null;
  /** Status facts that select alternate wording; they must be set for the concept to resolve. */
  alternateWhen: readonly StatusFact[];
  title: { th: string; en: string; zh: string };
};

type Row = Omit<ConceptDef, 'critical' | 'interviewSlot' | 'interviewMatch' | 'alternateWhen'> &
  Partial<Pick<ConceptDef, 'critical' | 'interviewSlot' | 'interviewMatch' | 'alternateWhen'>>;

const row = (r: Row): ConceptDef => ({
  critical: false,
  interviewSlot: null,
  interviewMatch: null,
  alternateWhen: [],
  ...r,
});

export const EVALUATION_CONCEPTS: readonly ConceptDef[] = [
  row({
    key: 'company_name',
    domain: 'identity',
    source: 'DBD_FACT',
    facts: ['company_name_th'],
    answer: 'name',
    mcqOrder: 1,
    critical: true,
    interviewSlot: 1,
    interviewMatch: 'normalized',
    title: { th: 'ชื่อบริษัท', en: 'Company name', zh: '公司名称' },
  }),
  row({
    key: 'registration_number',
    domain: 'identity',
    source: 'DBD_FACT',
    facts: ['juristic_id'],
    answer: 'id',
    mcqOrder: 2,
    critical: true,
    interviewSlot: 2,
    interviewMatch: 'exact',
    title: { th: 'เลขทะเบียนนิติบุคคล', en: 'Juristic registration number', zh: '法人注册号' },
  }),
  row({
    key: 'registration_date',
    domain: 'identity',
    source: 'DBD_FACT',
    facts: ['registered_on'],
    answer: 'date',
    mcqOrder: 3,
    critical: true,
    interviewSlot: 8,
    interviewMatch: 'normalized',
    title: { th: 'วันที่จดทะเบียนบริษัท', en: 'Registration date', zh: '公司注册日期' },
  }),
  row({
    key: 'registered_location',
    domain: 'identity',
    source: 'DBD_FACT',
    facts: ['address'],
    answer: 'address',
    mcqOrder: 4,
    critical: true,
    title: {
      th: 'ที่ตั้งสำนักงานที่จดทะเบียน',
      en: 'Registered office location',
      zh: '注册办公地点',
    },
  }),
  row({
    key: 'director_count',
    domain: 'authority',
    source: 'DERIVED',
    facts: ['directors'],
    answer: 'count',
    mcqOrder: 5,
    critical: true,
    title: { th: 'จำนวนกรรมการ', en: 'Number of directors', zh: '董事人数' },
  }),
  row({
    key: 'director_identity',
    domain: 'authority',
    source: 'DBD_FACT',
    facts: ['directors'],
    answer: 'names',
    mcqOrder: 6,
    critical: true,
    title: { th: 'รายชื่อกรรมการ', en: 'Registered directors', zh: '注册董事' },
  }),
  row({
    key: 'signing_authority',
    domain: 'authority',
    source: 'DBD_FACT',
    facts: ['signing_authority'],
    answer: 'text',
    mcqOrder: 7,
    critical: true,
    title: { th: 'อำนาจกรรมการลงนาม', en: 'Company signing authority', zh: '公司签字权' },
  }),
  row({
    key: 'registered_capital',
    domain: 'ownership',
    source: 'DBD_FACT',
    facts: ['registered_capital'],
    answer: 'money',
    mcqOrder: 8,
    critical: true,
    title: { th: 'ทุนจดทะเบียน', en: 'Registered capital', zh: '注册资本' },
  }),
  row({
    key: 'shareholder_count',
    domain: 'ownership',
    source: 'DERIVED',
    facts: ['shareholders'],
    answer: 'count',
    mcqOrder: 9,
    title: { th: 'จำนวนผู้ถือหุ้น', en: 'Number of shareholders', zh: '股东人数' },
  }),
  row({
    key: 'learner_shareholding',
    domain: 'ownership',
    source: 'ROLE',
    facts: ['holder_name', 'shareholders'],
    answer: 'shareholding',
    mcqOrder: 10,
    alternateWhen: ['learner_is_shareholder'],
    title: { th: 'หุ้นที่ผู้เรียนถือ', en: "Learner's shareholding", zh: '学员持股情况' },
  }),
  row({
    key: 'actual_business',
    domain: 'business',
    source: 'BUSINESS_PROFILE',
    facts: ['nature_of_business'],
    answer: 'open_text',
    mcqOrder: 11,
    critical: true,
    interviewSlot: 4,
    interviewMatch: 'semantic',
    title: { th: 'ธุรกิจหลักที่ทำจริง', en: 'Actual main business', zh: '实际主营业务' },
  }),
  row({
    key: 'products_services',
    domain: 'business',
    source: 'BUSINESS_PROFILE',
    facts: ['products_services'],
    answer: 'open_text',
    mcqOrder: 12,
    interviewSlot: 5,
    interviewMatch: 'semantic',
    title: { th: 'สินค้าหรือบริการ', en: 'Products or services', zh: '产品或服务' },
  }),
  row({
    key: 'business_purpose',
    domain: 'business',
    source: 'BUSINESS_PROFILE',
    facts: ['business_purpose'],
    answer: 'open_text',
    mcqOrder: 13,
    title: { th: 'เหตุผลที่ตั้งบริษัท', en: 'Why the company was established', zh: '公司成立原因' },
  }),
  row({
    key: 'main_clients',
    domain: 'business',
    source: 'BUSINESS_PROFILE',
    facts: ['main_clients'],
    answer: 'open_text',
    mcqOrder: 14,
    interviewSlot: 10,
    interviewMatch: 'semantic',
    alternateWhen: ['has_existing_customers'],
    title: { th: 'ลูกค้าหลัก', en: 'Main customers', zh: '主要客户' },
  }),
  row({
    key: 'client_origin',
    domain: 'business',
    source: 'BUSINESS_PROFILE',
    facts: ['client_origin'],
    answer: 'open_text',
    mcqOrder: 15,
    alternateWhen: ['has_existing_customers'],
    title: { th: 'ที่มาของลูกค้า', en: 'Where customers come from', zh: '客户来源' },
  }),
  row({
    key: 'main_suppliers',
    domain: 'business',
    source: 'BUSINESS_PROFILE',
    facts: ['main_suppliers'],
    answer: 'open_text',
    mcqOrder: 16,
    alternateWhen: ['has_regular_suppliers'],
    title: { th: 'ซัพพลายเออร์หลัก', en: 'Main suppliers', zh: '主要供应商' },
  }),
  row({
    key: 'actual_business_location',
    domain: 'business',
    source: 'BUSINESS_PROFILE',
    facts: ['business_address'],
    answer: 'text',
    mcqOrder: 17,
    alternateWhen: ['operations_started'],
    title: { th: 'สถานที่ประกอบกิจการจริง', en: 'Actual place of business', zh: '实际经营地点' },
  }),
  row({
    key: 'monthly_revenue',
    domain: 'financial',
    source: 'BUSINESS_PROFILE',
    facts: ['monthly_revenue'],
    answer: 'text',
    mcqOrder: 18,
    alternateWhen: ['operations_started'],
    title: { th: 'รายได้ต่อเดือนโดยประมาณ', en: 'Estimated monthly revenue', zh: '预计月收入' },
  }),
  row({
    key: 'revenue_basis',
    domain: 'financial',
    source: 'BUSINESS_PROFILE',
    facts: ['revenue_basis'],
    answer: 'open_text',
    mcqOrder: 19,
    alternateWhen: ['operations_started'],
    title: {
      th: 'ที่มาของการประมาณรายได้',
      en: 'Basis of the revenue estimate',
      zh: '收入估算依据',
    },
  }),
  row({
    key: 'average_transaction',
    domain: 'financial',
    source: 'BUSINESS_PROFILE',
    facts: ['average_transaction'],
    answer: 'text',
    mcqOrder: 20,
    alternateWhen: ['has_completed_transactions'],
    title: {
      th: 'ยอดธุรกรรมเฉลี่ยต่อครั้ง',
      en: 'Average transaction amount',
      zh: '平均每笔交易金额',
    },
  }),
  row({
    key: 'monthly_transactions',
    domain: 'financial',
    source: 'BUSINESS_PROFILE',
    facts: ['monthly_transactions'],
    answer: 'text',
    mcqOrder: 21,
    alternateWhen: ['has_completed_transactions'],
    title: { th: 'จำนวนธุรกรรมต่อเดือน', en: 'Transactions per month', zh: '每月交易笔数' },
  }),
  row({
    key: 'startup_source_of_funds',
    domain: 'funds',
    source: 'BUSINESS_PROFILE',
    facts: ['source_of_funds'],
    answer: 'open_text',
    mcqOrder: 22,
    title: { th: 'ที่มาของเงินทุนเริ่มต้น', en: 'Source of start-up capital', zh: '启动资金来源' },
  }),
  row({
    key: 'first_incoming_funds',
    domain: 'funds',
    source: 'BUSINESS_PROFILE',
    facts: ['first_incoming_funds'],
    answer: 'open_text',
    mcqOrder: 23,
    title: {
      th: 'ที่มาและวัตถุประสงค์ของเงินเข้าก้อนแรก',
      en: 'Source and purpose of the first incoming funds',
      zh: '首笔入账资金的来源与用途',
    },
  }),
  row({
    key: 'bank_account_purpose',
    domain: 'banking',
    source: 'BUSINESS_PROFILE',
    facts: ['account_purpose'],
    answer: 'open_text',
    mcqOrder: 24,
    title: {
      th: 'เหตุผลที่ต้องมีบัญชีบริษัท',
      en: 'Why the company needs a bank account',
      zh: '公司开户原因',
    },
  }),
  row({
    key: 'promptpay_qr_purpose',
    domain: 'banking',
    source: 'BUSINESS_PROFILE',
    facts: ['promptpay_qr_purpose'],
    answer: 'open_text',
    mcqOrder: 25,
    title: {
      th: 'เหตุผลที่ต้องใช้พร้อมเพย์หรือ QR',
      en: 'Why PromptPay / QR is needed',
      zh: '需要 PromptPay / QR 的原因',
    },
  }),
  row({
    key: 'internet_banking_control',
    domain: 'kyc',
    source: 'KYC_POLICY',
    facts: [],
    answer: 'static',
    mcqOrder: 26,
    title: {
      th: 'ผู้ควบคุมอินเทอร์เน็ตแบงกิ้ง',
      en: 'Who controls internet banking',
      zh: '网上银行由谁控制',
    },
  }),
  row({
    key: 'otp_control',
    domain: 'kyc',
    source: 'KYC_POLICY',
    facts: [],
    answer: 'static',
    mcqOrder: 27,
    title: { th: 'ผู้ควบคุม OTP', en: 'Who controls the OTP', zh: 'OTP 由谁控制' },
  }),
  row({
    key: 'transaction_explanation',
    domain: 'kyc',
    source: 'KYC_POLICY',
    facts: [],
    answer: 'static',
    mcqOrder: 28,
    title: {
      th: 'การอธิบายที่มาและวัตถุประสงค์ของธุรกรรม',
      en: 'Explaining the source and purpose of transactions',
      zh: '说明交易的来源与商业目的',
    },
  }),
  row({
    key: 'supporting_documents',
    domain: 'kyc',
    source: 'KYC_POLICY',
    facts: [],
    answer: 'static',
    mcqOrder: 29,
    title: {
      th: 'เอกสารประกอบและใบแจ้งหนี้',
      en: 'Supporting documents and invoices',
      zh: '证明文件与发票',
    },
  }),
  row({
    key: 'answer_consistency',
    domain: 'kyc',
    source: 'KYC_POLICY',
    facts: [],
    answer: 'static',
    mcqOrder: 30,
    title: {
      th: 'ความสอดคล้องกับข้อมูลและเอกสารของบริษัท',
      en: 'Consistency with company facts and documents',
      zh: '与公司信息及文件保持一致',
    },
  }),
  row({
    key: 'registered_address',
    domain: 'identity',
    source: 'DBD_FACT',
    facts: ['address'],
    answer: 'address',
    mcqOrder: null,
    interviewSlot: 3,
    interviewMatch: 'structured',
    title: { th: 'ที่อยู่ที่จดทะเบียน', en: 'Registered address', zh: '注册地址' },
  }),
  row({
    key: 'authorized_representative',
    domain: 'authority',
    source: 'DBD_FACT',
    facts: ['directors', 'signing_authority'],
    answer: 'names',
    mcqOrder: null,
    interviewSlot: 6,
    interviewMatch: 'structured',
    title: { th: 'ผู้มีอำนาจลงนามแทนบริษัท', en: 'Authorised representative', zh: '授权代表' },
  }),
  row({
    key: 'attendee_identity',
    domain: 'attendance',
    source: 'ROLE',
    facts: ['holder_name'],
    answer: 'name',
    mcqOrder: null,
    interviewSlot: 7,
    interviewMatch: 'normalized',
    title: { th: 'ผู้ที่มาติดต่อธนาคาร', en: 'Who is attending', zh: '到场人员身份' },
  }),
  row({
    key: 'account_purpose',
    domain: 'banking',
    source: 'BUSINESS_PROFILE',
    facts: ['account_purpose'],
    answer: 'open_text',
    mcqOrder: null,
    interviewSlot: 9,
    interviewMatch: 'semantic',
    title: { th: 'วัตถุประสงค์ของการเปิดบัญชี', en: 'Purpose of the account', zh: '开户目的' },
  }),
  row({
    key: 'customer_examples',
    domain: 'business',
    source: 'BUSINESS_PROFILE',
    facts: ['customer_examples'],
    answer: 'open_text',
    mcqOrder: null,
    interviewSlot: 11,
    interviewMatch: 'semantic',
    alternateWhen: ['has_existing_customers'],
    title: { th: 'ตัวอย่างลูกค้า', en: 'Customer examples', zh: '客户示例' },
  }),
  row({
    key: 'customer_profile',
    domain: 'business',
    source: 'BUSINESS_PROFILE',
    facts: ['customer_profile'],
    answer: 'open_text',
    mcqOrder: null,
    interviewSlot: 12,
    interviewMatch: 'semantic',
    alternateWhen: ['has_existing_customers'],
    title: { th: 'ลักษณะของลูกค้า', en: 'Customer profile', zh: '客户概况' },
  }),
  row({
    key: 'transaction_details',
    domain: 'financial',
    source: 'BUSINESS_PROFILE',
    facts: ['transaction_details'],
    answer: 'open_text',
    mcqOrder: null,
    interviewSlot: 13,
    interviewMatch: 'semantic',
    alternateWhen: ['has_completed_transactions'],
    title: {
      th: 'รายละเอียดการซื้อขายและการชำระเงิน',
      en: 'Transaction details',
      zh: '交易与付款详情',
    },
  }),
];

export const MCQ_CONCEPTS: readonly ConceptDef[] = EVALUATION_CONCEPTS.filter(
  (c) => c.mcqOrder !== null,
).sort((a, b) => (a.mcqOrder ?? 0) - (b.mcqOrder ?? 0));

export const INTERVIEW_CONCEPTS: readonly ConceptDef[] = EVALUATION_CONCEPTS.filter(
  (c) => c.interviewSlot !== null,
).sort((a, b) => (a.interviewSlot ?? 0) - (b.interviewSlot ?? 0));

export const CRITICAL_CONCEPT_KEYS: readonly string[] = MCQ_CONCEPTS.filter((c) => c.critical).map(
  (c) => c.key,
);

export function conceptTitle(key: string, locale: string): string {
  const def = EVALUATION_CONCEPTS.find((c) => c.key === key);
  if (!def) return key;
  return locale === 'en' ? def.title.en : locale === 'zh' ? def.title.zh : def.title.th;
}
