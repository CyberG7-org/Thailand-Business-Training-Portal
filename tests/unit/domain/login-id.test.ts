import { describe, expect, it } from 'vitest';
import { displayLoginId, formatLoginCode } from '@/lib/domain/login-id';

/** The same shape allocate_login_id writes, so a preview reads exactly like the code to come. */
describe('formatLoginCode', () => {
  it('pads single digits only and stores lower-case', () => {
    expect(formatLoginCode('T02-', 1)).toBe('t02-01');
    expect(formatLoginCode('t02-', 9)).toBe('t02-09');
    expect(formatLoginCode('t02-', 10)).toBe('t02-10');
    expect(formatLoginCode('t02-', 100)).toBe('t02-100');
    expect(formatLoginCode('t', 3)).toBe('t03');
  });
});

describe('displayLoginId', () => {
  it('shows a stored code upper-case (spec §3.3)', () => {
    expect(displayLoginId('t01')).toBe('T01');
    expect(displayLoginId('t01-03')).toBe('T01-03');
    expect(displayLoginId('t100-100')).toBe('T100-100');
  });

  it('leaves the admin account readable and survives nothing', () => {
    expect(displayLoginId('owner')).toBe('OWNER');
    expect(displayLoginId(null)).toBe('—');
    expect(displayLoginId('')).toBe('—');
  });
});
