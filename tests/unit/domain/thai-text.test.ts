import { describe, expect, it } from 'vitest';
import { normalizeThai, normalizeThaiDeep } from '@/lib/domain/thai-text';

const typed = 'เลขที่ 194/3 หมู่ที่ 2 ตำบลวังใหญ่ อำเภอเทพา จังหวัดสงขลา';

describe('normalizeThai', () => {
  it('leaves text typed on a keyboard as it is', () => {
    expect(normalizeThai(typed)).toBe(typed);
    expect(normalizeThai('SIRAPHAT SIAM CO., LTD.')).toBe('SIRAPHAT SIAM CO., LTD.');
    expect(normalizeThai('น้ำ')).toBe('น้ำ');
  });

  it('joins ำ written as two characters, with or without a tone mark', () => {
    expect(normalizeThai(typed.replaceAll('ำ', 'ํา'))).toBe(typed);
    // น้ำ as น + ํ + ้ + า, and as น + ้ + ํ + า.
    expect(normalizeThai('นํ้า')).toBe('น้ำ');
    expect(normalizeThai('น้ํา')).toBe('น้ำ');
  });

  it('puts a tone mark after the vowel it sits on', () => {
    // หมู่ as ม + ่ + ู, ที่ as ท + ่ + ี.
    expect(normalizeThai('หมู่ท่ี')).toBe('หมู่ที่');
  });

  it('turns the positional glyphs of a PDF font back into letters and marks', () => {
    // หมู่ and วังใหญ่ with a low mai ek (U+F70A), ญ without its lower part (U+F70F).
    expect(normalizeThai('หมูที่')).toBe('หมู่ที่');
    expect(normalizeThai('วังให')).toBe('วังใหญ่');
    // ำ with the nikhahit shifted left (U+F711), a vowel shifted left (U+F702).
    expect(normalizeThai('ตาบล')).toBe('ตำบล');
    expect(normalizeThai('ท่')).toBe('ที่');
  });

  it('drops a space left before a mark, and zero-width characters', () => {
    expect(normalizeThai('วังใหญ ่ อำเภอ')).toBe('วังใหญ่ อำเภอ');
    expect(normalizeThai('เท​พา')).toBe('เทพา');
  });
});

describe('normalizeThaiDeep', () => {
  it('normalises every string of a plain value and leaves the rest alone', () => {
    const at = new Date(0);
    const value = {
      company: { value: 'บริษัท ตัวอย่าง จํากัด', confidence: 0.9 },
      directors: [{ name_th: 'นายสมชาย ใจด', name_en: null }],
      pages: 3,
      at,
    };
    expect(normalizeThaiDeep(value)).toEqual({
      company: { value: 'บริษัท ตัวอย่าง จำกัด', confidence: 0.9 },
      directors: [{ name_th: 'นายสมชาย ใจดี', name_en: null }],
      pages: 3,
      at,
    });
  });
});
