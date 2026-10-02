import { describe, expect, it } from 'vitest';
import { normalizePlaceName, parseThaiAddress } from '@/lib/domain/geo/address';

describe('parseThaiAddress', () => {
  it('reads a DBD-style provincial address', () => {
    expect(
      parseThaiAddress('เลขที่ 87 หมู่ที่ 9 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด 45110'),
    ).toEqual({
      house_no: '87',
      moo: '9',
      road: null,
      subdistrict: 'หนองใหญ่',
      district: 'โพนทอง',
      province: 'ร้อยเอ็ด',
      postcode: '45110',
    });
  });

  it('reads the abbreviated markers', () => {
    expect(parseThaiAddress('87 ม.9 ต.หนองใหญ่ อ.โพนทอง จ.ร้อยเอ็ด')).toEqual({
      house_no: '87',
      moo: '9',
      road: null,
      subdistrict: 'หนองใหญ่',
      district: 'โพนทอง',
      province: 'ร้อยเอ็ด',
      postcode: null,
    });
  });

  it('reads a Bangkok address with แขวง/เขต, a road with a number and "กรุงเทพฯ"', () => {
    expect(
      parseThaiAddress('เลขที่ 999/9 ถนนพระราม 4 แขวงสุริยวงศ์ เขตบางรัก กรุงเทพฯ 10500'),
    ).toEqual({
      house_no: '999/9',
      moo: null,
      road: 'พระราม 4',
      subdistrict: 'สุริยวงศ์',
      district: 'บางรัก',
      province: 'กรุงเทพมหานคร',
      postcode: '10500',
    });
  });

  it('skips a soi without letting it into the road', () => {
    expect(
      parseThaiAddress(
        '99 ซอยสุขุมวิท 21 ถนนสุขุมวิท แขวงคลองเตยเหนือ เขตวัฒนา กรุงเทพมหานคร 10110',
      ),
    ).toMatchObject({
      house_no: '99',
      road: 'สุขุมวิท',
      subdistrict: 'คลองเตยเหนือ',
      district: 'วัฒนา',
      province: 'กรุงเทพมหานคร',
      postcode: '10110',
    });
  });

  it('returns nothing for a blank address', () => {
    expect(parseThaiAddress('   ')).toEqual({
      house_no: null,
      moo: null,
      road: null,
      subdistrict: null,
      district: null,
      province: null,
      postcode: null,
    });
  });
});

describe('parseThaiAddress on text copied from a PDF', () => {
  const typed = 'เลขที่ 194/3 หมู่ที่ 2 ตำบลวังใหญ่ อำเภอเทพา จังหวัดสงขลา';
  const parts = {
    house_no: '194/3',
    moo: '2',
    road: null,
    subdistrict: 'วังใหญ่',
    district: 'เทพา',
    province: 'สงขลา',
    postcode: null,
  };

  it('reads the same parts whichever characters spell ตำบล, อำเภอ and หมู่', () => {
    expect(parseThaiAddress(typed)).toEqual(parts);
    // ำ as two characters.
    expect(parseThaiAddress(typed.replaceAll('\u0E33', '\u0E4D\u0E32'))).toEqual(parts);
    // The tone mark of หมู่ before its vowel.
    expect(parseThaiAddress(typed.replace('หมู\u0E48', 'หม\u0E48\u0E39'))).toEqual(parts);
    // The positional glyphs of a Windows font: a low mai ek on หมู่ and วังใหญ่.
    expect(
      parseThaiAddress(typed.replace('หมู\u0E48', 'หมู\uF70A').replace('ใหญ\u0E48', 'ใหญ\uF70A')),
    ).toEqual(parts);
  });

  it('reads หมู่ that lost its mark as the moo it is (D92)', () => {
    expect(parseThaiAddress('เลขที่ 194/3 หมูที่ 2 ตำบลวังใหญ อำเภอเทพา จังหวัดสงขลา')).toEqual({
      ...parts,
      subdistrict: 'วังใหญ',
    });
    expect(parseThaiAddress('99 หมู 4 ตำบลวังใหญ่ อำเภอเทพา จังหวัดสงขลา').moo).toBe('4');
    // A name that merely starts with หมู is left alone.
    expect(parseThaiAddress('1 ถนนหมูทอง ตำบลวังใหญ่ อำเภอเทพา จังหวัดสงขลา').road).toBe('หมูทอง');
  });

  it('reads a whole certificate line: its label in front, a slash at the end', () => {
    expect(
      parseThaiAddress(
        'สำนักงานแห่งใหญ่ ตั้งอยู่เลขที่ 194/3  หมู่ที่ 2 ตำบลวังใหญ่ อำเภอเทพา จังหวัดสงขลา/',
      ),
    ).toEqual(parts);
    expect(normalizePlaceName('สงขลา/')).toBe('สงขลา');
  });
});

describe('normalizePlaceName', () => {
  it('drops spaces and a stray prefix, and spells Bangkok one way', () => {
    expect(normalizePlaceName('เมือง ร้อยเอ็ด')).toBe('เมืองร้อยเอ็ด');
    expect(normalizePlaceName('อำเภอโพนทอง')).toBe('โพนทอง');
    expect(normalizePlaceName('กรุงเทพฯ')).toBe('กรุงเทพมหานคร');
    expect(normalizePlaceName('กทม.')).toBe('กรุงเทพมหานคร');
  });
});
