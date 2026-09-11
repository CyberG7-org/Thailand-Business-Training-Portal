import { describe, expect, it } from 'vitest';
import { DEFAULT_ELIGIBILITY_DAYS, availableFrom, isBankStageOpen } from '@/lib/domain/eligibility';

describe('availableFrom', () => {
  it('is DBD issue date + 45 calendar days (AC-001)', () => {
    expect(availableFrom('2026-09-11')).toBe('2026-10-26');
  });
  it('uses calendar days, ignoring weekends and holidays (BR-005)', () => {
    // 2026-07-13 is a Monday; +45 lands on Thursday 2026-08-27 with no adjustment.
    expect(availableFrom('2026-07-13')).toBe('2026-08-27');
  });
  it('honours a configured day count', () => {
    expect(availableFrom('2026-09-11', 30)).toBe('2026-10-11');
  });
  it('defaults to 45 days', () => {
    expect(DEFAULT_ELIGIBILITY_DAYS).toBe(45);
  });
});

describe('isBankStageOpen', () => {
  const window = { availableFrom: '2026-10-26', expiresAt: null };
  it('is closed the day before the available date (AC-002)', () => {
    expect(isBankStageOpen(window, '2026-10-25')).toBe(false);
  });
  it('is open on the available date (AC-003)', () => {
    expect(isBankStageOpen(window, '2026-10-26')).toBe(true);
  });
  it('is open after the available date', () => {
    expect(isBankStageOpen(window, '2027-01-01')).toBe(true);
  });
  it('is closed after an optional expiry date', () => {
    expect(isBankStageOpen({ ...window, expiresAt: '2026-12-31' }, '2027-01-01')).toBe(false);
  });
  it('is open on the expiry date itself', () => {
    expect(isBankStageOpen({ ...window, expiresAt: '2026-12-31' }, '2026-12-31')).toBe(true);
  });
});
