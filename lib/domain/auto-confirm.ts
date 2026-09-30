import type { InterviewProfile } from './bank-interview';
import { missingFieldsForConfirmation } from './dbd-record';

/**
 * What the background reader knows about a record when its last reading step finishes (D80).
 */
export type ReadingSnapshot = {
  extractionStatus: string;
  /** `extract` / `transcript` jobs of the record still queued or running. */
  readingJobsOpen: number;
  /** Oversized documents whose index (and so their transcript fill) has not finished. */
  documentsStillIndexing: number;
  /** Fields the reading offered whose value failed validation and are still empty. */
  rejected: string[];
};

type RecordFacts = {
  juristic_id: string | null;
  company_name_th: string | null;
  issued_on: string | null;
};

export type AutoConfirmVerdict = { confirm: true } | { confirm: false; reasons: string[] };

/** Where a company stands, as the staff list shows it (D80). */
export type CompanyStatus = 'confirmed_auto' | 'confirmed' | 'reading' | 'unread' | 'attention';

/**
 * A confirmed record says whether a person or the reader confirmed it; an unconfirmed one is
 * still being read, could not be read, or is waiting for a person.
 */
export function companyStatus(
  record: { extraction_status: string; confirmed_automatically: boolean },
  reading: 'open' | 'failed' | null,
): CompanyStatus {
  if (record.extraction_status === 'confirmed') {
    return record.confirmed_automatically ? 'confirmed_auto' : 'confirmed';
  }
  if (reading === 'open') return 'reading';
  if (reading === 'failed') return 'unread';
  return 'attention';
}

/**
 * Whether a record may confirm itself without anyone checking it (D80). Only a clean record
 * does: the reading has finished, the certificate facts the portal depends on are there —
 * company name, registration number, and the issue date the 45-day bank date is counted from —
 * the manager's four details are there, and nothing the reading offered was thrown out as
 * invalid. Anything else stays for a person, who confirms by hand as before.
 */
export function autoConfirmVerdict(
  record: RecordFacts,
  interview: InterviewProfile | null,
  reading: ReadingSnapshot,
): AutoConfirmVerdict {
  if (reading.extractionStatus === 'confirmed') {
    return { confirm: false, reasons: ['already_confirmed'] };
  }
  const reasons: string[] = [];
  if (reading.readingJobsOpen > 0 || reading.documentsStillIndexing > 0) {
    reasons.push('still_reading');
  } else if (reading.extractionStatus !== 'extracted') {
    reasons.push('not_read');
  }
  reasons.push(...missingFieldsForConfirmation(record, interview));
  if (!record.issued_on) reasons.push('issued_on');
  reasons.push(...reading.rejected.map((field) => `rejected:${field}`));
  return reasons.length === 0 ? { confirm: true } : { confirm: false, reasons };
}
