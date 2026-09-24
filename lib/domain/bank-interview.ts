import { z } from 'zod';
import type { BusinessProfile } from './dbd-profile';

/**
 * The bank's account-opening interview, as obtained by the owner's lawyers (2026-09-18,
 * decision D39). Study material, quiz/exam generation and the call script are built around these
 * concepts — never the exact wording, always the same ground.
 */
export type ConceptGroup = 'identity' | 'ownership' | 'business_plan' | 'personal';

export type BankInterviewConcept = {
  id: string;
  group: ConceptGroup;
  question: { th: string; en: string; zh: string };
  /** Placeholders that hold the learner's true answer (empty = judgement/approach question). */
  placeholders: string[];
};

export const BANK_INTERVIEW_CONCEPTS: BankInterviewConcept[] = [
  {
    id: 'company_name',
    group: 'identity',
    question: {
      th: 'บริษัทชื่ออะไร',
      en: "What is the company's name?",
      zh: '公司叫什么名字？',
    },
    placeholders: ['company_name_th', 'company_name_en'],
  },
  {
    id: 'incorporation_date',
    group: 'identity',
    question: {
      th: 'บริษัทจดทะเบียนจัดตั้งเมื่อใด',
      en: 'When was the company incorporated?',
      zh: '公司是什么时候注册成立的？',
    },
    placeholders: ['registered_on'],
  },
  {
    id: 'directors_count',
    group: 'identity',
    question: {
      th: 'บริษัทมีกรรมการกี่คน',
      en: 'How many directors does the company have?',
      zh: '公司有几位董事？',
    },
    placeholders: ['directors_count', 'directors'],
  },
  {
    id: 'registered_address',
    group: 'identity',
    question: {
      th: 'บริษัทจดทะเบียนที่ไหน ที่อยู่จดทะเบียนคือที่ใด',
      en: 'Where is the company registered? What is the registered address?',
      zh: '公司是在哪里注册的？注册地址在哪里？',
    },
    placeholders: ['head_office_address', 'province'],
  },
  {
    id: 'business_activity',
    group: 'business_plan',
    question: {
      th: 'บริษัทประกอบธุรกิจหลักอะไร',
      en: "What is the company's primary business activity?",
      zh: '公司主要从事什么业务？',
    },
    placeholders: ['nature_of_business', 'products_services', 'business_categories', 'objectives'],
  },
  {
    id: 'shareholders_count',
    group: 'ownership',
    question: {
      th: 'บริษัทมีผู้ถือหุ้นกี่คน',
      en: 'How many shareholders does the company have?',
      zh: '公司有几位股东？',
    },
    placeholders: ['shareholders_count', 'shareholders'],
  },
  {
    id: 'my_shareholding',
    group: 'ownership',
    question: {
      th: 'คุณถือหุ้นกี่หุ้น คิดเป็นสัดส่วนเท่าใด',
      en: 'How many shares do you hold? What is your shareholding percentage?',
      zh: '您持有多少股份？占多少比例？',
    },
    placeholders: ['my_shares', 'my_share_percent'],
  },
  {
    id: 'capital_and_shares',
    group: 'ownership',
    question: {
      th: 'ทุนจดทะเบียนของบริษัทคือเท่าใด มีหุ้นทั้งหมดกี่หุ้น',
      en: "What is the company's registered capital? What is the total number of shares?",
      zh: '公司的注册资本是多少？一共有多少股份？',
    },
    placeholders: ['registered_capital', 'total_shares', 'par_value'],
  },
  {
    id: 'other_shareholders',
    group: 'personal',
    question: {
      th: 'คุณรู้จักผู้ถือหุ้นคนอื่นหรือไม่ มีความสัมพันธ์กันอย่างไร',
      en: 'Do you know the other shareholders? What is your relationship with them?',
      zh: '您认识其他股东吗？您和其他股东是什么关系？',
    },
    placeholders: ['my_relationship', 'shareholders'],
  },
  {
    id: 'account_purpose',
    group: 'business_plan',
    question: {
      th: 'บริษัทต้องการเปิดบัญชีธนาคารเพื่ออะไร',
      en: 'Why does the company need to open a bank account?',
      zh: '公司为什么需要开设银行账户？',
    },
    placeholders: ['account_purpose'],
  },
  {
    id: 'monthly_volume',
    group: 'business_plan',
    question: {
      th: 'คาดว่าจะมีเงินเข้าออกต่อเดือนประมาณเท่าใด',
      en: 'What is the projected monthly volume of fund inflows and outflows?',
      zh: '预计每个月的资金进出金额是多少？',
    },
    placeholders: ['monthly_volume'],
  },
  {
    id: 'clients_suppliers',
    group: 'business_plan',
    question: {
      th: 'ลูกค้าหลักและซัพพลายเออร์หลักของบริษัทอยู่ที่ไหน',
      en: "Where are the company's main clients and suppliers located?",
      zh: '公司的主要客户和供应商来自哪里？',
    },
    placeholders: ['clients_location', 'suppliers_location'],
  },
  {
    id: 'source_of_funds',
    group: 'business_plan',
    question: {
      th: 'แหล่งที่มาของเงินทุนของบริษัทคืออะไร',
      en: "What is the source of the company's funds?",
      zh: '公司的资金来源是什么？',
    },
    placeholders: ['source_of_funds'],
  },
  {
    id: 'my_position',
    group: 'personal',
    question: {
      th: 'คุณดำรงตำแหน่งอะไรในบริษัท รับผิดชอบงานด้านใด',
      en: 'What position do you hold in the company? What are your primary responsibilities?',
      zh: '您在公司担任什么职位？主要负责什么工作？',
    },
    placeholders: ['my_position', 'my_responsibilities'],
  },
  {
    id: 'business_address',
    group: 'business_plan',
    question: {
      th: 'สถานที่ประกอบธุรกิจจริงของบริษัทอยู่ที่ไหน',
      en: "Where is the company's actual place of business?",
      zh: '公司的实际经营地址在哪里？',
    },
    placeholders: ['business_address'],
  },
  {
    id: 'operations_status',
    group: 'business_plan',
    question: {
      th: 'บริษัทเริ่มดำเนินธุรกิจแล้วหรือยัง',
      en: 'Has the company commenced operations yet?',
      zh: '公司目前已经开始经营了吗？',
    },
    placeholders: ['operations_status'],
  },
];

export const CONCEPT_GROUPS: ConceptGroup[] = [
  'identity',
  'ownership',
  'business_plan',
  'personal',
];

/** Company-level answers the DBD documents cannot supply (entered by the admin/lawyer). */
const optionalText = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().max(1000).nullable().default(null),
);

/** The company's own contact details. Kept as typed — a Thai landline is not a mobile (D47). */
const optionalEmail = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().email().max(320).nullable().default(null),
);
/** Free text the manager writes about the business; longer than a one-line interview answer. */
const optionalProse = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().max(2000).nullable().default(null),
);

export const interviewProfileSchema = z.object({
  contact_email: optionalEmail,
  contact_phone: optionalText,
  nature_of_business: optionalProse,
  products_services: optionalProse,
  account_purpose: optionalText,
  monthly_volume: optionalText,
  clients_location: optionalText,
  suppliers_location: optionalText,
  source_of_funds: optionalText,
  business_address: optionalText,
  operations_status: optionalText,
});
export type InterviewProfile = z.output<typeof interviewProfileSchema>;
export const EMPTY_INTERVIEW_PROFILE: InterviewProfile = interviewProfileSchema.parse({});
export const INTERVIEW_FIELDS = Object.keys(EMPTY_INTERVIEW_PROFILE) as (keyof InterviewProfile)[];

/**
 * What a manager must write before the record can be confirmed (owner, 2026-09-24): the DBD pack
 * says who the company is, but not how to reach it or what it actually sells, and the study cards
 * and the question bank are built on both.
 */
export const REQUIRED_INTERVIEW_FIELDS = [
  'contact_email',
  'contact_phone',
  'nature_of_business',
  'products_services',
] as const;
export type RequiredInterviewField = (typeof REQUIRED_INTERVIEW_FIELDS)[number];

/** Which of them are still blank, in the order the form shows them. */
export function missingBusinessAnswers(profile: InterviewProfile | null): RequiredInterviewField[] {
  return REQUIRED_INTERVIEW_FIELDS.filter((f) => !profile?.[f]?.trim());
}

/** The company-level contact details, which are record-keeping and never study facts. */
export const CONTACT_FIELDS = ['contact_email', 'contact_phone'] as const;

/** The learner's own role in the company (per assignment). */
export const learnerRoleSchema = z.object({
  holder_name: optionalText,
  position: optionalText,
  responsibilities: optionalText,
  relationship_to_shareholders: optionalText,
});
export type LearnerRole = z.output<typeof learnerRoleSchema>;

/** The learner's shareholding, matched by name against the shareholder list. */
export function myShareholding(
  business: BusinessProfile | null,
  holderName: string | null,
): { shares: number | null; percent: number | null } {
  if (!business || !holderName) return { shares: null, percent: null };
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  const me = business.shareholders.find((s) => norm(s.name) === norm(holderName));
  if (!me) return { shares: null, percent: null };
  const total = business.share_structure.total_shares;
  const percent =
    me.percent ??
    (me.shares !== null && total ? Math.round((me.shares / total) * 10000) / 100 : null);
  return { shares: me.shares, percent };
}
