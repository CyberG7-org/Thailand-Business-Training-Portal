import { addCalendarDays, type ISODate } from '@/lib/domain/thai-date';

/** Bangkok is UTC+7 all year, so wall time converts with a fixed offset (spec §5.1). */
const OFFSET = '+07:00';
const HOUR_MS = 3_600_000;

export type SlotConfig = {
  /** The Bangkok hour the day opens, e.g. 9. */
  hoursStart: number;
  /** The Bangkok hour it closes, e.g. 16; the last slot ends by then. */
  hoursEnd: number;
  slotMinutes: number;
  noticeHours: number;
  holidays: readonly ISODate[];
};
export type Interval = { startsAt: string; endsAt: string };
export type SlotState = 'free' | 'booked' | 'blocked' | 'holiday' | 'past' | 'outside_window';
export type Slot = Interval & { state: SlotState };
export type DaySlots = { date: ISODate; holiday: boolean; slots: Slot[] };
export type Window = { availableFrom: ISODate; expiresAt: ISODate | null };

const pad = (n: number) => String(n).padStart(2, '0');

/** That Bangkok wall time as an ISO UTC string. */
export function bangkokDateTime(date: ISODate, hour: number, minute = 0): string {
  return new Date(`${date}T${pad(hour)}:${pad(minute)}:00${OFFSET}`).toISOString();
}

/** The Bangkok calendar date a timestamp falls on. */
export function bangkokDateOf(timestamp: string | Date): ISODate {
  const shifted = new Date(new Date(timestamp).getTime() + 7 * HOUR_MS);
  return shifted.toISOString().slice(0, 10);
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

/** The day's grid: slots of slotMinutes from the opening hour, the last one ending by closing. */
export function daySlots(date: ISODate, cfg: SlotConfig): Interval[] {
  const out: Interval[] = [];
  const close = new Date(bangkokDateTime(date, cfg.hoursEnd)).getTime();
  let start = new Date(bangkokDateTime(date, cfg.hoursStart)).getTime();
  while (start + cfg.slotMinutes * 60_000 <= close) {
    const end = start + cfg.slotMinutes * 60_000;
    out.push({ startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() });
    start = end;
  }
  return out;
}

/**
 * Spec §5.1: a free slot is on a day that is not a public holiday, inside the hours, not blocked,
 * not booked, at least noticeHours away, on or after available_from and, when set, on or before
 * expires_at. Weekends are open days like any other.
 */
export function calendar(args: {
  from: ISODate;
  days: number;
  cfg: SlotConfig;
  window: Window;
  bookings: Interval[];
  blocks: Interval[];
  now: Date;
}): DaySlots[] {
  const { cfg, window, bookings, blocks } = args;
  const earliest = args.now.getTime() + cfg.noticeHours * HOUR_MS;
  const out: DaySlots[] = [];
  for (let i = 0; i < args.days; i++) {
    const date = addCalendarDays(args.from, i);
    const holiday = cfg.holidays.includes(date);
    const outside =
      date < window.availableFrom || (window.expiresAt !== null && date > window.expiresAt);
    const slots = daySlots(date, cfg).map((slot): Slot => {
      if (holiday) return { ...slot, state: 'holiday' };
      if (outside) return { ...slot, state: 'outside_window' };
      if (new Date(slot.startsAt).getTime() < earliest) return { ...slot, state: 'past' };
      if (bookings.some((b) => overlaps(slot, b))) return { ...slot, state: 'booked' };
      if (blocks.some((b) => overlaps(slot, b))) return { ...slot, state: 'blocked' };
      return { ...slot, state: 'free' };
    });
    out.push({ date, holiday, slots });
  }
  return out;
}
