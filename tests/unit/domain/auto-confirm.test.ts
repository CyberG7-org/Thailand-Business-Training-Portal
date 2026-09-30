import { describe, expect, it } from 'vitest';
import { autoConfirmVerdict, companyStatus, type ReadingSnapshot } from '@/lib/domain/auto-confirm';
import { EMPTY_INTERVIEW_PROFILE } from '@/lib/domain/bank-interview';

const record = {
  juristic_id: '0105568233704',
  company_name_th: 'บริษัท ทดสอบ จำกัด',
  issued_on: '2026-04-09',
};
const answers = {
  ...EMPTY_INTERVIEW_PROFILE,
  contact_email: 'info@example.co.th',
  contact_phone: '02-000-0000',
  nature_of_business: 'ขายเสื้อผ้าออนไลน์',
  products_services: 'เสื้อผ้าสตรี',
};
const finished: ReadingSnapshot = {
  extractionStatus: 'extracted',
  readingJobsOpen: 0,
  documentsStillIndexing: 0,
  rejected: [],
};

/** D80: a record confirms itself only when it is clean. */
describe('autoConfirmVerdict', () => {
  it('confirms a finished, complete reading with the four details', () => {
    expect(autoConfirmVerdict(record, answers, finished)).toEqual({ confirm: true });
  });

  it('waits while anything is still being read or indexed', () => {
    expect(autoConfirmVerdict(record, answers, { ...finished, readingJobsOpen: 1 })).toEqual({
      confirm: false,
      reasons: ['still_reading'],
    });
    expect(
      autoConfirmVerdict(record, answers, { ...finished, documentsStillIndexing: 1 }),
    ).toMatchObject({ confirm: false, reasons: ['still_reading'] });
  });

  it('never confirms what was not read, or what is already confirmed', () => {
    expect(autoConfirmVerdict(record, answers, { ...finished, extractionStatus: 'none' })).toEqual({
      confirm: false,
      reasons: ['not_read'],
    });
    expect(
      autoConfirmVerdict(record, answers, { ...finished, extractionStatus: 'confirmed' }),
    ).toEqual({ confirm: false, reasons: ['already_confirmed'] });
  });

  it('names every certificate fact and detail still missing, the issue date included', () => {
    const verdict = autoConfirmVerdict(
      { juristic_id: null, company_name_th: 'บริษัท ทดสอบ จำกัด', issued_on: null },
      { ...answers, contact_email: null },
      finished,
    );
    expect(verdict).toEqual({
      confirm: false,
      reasons: ['juristic_id', 'contact_email', 'issued_on'],
    });
  });

  it('leaves a record for a person when the reading threw out an invalid value', () => {
    expect(
      autoConfirmVerdict(record, answers, { ...finished, rejected: ['registered_capital'] }),
    ).toEqual({ confirm: false, reasons: ['rejected:registered_capital'] });
  });
});

describe('companyStatus', () => {
  const unconfirmed = { extraction_status: 'extracted', confirmed_automatically: false };

  it('tells a record the reader confirmed from one a person confirmed', () => {
    expect(
      companyStatus({ extraction_status: 'confirmed', confirmed_automatically: true }, null),
    ).toBe('confirmed_auto');
    expect(
      companyStatus({ extraction_status: 'confirmed', confirmed_automatically: false }, 'open'),
    ).toBe('confirmed');
  });

  it('shows an unconfirmed record as reading, unreadable or waiting for a person', () => {
    expect(companyStatus(unconfirmed, 'open')).toBe('reading');
    expect(companyStatus(unconfirmed, 'failed')).toBe('unread');
    expect(companyStatus(unconfirmed, null)).toBe('attention');
    expect(companyStatus({ ...unconfirmed, extraction_status: 'none' }, null)).toBe('attention');
  });
});
