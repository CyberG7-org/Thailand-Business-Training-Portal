import { describe, expect, it } from 'vitest';
import { companyStatus } from '@/lib/domain/auto-confirm';

describe('companyStatus', () => {
  const unconfirmed = { extraction_status: 'extracted', confirmed_automatically: false };

  it('tells a record validation accepted from one a person accepted', () => {
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
