/** A calendar date as `YYYY-MM-DD`. The only date representation used in domain logic. */
export type ISODate = string;

export type Locale = 'th' | 'en' | 'zh';

export const BANGKOK_TZ = 'Asia/Bangkok';
const BE_OFFSET = 543;
/** Any year at or above this is treated as Buddhist Era (พ.ศ.). CE years never reach it. */
const BE_THRESHOLD = 2400;

const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];
const ENGLISH_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= daysInMonth;
}

function toISO(y: number, m: number, d: number): ISODate {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string') return false;
  const m = ISO_RE.exec(value);
  if (!m) return false;
  return isRealDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

function parts(date: ISODate): [number, number, number] {
  const m = ISO_RE.exec(date);
  if (!m) throw new Error(`Not an ISO date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Calendar date in Asia/Bangkok for the given instant (defaults to now). */
export function todayInBangkok(now: Date = new Date()): ISODate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Pure calendar arithmetic; time zones are irrelevant because inputs are dates, not instants. */
export function addCalendarDays(date: ISODate, days: number): ISODate {
  const [y, m, d] = parts(date);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return toISO(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

export function normalizeYear(year: number): { ce: number; wasBe: boolean } {
  return year >= BE_THRESHOLD ? { ce: year - BE_OFFSET, wasBe: true } : { ce: year, wasBe: false };
}

/** Accepts `DD/MM/YYYY` or `YYYY-MM-DD`; the year may be BE or CE. Returns null when invalid. */
export function parseDateInput(input: string): ISODate | null {
  const trimmed = input.trim();
  let y: number;
  let m: number;
  let d: number;
  const iso = ISO_RE.exec(trimmed);
  const dmy = DMY_RE.exec(trimmed);
  if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (dmy) {
    [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  } else {
    return null;
  }
  const { ce } = normalizeYear(y);
  return isRealDate(ce, m, d) ? toISO(ce, m, d) : null;
}

export function formatDate(date: ISODate, locale: Locale): string {
  const [y, m, d] = parts(date);
  switch (locale) {
    case 'th':
      return `${d} ${THAI_MONTHS[m - 1]} ${y + BE_OFFSET}`;
    case 'en':
      return `${d} ${ENGLISH_MONTHS[m - 1]} ${y}`;
    case 'zh':
      return `${y}年${m}月${d}日`;
  }
}
