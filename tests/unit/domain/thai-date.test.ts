import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  formatDate,
  isISODate,
  normalizeYear,
  parseDateInput,
  todayInBangkok,
} from '@/lib/domain/thai-date';

describe('todayInBangkok', () => {
  it('returns the Bangkok calendar date when UTC is still the previous day', () => {
    // 2026-09-10T20:00Z is 2026-09-11 03:00 in Asia/Bangkok (UTC+7)
    expect(todayInBangkok(new Date('2026-09-10T20:00:00Z'))).toBe('2026-09-11');
  });
  it('returns the same date when UTC and Bangkok agree', () => {
    expect(todayInBangkok(new Date('2026-09-11T05:00:00Z'))).toBe('2026-09-11');
  });
});

describe('addCalendarDays', () => {
  it('adds 45 days across a month boundary (AC-001)', () => {
    expect(addCalendarDays('2026-09-11', 45)).toBe('2026-10-26');
  });
  it('adds across a year boundary', () => {
    expect(addCalendarDays('2026-12-01', 45)).toBe('2027-01-15');
  });
  it('counts 29 February in a leap year', () => {
    expect(addCalendarDays('2028-01-20', 45)).toBe('2028-03-05');
  });
  it('skips 29 February in a common year', () => {
    expect(addCalendarDays('2027-01-20', 45)).toBe('2027-03-06');
  });
  it('returns the same date for zero days', () => {
    expect(addCalendarDays('2026-01-31', 0)).toBe('2026-01-31');
  });
});

describe('normalizeYear', () => {
  it('treats years >= 2400 as Buddhist Era', () => {
    expect(normalizeYear(2569)).toEqual({ ce: 2026, wasBe: true });
  });
  it('leaves Common Era years alone', () => {
    expect(normalizeYear(2026)).toEqual({ ce: 2026, wasBe: false });
  });
});

describe('parseDateInput', () => {
  it('parses Thai DD/MM/YYYY with a BE year', () => {
    expect(parseDateInput('13/07/2569')).toBe('2026-07-13');
  });
  it('parses DD/MM/YYYY with a CE year', () => {
    expect(parseDateInput('13/07/2026')).toBe('2026-07-13');
  });
  it('parses ISO input with a BE year', () => {
    expect(parseDateInput('2569-07-13')).toBe('2026-07-13');
  });
  it('parses ISO input with a CE year', () => {
    expect(parseDateInput('2026-07-13')).toBe('2026-07-13');
  });
  it('rejects impossible dates and garbage', () => {
    expect(parseDateInput('31/02/2026')).toBeNull();
    expect(parseDateInput('hello')).toBeNull();
    expect(parseDateInput('')).toBeNull();
  });
});

describe('formatDate', () => {
  it('formats Thai with the BE year and Thai month name', () => {
    expect(formatDate('2026-10-26', 'th')).toBe('26 ตุลาคม 2569');
  });
  it('formats English with the CE year', () => {
    expect(formatDate('2026-10-26', 'en')).toBe('26 October 2026');
  });
  it('formats Chinese with the CE year', () => {
    expect(formatDate('2026-10-26', 'zh')).toBe('2026年10月26日');
  });
});

describe('isISODate', () => {
  it('accepts YYYY-MM-DD and rejects anything else', () => {
    expect(isISODate('2026-10-26')).toBe(true);
    expect(isISODate('2026-13-01')).toBe(false);
    expect(isISODate('26/10/2026')).toBe(false);
    expect(isISODate(42)).toBe(false);
  });
});
