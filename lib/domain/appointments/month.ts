import { isISODate, type ISODate } from '@/lib/domain/thai-date';

const MONTH = /^(\d{4})-(\d{2})$/;

function monthParts(month: string): [number, number] {
  const match = MONTH.exec(month);
  const year = Number(match?.[1]);
  const number = Number(match?.[2]);
  if (!match || number < 1 || number > 12) throw new Error(`Invalid month: ${month}`);
  return [year, number];
}

const pad2 = (value: number) => String(value).padStart(2, '0');

/** A Sunday-first six-week calendar. Days outside the selected month are empty cells. */
export function monthGrid(month: string): (ISODate | null)[] {
  const [year, number] = monthParts(month);
  const firstWeekday = new Date(Date.UTC(year, number - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return Array.from({ length: 42 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day >= 1 && day <= count ? `${year}-${pad2(number)}-${pad2(day)}` : null;
  });
}

/** Moves an ISO `YYYY-MM` calendar month without depending on the host time zone. */
export function shiftMonth(month: string, delta: number): string {
  const [year, number] = monthParts(month);
  const shifted = new Date(Date.UTC(year, number - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}`;
}

/** A date-only appointment is persisted as a stable Bangkok-noon one-hour marker. */
export function appointmentDateTime(date: ISODate): { startsAt: string; endsAt: string } {
  if (!isISODate(date)) throw new Error(`Invalid date: ${date}`);
  const starts = new Date(`${date}T12:00:00+07:00`);
  return {
    startsAt: starts.toISOString(),
    endsAt: new Date(starts.getTime() + 60 * 60 * 1000).toISOString(),
  };
}
