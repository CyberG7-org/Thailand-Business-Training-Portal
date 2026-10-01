/** Where a company stands, as the staff list shows it (D80). */
export type CompanyStatus = 'confirmed_auto' | 'confirmed' | 'reading' | 'unread' | 'attention';

/**
 * A confirmed record says whether a person or validation accepted it (P17c: `confirmed_auto`
 * means accepted with no person acting); an unconfirmed one is still being read, could not be
 * read, or is waiting for a person.
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
