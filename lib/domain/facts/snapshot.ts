import type { TemplateRecord } from '@/lib/domain/assessment/template';
import {
  EMPTY_INTERVIEW_PROFILE,
  isShareholder,
  myShareholding,
  type LearnerRole,
} from '@/lib/domain/bank-interview';
import {
  EMPTY_BUSINESS_PROFILE,
  readStructuredData,
  type Objective,
  type Promoter,
  type StructuredData,
} from '@/lib/domain/dbd-profile';
import type { Director } from '@/lib/domain/dbd-record';
import type { RegisteredAddress } from '@/lib/domain/geo/resolve';
import { withBusinessNatureFigures } from '@/lib/domain/invoices/answers';
import type { InvoiceSummary } from '@/lib/domain/invoices/arithmetic';
import { clientOriginAnswer, withStandardAnswers } from '@/lib/domain/standard-answers';
import { withStandardRole } from '@/lib/domain/standard-role';
import { buildFactSheet, type FactSheet, type RecordColumns } from './fact-sheet';

/** The record columns a snapshot reads beyond the fact sheet's. */
export type SnapshotRecordColumns = RecordColumns & {
  certificate_no: string | null;
  issued_on: string | null;
  objectives_count: number | null;
  province: string | null;
  head_office_address: string | null;
  website?: string | null;
  facebook_page?: string | null;
};

/**
 * What the old question templates, the D64 interview and the name card read beside the fact
 * sheet (plan decision 6). Frozen with it so every reader is pinned; retired with P17i.
 */
export type TrainingExtras = {
  certificate_no: string | null;
  issued_on: string | null;
  objectives_count: number | null;
  province: string | null;
  head_office_address: string | null;
  objectives: Objective[];
  business_categories: string[];
  promoters: Promoter[];
  par_value: number | null;
  monthly_volume: string | null;
  clients_location: string | null;
  suppliers_location: string | null;
  operations_status: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  facebook_page: string | null;
  /** The figures the invoices give (D101), for the record page and the interview's tolerance. */
  invoice_summary: InvoiceSummary | null;
};

/** A training version's content (spec §5.6): the company-scope sheet and the extras. */
export type TrainingSnapshot = { facts: FactSheet; extras: TrainingExtras };

/** The learner's role as confirmed against a version (spec §5.6; plan decision 4). */
export type RoleSnapshot = LearnerRole & {
  learner_is_shareholder: boolean | null;
  my_shares: number | null;
  my_share_percent: number | null;
};

export function buildTrainingSnapshot(input: {
  record: SnapshotRecordColumns;
  structured: StructuredData;
  address: RegisteredAddress | null;
}): TrainingSnapshot {
  const business = input.structured.business ?? EMPTY_BUSINESS_PROFILE;
  // The earlier answers follow the new ones when blank (D91), as the fact sheet's do.
  const interview = withBusinessNatureFigures(
    withStandardAnswers(input.structured.interview ?? EMPTY_INTERVIEW_PROFILE, {
      address: input.address?.full || input.record.head_office_address,
      website: input.record.website,
    }),
    input.structured.category?.key,
  );
  return {
    facts: buildFactSheet({
      record: input.record,
      structured: input.structured,
      address: input.address,
      role: null,
    }),
    extras: {
      certificate_no: input.record.certificate_no,
      issued_on: input.record.issued_on,
      objectives_count: input.record.objectives_count,
      province: input.record.province,
      head_office_address: input.record.head_office_address,
      objectives: business.objectives,
      business_categories: business.business_categories,
      promoters: business.promoters,
      par_value: business.share_structure.par_value,
      monthly_volume: interview.monthly_volume,
      clients_location: interview.clients_location,
      suppliers_location: interview.suppliers_location,
      operations_status: interview.operations_status,
      contact_email: interview.contact_email,
      contact_phone: interview.contact_phone,
      website: input.record.website ?? null,
      facebook_page: input.record.facebook_page ?? null,
      invoice_summary: null,
    },
  };
}

/** The shareholder list as `myShareholding` wants it, from the frozen sheet. */
function businessOf(snapshot: TrainingSnapshot) {
  return {
    ...EMPTY_BUSINESS_PROFILE,
    shareholders: snapshot.facts.shareholders,
    share_structure: {
      ...EMPTY_BUSINESS_PROFILE.share_structure,
      total_shares: snapshot.facts.total_shares,
    },
  };
}

export function buildRoleSnapshot(role: LearnerRole, snapshot: TrainingSnapshot): RoleSnapshot {
  const business = businessOf(snapshot);
  // The name is one from the DBD and the three answers are the same for every learner (D95).
  const standard = withStandardRole(role, {
    directors: snapshot.facts.directors.map((d) => d.name_th),
  });
  const holder = standard.holder_name;
  const mine = myShareholding(business, holder);
  return {
    holder_name: holder,
    position: standard.position,
    responsibilities: standard.responsibilities,
    relationship_to_shareholders: standard.relationship_to_shareholders,
    learner_is_shareholder: isShareholder(business, holder),
    my_shares: mine.shares,
    my_share_percent: mine.percent,
  };
}

/** The assignment-scope fact sheet (spec §7.3): the frozen company sheet plus the role. */
export function assignmentFacts(snapshot: TrainingSnapshot, role: RoleSnapshot | null): FactSheet {
  return {
    ...snapshot.facts,
    // Re-project this fact for new work made from an older frozen company snapshot. Historic
    // attempts stay frozen, while a company without a website no longer claims to use one.
    client_origin: clientOriginAnswer(Boolean(snapshot.extras.website?.trim())),
    holder_name: role?.holder_name ?? null,
    position: role?.position ?? null,
    learner_is_shareholder: role?.learner_is_shareholder ?? null,
    my_shares: role?.learner_is_shareholder === false ? 0 : (role?.my_shares ?? null),
    my_share_percent: role?.learner_is_shareholder === false ? 0 : (role?.my_share_percent ?? null),
  };
}

/** The old templates' record, read from a version instead of the live row (§11). */
export function templateRecordFromSnapshot(
  snapshot: TrainingSnapshot,
  role: RoleSnapshot | null,
): TemplateRecord {
  const f = snapshot.facts;
  const x = snapshot.extras;
  return {
    company_name_th: f.company_name_th,
    company_name_en: f.company_name_en,
    juristic_id: f.juristic_id,
    certificate_no: x.certificate_no,
    registered_capital: f.registered_capital,
    head_office_address: x.head_office_address,
    registered_on: f.registered_on,
    issued_on: x.issued_on,
    directors: f.directors.length ? f.directors : null,
    objectives_count: x.objectives_count,
    signing_authority: f.signing_authority,
    province: x.province,
    objectives: x.objectives.length ? x.objectives : null,
    business_categories: x.business_categories.length ? x.business_categories : null,
    shareholders: f.shareholders.length ? f.shareholders : null,
    promoters: x.promoters.length ? x.promoters : null,
    total_shares: f.total_shares,
    par_value: x.par_value,
    directors_count: f.director_count,
    shareholders_count: f.shareholder_count,
    nature_of_business: f.nature_of_business,
    products_services: f.products_services,
    account_purpose: f.account_purpose,
    monthly_volume: x.monthly_volume,
    clients_location: x.clients_location,
    suppliers_location: x.suppliers_location,
    source_of_funds: f.source_of_funds,
    business_address: f.business_address,
    operations_status: x.operations_status,
    my_name: role?.holder_name ?? null,
    my_position: role?.position ?? null,
    my_responsibilities: role?.responsibilities ?? null,
    my_relationship: role?.relationship_to_shareholders ?? null,
    my_shares: role?.learner_is_shareholder === false ? 0 : (role?.my_shares ?? null),
    my_share_percent: role?.learner_is_shareholder === false ? 0 : (role?.my_share_percent ?? null),
    business_purpose: f.business_purpose,
    main_clients: f.main_clients,
    client_origin: f.client_origin,
    main_suppliers: f.main_suppliers,
    monthly_revenue: f.monthly_revenue,
    revenue_basis: f.revenue_basis,
    average_transaction: f.average_transaction,
    monthly_transactions: f.monthly_transactions,
    first_incoming_funds: f.first_incoming_funds,
    promptpay_qr_purpose: f.promptpay_qr_purpose,
    customer_profile: f.customer_profile,
    transaction_details: f.transaction_details,
    customer_channels: x.website ? 'with_website' : 'without_website',
  };
}

/**
 * The templates' record from the live row (moved here from lib/db/assessment.ts, unchanged in
 * behaviour). Kept for readers that have no version yet (plan decision 9); superseded by the
 * snapshot everywhere else (§11).
 */
export function templateRecordFromRecord(
  record: SnapshotRecordColumns & { structured_data: unknown },
  typedRole: LearnerRole | null = null,
): TemplateRecord {
  const role = typedRole
    ? withStandardRole(typedRole, {
        directors: ((record.directors as Director[] | null) ?? []).map((d) => d.name_th),
      })
    : null;
  const structured = readStructuredData(record.structured_data);
  const business = structured.business ?? EMPTY_BUSINESS_PROFILE;
  // The same standard answers the fact sheet reads (D91).
  const interview = withStandardAnswers(structured.interview ?? EMPTY_INTERVIEW_PROFILE, {
    address: structured.address?.full || record.head_office_address,
    website: record.website,
  });
  const directors = (record.directors as Director[] | null) ?? null;
  const mine = myShareholding(business, role?.holder_name ?? null);
  const learnerIsShareholder = isShareholder(business, role?.holder_name ?? null);
  return {
    company_name_th: record.company_name_th,
    company_name_en: record.company_name_en,
    juristic_id: record.juristic_id,
    certificate_no: record.certificate_no,
    registered_capital: record.registered_capital,
    head_office_address: record.head_office_address,
    registered_on: record.registered_on,
    issued_on: record.issued_on,
    directors,
    objectives_count: record.objectives_count,
    signing_authority: record.signing_authority,
    province: record.province,
    objectives: business.objectives.length ? business.objectives : null,
    business_categories: business.business_categories.length ? business.business_categories : null,
    shareholders: business.shareholders.length ? business.shareholders : null,
    promoters: business.promoters.length ? business.promoters : null,
    total_shares: business.share_structure.total_shares,
    par_value: business.share_structure.par_value,
    directors_count: directors && directors.length > 0 ? directors.length : null,
    shareholders_count: business.shareholders.length > 0 ? business.shareholders.length : null,
    nature_of_business: interview.nature_of_business,
    products_services: interview.products_services,
    account_purpose: interview.account_purpose,
    monthly_volume: interview.monthly_volume,
    clients_location: interview.clients_location,
    suppliers_location: interview.suppliers_location,
    source_of_funds: interview.source_of_funds,
    business_address: interview.business_address,
    operations_status: interview.operations_status,
    my_name: role?.holder_name ?? null,
    my_position: role?.position ?? null,
    my_responsibilities: role?.responsibilities ?? null,
    my_relationship: role?.relationship_to_shareholders ?? null,
    my_shares: learnerIsShareholder === false ? 0 : mine.shares,
    my_share_percent: learnerIsShareholder === false ? 0 : mine.percent,
    business_purpose: interview.business_purpose,
    main_clients: interview.main_clients,
    client_origin: interview.client_origin,
    main_suppliers: interview.main_suppliers,
    monthly_revenue: interview.monthly_revenue,
    revenue_basis: interview.revenue_basis,
    average_transaction: interview.average_transaction,
    monthly_transactions: interview.monthly_transactions,
    first_incoming_funds: interview.first_incoming_funds,
    promptpay_qr_purpose: interview.promptpay_qr_purpose,
    customer_profile: interview.customer_profile,
    transaction_details: interview.transaction_details,
    customer_channels: record.website ? 'with_website' : 'without_website',
  };
}

/** JSON with keys sorted at every level, so equal content hashes equal. */
export function canonicalJson(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (v === undefined) return null;
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => [k, norm((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(norm(value));
}
