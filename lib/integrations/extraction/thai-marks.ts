/**
 * A rule for every prompt that reads a PDF. A DBD certificate's text layer writes most low tone
 * marks, shifted vowels and ์ as private-use characters of the Thai font (about 300 on one
 * certificate: ผู้ถือหุ้น is stored as ผู + U+F70B + ถือหุ + U+F70B + น), and out of order. A
 * reader that copies that layer drops them: the Owner's record read หมูที่ and วังใหญ, and the
 * address no longer matched the geography tables. The rule names the characters so the reader
 * writes the mark that is printed; `withThaiNormalization` converts any it copies as they are.
 */
export const THAI_MARKS_RULE = [
  'Thai tone marks and vowels — never drop one. The text layer of these PDFs writes many of them as private-use',
  'characters (U+F700–U+F71A) and out of order, so a word copied from it loses its mark: ผู้ถือหุ้น becomes ผูถือหุน, หมู่',
  'becomes หมู, ใหญ่ becomes ใหญ, ค้า becomes คา, พงษ์ becomes พงษ. Write every word as it is printed on the page,',
  'with the standard character: U+F705, U+F70A, U+F713 are ่ · U+F706, U+F70B, U+F714 are ้ · U+F707, U+F70C, U+F715',
  'are ๊ · U+F708, U+F70D, U+F716 are ๋ · U+F709, U+F70E, U+F717 are ์ · U+F710 is ั · U+F711 is ํ · U+F712 is ็ ·',
  'U+F701–U+F704 are ิ ี ึ ื · U+F718–U+F71A are ุ ู ฺ · U+F700 is ฐ · U+F70F is ญ. This applies to every value you',
  'return — names, addresses, objectives, list rows and quoted source text alike.',
].join('\n');
