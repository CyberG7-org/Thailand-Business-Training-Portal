import { normalizeThai } from '@/lib/domain/thai-text';

/**
 * Splits a printed Thai registered address into its parts (spec 2026-09-30 §5.2, D73). Purely
 * textual: the parts are names as printed; `resolve.ts` checks them against the geography tables
 * and nothing here guesses a missing part.
 */
export type ParsedAddress = {
  house_no: string | null;
  moo: string | null;
  road: string | null;
  subdistrict: string | null;
  district: string | null;
  province: string | null;
  postcode: string | null;
};

type Part = 'moo' | 'road' | 'subdistrict' | 'district' | 'province' | 'skip';

/** Printed markers, longest first so "หมู่ที่" wins over "หมู่" and "ตำบล" over "ต.". */
const MARKERS: [string, Part][] = [
  ['หมู่ที่', 'moo'],
  ['จังหวัด', 'province'],
  ['อำเภอ', 'district'],
  ['ตำบล', 'subdistrict'],
  ['แขวง', 'subdistrict'],
  ['หมู่', 'moo'],
  ['ถนน', 'road'],
  ['ซอย', 'skip'],
  ['เขต', 'district'],
  ['ม.', 'moo'],
  ['ถ.', 'road'],
  ['ซ.', 'skip'],
  ['ต.', 'subdistrict'],
  ['อ.', 'district'],
  ['จ.', 'province'],
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A marker counts only at the start or after a space or comma, never inside a word. */
const MARKER_RE = new RegExp(`(^|[\\s,])(${MARKERS.map(([m]) => escape(m)).join('|')})`, 'g');
const PART_OF = new Map(MARKERS);

const BANGKOK_NAMES = /^(กรุงเทพมหานคร|กรุงเทพฯ|กรุงเทพ|กทม\.?)$/;
/** Bangkok is printed without "จังหวัด"; give it one so it parses like any province. */
const BANGKOK_IN_TEXT = /(^|[\s,])(กรุงเทพมหานคร|กรุงเทพฯ|กรุงเทพ|กทม\.?)(?=$|[\s,\d])/;
const POSTCODE_RE = /(^|[\s,])(\d{5})(?=$|[\s,])/g;
const HOUSE_RE = /^\s*(?:เลขที่\s*)?(\d+(?:\/\d+)*(?:-\d+)?)/;
/** A whole printed line: "สำนักงานแห่งใหญ่ ตั้งอยู่เลขที่ 194/3 …". */
const HOUSE_AFTER_LABEL_RE = /เลขที่\s*(\d+(?:\/\d+)*(?:-\d+)?)/;
/** A certificate closes the address with a slash; a typed one may end in a stop or a comma. */
const TRAILING_RE = /[\s/.,;]+$/;

const EMPTY: ParsedAddress = {
  house_no: null,
  moo: null,
  road: null,
  subdistrict: null,
  district: null,
  province: null,
  postcode: null,
};

/**
 * หมู่ read without its mark is หมู; before ที่ or a number in an address it can only be the moo
 * marker a reader dropped the mark from (D92).
 */
const MOO_WITHOUT_MARK_RE = /(^|[\s,])หมู(?=ที่|\s*\d)/g;
export function restoreMooMark(text: string): string {
  return text.replace(MOO_WITHOUT_MARK_RE, '$1หมู่');
}

export function normalizePlaceName(name: string): string {
  const compact = normalizeThai(name)
    .replace(TRAILING_RE, '')
    .replace(/\s+/g, '')
    .replace(/^(จังหวัด|อำเภอ|เขต|ตำบล|แขวง|จ\.|อ\.|ต\.)/, '');
  return BANGKOK_NAMES.test(compact) ? 'กรุงเทพมหานคร' : compact;
}

function clean(value: string): string | null {
  const v = value.replace(/\s+/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '');
  return v.length > 0 ? v : null;
}

export function parseThaiAddress(printed: string): ParsedAddress {
  // The markers are matched character by character, so the text is first spelled the way a
  // keyboard spells it: a PDF's text layer writes ตำบล, อำเภอ and หมู่ with other characters.
  let text = restoreMooMark(normalizeThai(printed))
    .replace(/\s+/g, ' ')
    .replace(TRAILING_RE, '')
    .trim();
  if (!text) return { ...EMPTY };
  const result: ParsedAddress = { ...EMPTY };

  const house = HOUSE_RE.exec(text) ?? HOUSE_AFTER_LABEL_RE.exec(text);
  if (house) result.house_no = house[1];

  // The postcode is the last standalone five-digit number after the house number.
  const houseEnd = house ? house.index + house[0].length : 0;
  const postcodes = [...text.matchAll(POSTCODE_RE)].filter((m) => (m.index ?? 0) >= houseEnd);
  const postcode = postcodes.at(-1);
  if (postcode) {
    result.postcode = postcode[2];
    const at = (postcode.index ?? 0) + postcode[1].length;
    text = `${text.slice(0, at)} ${text.slice(at + 5)}`;
  }

  text = text.replace(BANGKOK_IN_TEXT, '$1จังหวัดกรุงเทพมหานคร');

  const hits = [...text.matchAll(MARKER_RE)].map((m) => {
    const start = (m.index ?? 0) + m[1].length;
    return { part: PART_OF.get(m[2]) ?? 'skip', start, end: start + m[2].length };
  });
  hits.forEach((hit, i) => {
    if (hit.part === 'skip') return;
    const raw = text.slice(hit.end, hits[i + 1]?.start ?? text.length);
    const value = clean(raw);
    if (!value || result[hit.part] !== null) return;
    if (hit.part === 'moo') {
      result.moo = /\d+/.exec(value)?.[0] ?? null;
    } else if (hit.part === 'province') {
      result.province = normalizePlaceName(value);
    } else {
      result[hit.part] = value;
    }
  });
  return result;
}
