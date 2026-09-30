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

describe('normalizePlaceName', () => {
  it('drops spaces and a stray prefix, and spells Bangkok one way', () => {
    expect(normalizePlaceName('เมือง ร้อยเอ็ด')).toBe('เมืองร้อยเอ็ด');
    expect(normalizePlaceName('อำเภอโพนทอง')).toBe('โพนทอง');
    expect(normalizePlaceName('กรุงเทพฯ')).toBe('กรุงเทพมหานคร');
    expect(normalizePlaceName('กทม.')).toBe('กรุงเทพมหานคร');
  });
});
