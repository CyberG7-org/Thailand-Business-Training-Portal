import {
  COMPANY_STATUS_FACTS,
  EMPTY_INTERVIEW_PROFILE,
  isShareholder,
  myShareholding,
  type LearnerRole,
  type YesNo,
} from '@/lib/domain/bank-interview';
import {
  EMPTY_BUSINESS_PROFILE,
  type Shareholder,
  type StructuredData,
} from '@/lib/domain/dbd-profile';
import type { Director } from '@/lib/domain/dbd-record';
import type { RegisteredAddress } from '@/lib/domain/geo/resolve';
import { withStandardAnswers } from '@/lib/domain/standard-answers';
import { withStandardRole } from '@/lib/domain/standard-role';

/** The status facts that select alternate wording (D73); the last is derived per assignment. */
export const STATUS_FACTS = [...COMPANY_STATUS_FACTS, 'learner_is_shareholder'] as const;
export type StatusFact = (typeof STATUS_FACTS)[number];

/** The record columns the fact sheet reads (a `dbd_records` row satisfies it). */
export type RecordColumns = {
  company_name_th: string | null;
  company_name_en: string | null;
  juristic_id: string | null;
  registered_on: string | null;
  registered_capital: number | null;
  directors: unknown;
  signing_authority: string | null;
  /** The printed address, for the place of business when no resolved address is passed. */
  head_office_address?: string | null;
};

/**
 * The canonical facts both evaluations read (spec §7.2). P17b freezes exactly this object into a
 * training version, so every consumer builds it here and nowhere else.
 */
export type FactSheet = {
  company_name_th: string | null;
  company_name_en: string | null;
  juristic_id: string | null;
  registered_on: string | null;
  registered_capital: number | null;
  directors: Director[];
  signing_authority: string | null;
  address: RegisteredAddress | null;
  shareholders: Shareholder[];
  total_shares: number | null;
  nature_of_business: string | null;
  products_services: string | null;
  business_purpose: string | null;
  main_clients: string | null;
  client_origin: string | null;
  main_suppliers: string | null;
  business_address: string | null;
  monthly_revenue: string | null;
  revenue_basis: string | null;
  average_transaction: string | null;
  monthly_transactions: string | null;
  source_of_funds: string | null;
  first_incoming_funds: string | null;
  account_purpose: string | null;
  promptpay_qr_purpose: string | null;
  customer_examples: string | null;
  customer_profile: string | null;
  transaction_details: string | null;
  operations_started: boolean | null;
  has_existing_customers: boolean | null;
  has_completed_transactions: boolean | null;
  has_regular_suppliers: boolean | null;
  learner_is_shareholder: boolean | null;
  business_category: string | null;
  holder_name: string | null;
  position: string | null;
  director_count: number | null;
  shareholder_count: number | null;
  my_shares: number | null;
  my_share_percent: number | null;
};
export type FactKey = keyof FactSheet;

const bool = (v: YesNo | null): boolean | null => (v === null ? null : v === 'yes');

export function buildFactSheet(input: {
  record: RecordColumns;
  structured: StructuredData;
  address: RegisteredAddress | null;
  role: LearnerRole | null;
}): FactSheet {
  const business = input.structured.business ?? EMPTY_BUSINESS_PROFILE;
  // What the learner is taught: the manager's answers to the questions still asked, and the
  // standard answer to every other Level 4 question (D91).
  const p = withStandardAnswers(input.structured.interview ?? EMPTY_INTERVIEW_PROFILE, {
    address: input.address?.full || input.record.head_office_address || null,
  });
  const directors = Array.isArray(input.record.directors)
    ? (input.record.directors as Director[])
    : [];
  // Assignment scope: the name is one from the DBD, the position the same for every learner
  // (D94). Company scope has no role at all.
  const role = input.role
    ? withStandardRole(input.role, { directors: directors.map((d) => d.name_th) })
    : null;
  const holder = role?.holder_name ?? null;
  const mine = myShareholding(business, holder);
  const category = input.structured.category;
  return {
    company_name_th: input.record.company_name_th,
    company_name_en: input.record.company_name_en,
    juristic_id: input.record.juristic_id,
    registered_on: input.record.registered_on,
    registered_capital: input.record.registered_capital,
    directors,
    signing_authority: input.record.signing_authority,
    address: input.address,
    shareholders: business.shareholders,
    total_shares: business.share_structure.total_shares,
    nature_of_business: p.nature_of_business,
    products_services: p.products_services,
    business_purpose: p.business_purpose,
    main_clients: p.main_clients,
    client_origin: p.client_origin,
    main_suppliers: p.main_suppliers,
    business_address: p.business_address,
    monthly_revenue: p.monthly_revenue,
    revenue_basis: p.revenue_basis,
    average_transaction: p.average_transaction,
    monthly_transactions: p.monthly_transactions,
    source_of_funds: p.source_of_funds,
    first_incoming_funds: p.first_incoming_funds,
    account_purpose: p.account_purpose,
    promptpay_qr_purpose: p.promptpay_qr_purpose,
    customer_examples: p.customer_examples,
    customer_profile: p.customer_profile,
    transaction_details: p.transaction_details,
    operations_started: bool(p.operations_started),
    has_existing_customers: bool(p.has_existing_customers),
    has_completed_transactions: bool(p.has_completed_transactions),
    has_regular_suppliers: bool(p.has_regular_suppliers),
    learner_is_shareholder: isShareholder(business, holder),
    business_category: category?.status === 'mapped' ? category.key : null,
    holder_name: holder,
    position: role?.position ?? null,
    director_count: directors.length > 0 ? directors.length : null,
    shareholder_count: business.shareholders.length > 0 ? business.shareholders.length : null,
    my_shares: mine.shares,
    my_share_percent: mine.percent,
  };
}
