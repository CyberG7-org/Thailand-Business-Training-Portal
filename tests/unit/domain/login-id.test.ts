import { describe, expect, it } from 'vitest';
import { displayLoginId } from '@/lib/domain/login-id';

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
