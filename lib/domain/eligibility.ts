import { addCalendarDays, type ISODate } from './thai-date';

/** BR-002: Bank Verification Available Date = DBD Issue Date + 45 calendar days. */
export const DEFAULT_ELIGIBILITY_DAYS = 45;

export function availableFrom(issuedOn: ISODate, days: number = DEFAULT_ELIGIBILITY_DAYS): ISODate {
  return addCalendarDays(issuedOn, days);
}

export type EligibilityWindow = {
  availableFrom: ISODate;
  /** null = access never expires (open decision #13 default). */
  expiresAt: ISODate | null;
};

/** ISO dates compare correctly as strings, so no Date objects are needed. */
export function isBankStageOpen(window: EligibilityWindow, today: ISODate): boolean {
  if (today < window.availableFrom) return false;
  if (window.expiresAt !== null && today > window.expiresAt) return false;
  return true;
}
