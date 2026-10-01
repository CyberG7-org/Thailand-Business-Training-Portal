import { REQUIRED_INTERVIEW_FIELDS, EMPTY_INTERVIEW_PROFILE } from '@/lib/domain/bank-interview';
import { conceptCoverage } from '@/lib/domain/concepts/resolve';
import { EMPTY_BUSINESS_PROFILE, type StructuredData } from '@/lib/domain/dbd-profile';
import type { Director } from '@/lib/domain/dbd-record';
import type { FactKey, FactSheet } from '@/lib/domain/facts/fact-sheet';
import type { RegisteredAddress } from '@/lib/domain/geo/resolve';
import { isValidJuristicId } from './juristic-id';

export const EXCEPTION_KINDS = [
  'missing',
  'low_confidence',
  'conflict',
  'invalid',
  'geo_mismatch',
  'category_review',
  'render_failure',
] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

/** What an open exception holds back (plan decision 1). */
export type Blocks = 'acceptance' | 'version' | 'none';

export type Finding = {
  kind: ExceptionKind;
  field: string;
  blocks: Blocks;
  /** Always carries `signature`: the value the problem was raised on, so a resolution sticks to it. */
  detail: Record<string, unknown> & { signature: string };
};

export type ValidationThresholds = { autoAcceptPercent: number; reviewPercent: number };

export type ValidationRecord = {
  company_name_th: string | null;
  company_name_en: string | null;
  juristic_id: string | null;
  registered_on: string | null;
  issued_on: string | null;
  registered_capital: number | null;
  objectives_count: number | null;
  directors: unknown;
  signing_authority: string | null;
  head_office_address: string | null;
};

export type ValidationInput = {
  record: ValidationRecord;
  structured: StructuredData;
  address: RegisteredAddress;
  /** The company-scope sheet (`buildFactSheet` with no role). */
  facts: FactSheet;
  thresholds: ValidationThresholds;
  /** ISO date in Bangkok. */
  today: string;
};

/** Extracted fields whose confidence is weighed: the ones the sheet reads (plan decision 2). */
export const CONFIDENCE_FIELDS = [
  'company_name_th',
  'company_name_en',
  'juristic_id',
  'registered_on',
  'issued_on',
  'registered_capital',
  'directors',
  'signing_authority',
  'head_office_address',
  'shareholders',
  'share_structure',
  'objectives',
] as const;

/** Missing facts that hold back acceptance — today's bar (D58); every other missing fact holds back the version. */
const ACCEPTANCE_FACTS: ReadonlySet<string> = new Set<FactKey | string>([
  'company_name_th',
  'juristic_id',
  'nature_of_business',
  'products_services',
]);

const TITLE = /^(นางสาว|นาง|นาย)\s*/;

/**
 * The deterministic validators (spec §5.5): hard rules first, then resolvability, then the
 * extraction's own confidence, then the category. Pure; the caller stores the findings.
 */
export function validateFacts(input: ValidationInput): Finding[] {
  const { record, structured, address, facts, thresholds, today } = input;
  const business = structured.business ?? EMPTY_BUSINESS_PROFILE;
  const interview = structured.interview ?? EMPTY_INTERVIEW_PROFILE;
  const out: Finding[] = [];
  const push = (
    kind: ExceptionKind,
    field: string,
    blocks: Blocks,
    detail: Record<string, unknown>,
    signature: string,
  ) => out.push({ kind, field, blocks, detail: { ...detail, signature } });

  // 1. The registration number carries a check digit.
  if (record.juristic_id && !isValidJuristicId(record.juristic_id)) {
    push(
      'invalid',
      'juristic_id',
      'acceptance',
      { rule: 'check_digit', value: record.juristic_id },
      record.juristic_id,
    );
  }

  // 2. Registration ≤ issue ≤ today.
  if (record.registered_on && record.registered_on > today) {
    push(
      'invalid',
      'registered_on',
      'acceptance',
      { rule: 'in_future', value: record.registered_on },
      record.registered_on,
    );
  }
  if (record.issued_on && record.registered_on && record.issued_on < record.registered_on) {
    push(
      'invalid',
      'issued_on',
      'acceptance',
      { rule: 'before_registration', value: record.issued_on, registered_on: record.registered_on },
      `${record.issued_on}<${record.registered_on}`,
    );
  } else if (record.issued_on && record.issued_on > today) {
    push(
      'invalid',
      'issued_on',
      'acceptance',
      { rule: 'in_future', value: record.issued_on },
      record.issued_on,
    );
  }

  // 3. Shares and percents reconcile where the list is complete; a short list is only a note.
  const holders = business.shareholders;
  const total = business.share_structure.total_shares;
  if (holders.length > 0 && total !== null && holders.every((h) => h.shares !== null)) {
    const sum = holders.reduce((s, h) => s + (h.shares ?? 0), 0);
    if (sum > total)
      push(
        'conflict',
        'shareholders.shares',
        'acceptance',
        { rule: 'shares_over_total', sum, total },
        `${sum}/${total}`,
      );
    else if (sum < total)
      push(
        'conflict',
        'shareholders.shares',
        'none',
        { rule: 'shares_under_total', sum, total },
        `${sum}/${total}`,
      );
  }
  if (holders.length > 0 && holders.every((h) => h.percent !== null)) {
    const pct = Math.round(holders.reduce((s, h) => s + (h.percent ?? 0), 0) * 1000) / 1000;
    if (pct > 100.01)
      push(
        'conflict',
        'shareholders.percent',
        'acceptance',
        { rule: 'percent_over_100', percent: pct },
        String(pct),
      );
    else if (pct < 99.99)
      push(
        'conflict',
        'shareholders.percent',
        'none',
        { rule: 'percent_under_100', percent: pct },
        String(pct),
      );
  }

  // 4. Shares × par value is the registered capital.
  const par = business.share_structure.par_value;
  if (total !== null && par !== null && record.registered_capital !== null) {
    const expected = total * par;
    if (Math.abs(expected - record.registered_capital) > 0.5) {
      push(
        'conflict',
        'registered_capital',
        'acceptance',
        { rule: 'shares_times_par', expected, actual: record.registered_capital },
        `${expected}/${record.registered_capital}`,
      );
    }
  }

  // 5. The objectives count against the list (lists are often partial: a note).
  if (
    record.objectives_count !== null &&
    business.objectives.length > 0 &&
    business.objectives.length !== record.objectives_count
  ) {
    push(
      'conflict',
      'objectives_count',
      'none',
      { rule: 'count_vs_list', count: record.objectives_count, listed: business.objectives.length },
      `${record.objectives_count}/${business.objectives.length}`,
    );
  }

  // 6. A signing authority that names someone names a director.
  const directors = Array.isArray(record.directors) ? (record.directors as Director[]) : [];
  if (record.signing_authority && directors.length > 0) {
    const named = record.signing_authority.match(/(นางสาว|นาง|นาย)\s*\S+/g) ?? [];
    const firstNames = directors
      .map((d) => d.name_th.replace(TITLE, '').split(/\s+/)[0])
      .filter(Boolean);
    if (named.length > 0 && !firstNames.some((n) => record.signing_authority!.includes(n))) {
      push(
        'conflict',
        'signing_authority',
        'none',
        { rule: 'names_not_directors', named },
        record.signing_authority,
      );
    }
  }

  // 7. A printed address resolves to the subdistrict, or a person looks at it.
  const printed = record.head_office_address?.trim() ?? '';
  const addressUnresolved = printed.length > 0 && address.status !== 'resolved';
  if (addressUnresolved) {
    push(
      'geo_mismatch',
      'head_office_address',
      'acceptance',
      { status: address.status, issues: address.issues },
      printed,
    );
  }

  // 8. Every company-level concept resolvable (§7.3), tiered (plan decision 1).
  const coverage = conceptCoverage(facts, 'company');
  for (const fact of coverage.missingFacts) {
    if (fact === 'address' && addressUnresolved) continue; // already a geo_mismatch
    const concepts = coverage.concepts.filter((c) => c.missing.includes(fact)).map((c) => c.key);
    push(
      'missing',
      fact,
      ACCEPTANCE_FACTS.has(fact) ? 'acceptance' : 'version',
      { concepts },
      'missing',
    );
  }
  for (const field of REQUIRED_INTERVIEW_FIELDS) {
    if (!interview[field]?.trim() && !coverage.missingFacts.includes(field as FactKey)) {
      push('missing', field, 'acceptance', { concepts: [] }, 'missing');
    }
  }
  if (!record.issued_on) push('missing', 'issued_on', 'version', { concepts: [] }, 'missing');

  // 9. The extraction's own confidence on the fields the sheet reads (plan decision 2).
  const provenance = structured.provenance ?? {};
  for (const field of CONFIDENCE_FIELDS) {
    const p = provenance[field];
    if (!p) continue;
    const percent = p.confidence * 100;
    if (percent >= thresholds.autoAcceptPercent) continue;
    push(
      'low_confidence',
      field,
      percent < thresholds.reviewPercent ? 'acceptance' : 'none',
      { confidence: p.confidence, source_page: p.source_page, source_document: p.source_document },
      `${field}:${p.confidence}`,
    );
  }

  // 10. A category that needs a person: never blocking (D73).
  const category = structured.category ?? null;
  if (
    category &&
    (category.status === 'needs_review' ||
      (category.status === 'unmapped' && interview.nature_of_business))
  ) {
    push(
      'category_review',
      'business_category',
      'none',
      {
        status: category.status,
        candidate_key: category.candidate_key,
        confidence: category.confidence,
        error: category.error,
      },
      `${category.status}:${category.candidate_key ?? ''}:${category.input_hash ?? ''}`,
    );
  }

  return out;
}
