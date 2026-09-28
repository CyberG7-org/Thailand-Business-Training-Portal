import { describe, expect, it } from 'vitest';
import {
  bangkokDateOf,
  bangkokDateTime,
  calendar,
  daySlots,
  type SlotConfig,
} from '@/lib/domain/appointments/slots';

const cfg: SlotConfig = {
  hoursStart: 9,
  hoursEnd: 16,
  slotMinutes: 60,
  noticeHours: 24,
  holidays: ['2026-10-13', '2026-10-23'],
};
const window = { availableFrom: '2026-10-01', expiresAt: null };
// A Thursday, 08:00 Bangkok.
const now = new Date('2026-10-08T01:00:00Z');

describe('bangkok time', () => {
  it('turns a Bangkok wall time into UTC and back', () => {
    expect(bangkokDateTime('2026-10-13', 9)).toBe('2026-10-13T02:00:00.000Z');
    expect(bangkokDateOf('2026-10-13T02:00:00.000Z')).toBe('2026-10-13');
    // 23:30 Bangkok is still the same date, though it is the next day's morning in UTC terms.
    expect(bangkokDateOf('2026-10-12T16:30:00.000Z')).toBe('2026-10-12');
  });
});

describe('daySlots', () => {
  it('cuts the hours into slots that end by the closing hour', () => {
    const slots = daySlots('2026-10-14', cfg);
    expect(slots).toHaveLength(7);
    expect(slots[0]).toEqual({
      startsAt: '2026-10-14T02:00:00.000Z',
      endsAt: '2026-10-14T03:00:00.000Z',
    });
    expect(slots[6].endsAt).toBe('2026-10-14T09:00:00.000Z');
    expect(daySlots('2026-10-14', { ...cfg, slotMinutes: 90 })).toHaveLength(4);
  });
});

describe('calendar', () => {
  it('opens weekends and closes holidays', () => {
    const days = calendar({
      from: '2026-10-10',
      days: 4,
      cfg,
      window,
      bookings: [],
      blocks: [],
      now,
    });
    expect(days.map((d) => d.date)).toEqual([
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
    ]);
    expect(days[0].slots.every((s) => s.state === 'free')).toBe(true); // Saturday
    expect(days[1].slots.every((s) => s.state === 'free')).toBe(true); // Sunday
    expect(days[3].holiday).toBe(true);
    expect(days[3].slots.every((s) => s.state === 'holiday')).toBe(true);
  });

  it('respects the notice hours, not merely the past', () => {
    // now = Thursday 08:00 Bangkok, 24 h notice: today's slots and Friday 09:00 (25 h away) differ.
    const [today, friday] = calendar({
      from: '2026-10-08',
      days: 2,
      cfg,
      window,
      bookings: [],
      blocks: [],
      now,
    });
    expect(today.slots.every((s) => s.state === 'past')).toBe(true);
    expect(friday.slots[0].state).toBe('free');
    const tight = calendar({
      from: '2026-10-08',
      days: 1,
      cfg: { ...cfg, noticeHours: 0 },
      window,
      bookings: [],
      blocks: [],
      now,
    });
    expect(tight[0].slots[0].state).toBe('free'); // 09:00 today, one hour ahead
  });

  it('keeps the learner inside the eligibility window', () => {
    const days = calendar({
      from: '2026-10-30',
      days: 3,
      cfg,
      window: { availableFrom: '2026-10-31', expiresAt: '2026-10-31' },
      bookings: [],
      blocks: [],
      now,
    });
    expect(days[0].slots.every((s) => s.state === 'outside_window')).toBe(true);
    expect(days[1].slots.every((s) => s.state === 'free')).toBe(true);
    expect(days[2].slots.every((s) => s.state === 'outside_window')).toBe(true);
  });

  it('marks booked and blocked slots by overlap', () => {
    const [day] = calendar({
      from: '2026-10-14',
      days: 1,
      cfg,
      window,
      bookings: [
        {
          startsAt: bangkokDateTime('2026-10-14', 10),
          endsAt: bangkokDateTime('2026-10-14', 11),
        },
      ],
      blocks: [
        {
          startsAt: bangkokDateTime('2026-10-14', 13, 30),
          endsAt: bangkokDateTime('2026-10-14', 15),
        },
      ],
      now,
    });
    expect(day.slots.map((s) => s.state)).toEqual([
      'free',
      'booked',
      'free',
      'free',
      'blocked',
      'blocked',
      'free',
    ]);
  });
});
