/**
 * Thai text as a keyboard types it. A PDF's text layer often spells the same word with other
 * characters — ำ as two characters, a tone mark before its vowel or after a stray space, the
 * positional glyphs Windows fonts keep in the Private Use Area — and a reader that copies that
 * layer hands them on. They look the same (or lose a mark on screen) and compare unequal, so
 * every text read from a document is put through here before it is stored or compared.
 */

/** The Thai positional glyph variants of Windows fonts (U+F700–U+F71A) and what each stands for. */
const PUA: Record<string, string> = {
  '': 'ฐ', // ฐ without its lower part
  '': 'ิ', // ิ shifted left
  '': 'ี', // ี
  '': 'ึ', // ึ
  '': 'ื', // ื
  '': '่', // ่ low, shifted left
  '': '้', // ้
  '': '๊', // ๊
  '': '๋', // ๋
  '': '์', // ์
  '': '่', // ่ low
  '': '้', // ้
  '': '๊', // ๊
  '': '๋', // ๋
  '': '์', // ์
  '': 'ญ', // ญ without its lower part
  '': 'ั', // ั shifted left
  '': 'ํ', // ํ shifted left
  '': '็', // ็ shifted left
  '': '่', // ่ shifted left
  '': '้', // ้
  '': '๊', // ๊
  '': '๋', // ๋
  '': '์', // ์
  '': 'ุ', // ุ shifted down
  '': 'ู', // ู
  '': 'ฺ', // ฺ
};

const PUA_RE = /[-]/g;
const ZERO_WIDTH_RE = /[​-‍﻿]/g;
/** A space left between a letter and the mark that belongs on it. */
const SPACE_BEFORE_MARK_RE = /[ \t]+(?=[ัิ-ฺ็-๎])/g;
/** ำ written as ํ + า, with the tone mark between them. */
const NIKHAHIT_TONE_AA_RE = /ํ([่-๋])า/g;
const NIKHAHIT_AA_RE = /ํา/g;
/** A tone mark typed before the vowel it sits on. */
const TONE_BEFORE_VOWEL_RE = /([่-๋])([ัิ-ฺ])/g;

export function normalizeThai(text: string): string {
  return text
    .replace(ZERO_WIDTH_RE, '')
    .replace(PUA_RE, (c) => PUA[c] ?? c)
    .replace(SPACE_BEFORE_MARK_RE, '')
    .replace(NIKHAHIT_TONE_AA_RE, '$1ำ')
    .replace(NIKHAHIT_AA_RE, 'ำ')
    .replace(TONE_BEFORE_VOWEL_RE, '$2$1');
}

/** Every string inside a plain value — an extraction result, a list of pages — normalised. */
export function normalizeThaiDeep<T>(value: T): T {
  if (typeof value === 'string') return normalizeThai(value) as T;
  if (Array.isArray(value)) return value.map((item) => normalizeThaiDeep(item)) as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeThaiDeep(item)]),
    ) as T;
  }
  return value;
}
