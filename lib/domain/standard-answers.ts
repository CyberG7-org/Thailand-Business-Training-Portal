// lib/domain/standard-answers.ts
import type { InterviewProfile } from './bank-interview';

/**
 * The Level 4 questions a manager is still asked (D91): the ones no document, no other answer
 * and no fixed wording can supply. Shown in this order.
 */
export const ASKED_INTERVIEW_FIELDS = [
  'client_origin',
  'customer_profile',
  'main_suppliers',
  'monthly_revenue',
  'average_transaction',
] as const;
export type AskedInterviewField = (typeof ASKED_INTERVIEW_FIELDS)[number];

/** The Level 4 answers nobody types any more, in the order the record lists them. */
export const STANDARD_ANSWER_FIELDS = [
  'main_clients',
  'business_purpose',
  'business_address',
  'monthly_transactions',
  'revenue_basis',
  'transaction_details',
  'source_of_funds',
  'first_incoming_funds',
  'account_purpose',
  'promptpay_qr_purpose',
] as const;
export type StandardAnswerField = (typeof STANDARD_ANSWER_FIELDS)[number];

/** The same answer for every company (Owner, 2026-10-01). Thai, as every fact is. */
export const FIXED_ANSWERS = {
  account_purpose:
    'เพื่อใช้ทำธุรกรรมทางการเงินของบริษัท รับเงินจากลูกค้าและจ่ายค่าใช้จ่ายของกิจการ',
  promptpay_qr_purpose:
    'ลูกค้านิยมชำระเงินแบบไม่ใช้เงินสด บริษัทจึงต้องมี PromptPay / QR ไว้รับชำระเงิน',
  source_of_funds: 'เงินลงทุนของผู้ถือหุ้นตามทุนจดทะเบียนของบริษัท',
  first_incoming_funds:
    'เงินค่าหุ้นที่ผู้ถือหุ้นชำระ เพื่อใช้เป็นเงินทุนเริ่มต้นและเงินหมุนเวียนของกิจการ',
} as const satisfies Partial<Record<StandardAnswerField, string>>;

const PAYMENT = 'ลูกค้าชำระด้วยการโอนเงินผ่านธนาคารและ PromptPay / QR';

/**
 * What a filled answer is worked out from. When one of these is missing the filled answer is
 * missing too, and only the source is reported (`validators.ts`).
 */
export const STANDARD_ANSWER_SOURCES: Partial<Record<StandardAnswerField, readonly string[]>> = {
  main_clients: ['customer_profile'],
  business_purpose: ['nature_of_business'],
  business_address: ['address'],
  monthly_transactions: ['monthly_revenue', 'average_transaction'],
  revenue_basis: ['monthly_revenue', 'average_transaction', 'monthly_transactions'],
};

const THAI_DIGITS = /[๐-๙]/g;
const NUMBER = /\d[\d,]*(?:\.\d+)?/;
/** "3 แสน", "300k", "30 万": the digits are not the amount, so nothing is computed from them. */
const SCALED = /^\s*(พัน|หมื่น|แสน|ล้าน|k|m|thousand|million|千|万|百万)/i;

/** The first amount written in digits, or null when there is none to divide by. */
export function firstAmount(text: string | null | undefined): number | null {
  const plain = (text ?? '').replace(THAI_DIGITS, (d) => String(d.charCodeAt(0) - 0x0e50));
  const match = NUMBER.exec(plain);
  if (!match) return null;
  if (SCALED.test(plain.slice(match.index + match[0].length))) return null;
  const value = Number(match[0].replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}

const show = (n: number) => n.toLocaleString('en-US');

/**
 * The answers the learner is taught: what the manager typed for the questions still asked, and
 * for every other Level 4 question the standard answer — from the DBD, from another answer,
 * from the two amounts, or the same for every company. A standard answer always wins; what was
 * typed for it earlier stays stored and is not read (D91). The four company status facts are
 * always yes.
 */
export function withStandardAnswers(
  profile: InterviewProfile,
  context: { address: string | null },
): InterviewProfile {
  const revenue = firstAmount(profile.monthly_revenue);
  const average = firstAmount(profile.average_transaction);
  const perMonth =
    revenue !== null && average !== null ? Math.max(1, Math.round(revenue / average)) : null;
  const nature = profile.nature_of_business?.trim() || null;
  return {
    ...profile,
    operations_started: 'yes',
    has_existing_customers: 'yes',
    has_completed_transactions: 'yes',
    has_regular_suppliers: 'yes',
    // "Who are the main customers?" is the kind of customers the manager described.
    main_clients: profile.customer_profile?.trim() || null,
    business_purpose: nature ? `จัดตั้งขึ้นเพื่อประกอบธุรกิจ ${nature}` : null,
    business_address: context.address?.trim() || null,
    monthly_transactions: perMonth !== null ? `ประมาณ ${show(perMonth)} รายการต่อเดือน` : null,
    revenue_basis:
      perMonth !== null && average !== null
        ? `ยอดขายประมาณ ${show(perMonth)} รายการต่อเดือน เฉลี่ยรายการละ ${show(average)} บาท`
        : null,
    transaction_details:
      average !== null ? `${PAYMENT} เฉลี่ยรายการละประมาณ ${show(average)} บาท` : PAYMENT,
    ...FIXED_ANSWERS,
  };
}
