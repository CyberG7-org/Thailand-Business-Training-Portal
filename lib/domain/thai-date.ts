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

/** Abbreviations as printed on DBD paperwork (มี.ค. and มิ.ย. differ only in the vowel). */
const THAI_MONTH_ABBREVIATIONS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];
const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
/** "9 เมษายน 2569", "5 เดือน สิงหาคม พ.ศ. 2569", "13 ก.ค. 2569", "13 July 2026", "13 Jul 2569". */
const DAY_MONTH_YEAR_RE =
  /^(?:วันที่\s*)?(\d{1,2})\s+(?:เดือน\s*)?(\S+)\s+(?:พ\.ศ\.|ค\.ศ\.)?\s*(\d{4})$/;
/** "July 13, 2026". */
const MONTH_DAY_YEAR_RE = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/;

function monthNumber(name: string): number | null {
  const thai = THAI_MONTHS.indexOf(name);
  if (thai >= 0) return thai + 1;
  const abbreviated = THAI_MONTH_ABBREVIATIONS.indexOf(name);
  if (abbreviated >= 0) return abbreviated + 1;
  const english = ENGLISH_MONTHS.findIndex(
    (m) =>
      m.toLowerCase() === name.toLowerCase() || m.slice(0, 3).toLowerCase() === name.toLowerCase(),
  );
  return english >= 0 ? english + 1 : null;
}

/** Thai numerals to Arabic digits, so "๑๓ กรกฎาคม ๒๕๖๙" reads like "13 กรกฎาคม 2569". */
function arabicDigits(text: string): string {
  return text.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));
}

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

/**
 * Accepts `DD/MM/YYYY` (also `-`/`.`), `YYYY-MM-DD`, and dates as certificates print them —
 * "9 เมษายน 2569", "5 เดือน สิงหาคม พ.ศ. 2569", "13 ก.ค. 2569", Thai numerals, "13 July 2026",
 * "July 13, 2026". The year may be BE or CE. Returns null when invalid.
 */
export function parseDateInput(input: string): ISODate | null {
  const trimmed = arabicDigits(input).trim().replace(/\s+/g, ' ');
  let y: number;
  let m: number | null;
  let d: number;
  const iso = ISO_RE.exec(trimmed);
  const dmy = DMY_RE.exec(trimmed);
  const named = DAY_MONTH_YEAR_RE.exec(trimmed);
  const english = MONTH_DAY_YEAR_RE.exec(trimmed);
  if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (dmy) {
    [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  } else if (named) {
    [d, m, y] = [Number(named[1]), monthNumber(named[2]), Number(named[3])];
  } else if (english) {
    [m, d, y] = [monthNumber(english[1]), Number(english[2]), Number(english[3])];
  } else {
    return null;
  }
  if (m === null) return null;
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
