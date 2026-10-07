import { describe, expect, it } from 'vitest';
import { appointmentDateTime, monthGrid, shiftMonth } from '@/lib/domain/appointments/month';

describe('the manager appointment month (D102)', () => {
  it('lays a month into a Sunday-first six-week grid', () => {
    const days = monthGrid('2026-10');
    expect(days).toHaveLength(42);
    expect(days.slice(0, 4)).toEqual([null, null, null, null]);
    expect(days[4]).toBe('2026-10-01');
    expect(days[34]).toBe('2026-10-31');
    expect(days.slice(35)).toEqual([null, null, null, null, null, null, null]);
  });

  it('moves between months across year boundaries', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-10', 0)).toBe('2026-10');
  });

  it('stores a picked date at Bangkok noon with a one-hour marker', () => {
    expect(appointmentDateTime('2026-10-15')).toEqual({
      startsAt: '2026-10-15T05:00:00.000Z',
      endsAt: '2026-10-15T06:00:00.000Z',
    });
  });

  it('rejects an invalid month or date instead of normalising it', () => {
    expect(() => monthGrid('2026-13')).toThrow('Invalid month');
    expect(() => shiftMonth('October 2026', 1)).toThrow('Invalid month');
    expect(() => appointmentDateTime('2026-02-30')).toThrow('Invalid date');
  });
});
