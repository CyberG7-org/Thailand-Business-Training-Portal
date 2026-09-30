import { describe, expect, it } from 'vitest';
import { categoryInputHash } from '@/lib/domain/business-category';
import { readStructuredData } from '@/lib/domain/dbd-profile';

const address = {
  full: 'เลขที่ 87 หมู่ที่ 9 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด',
  house_no: '87',
  moo: '9',
  road: null,
  subdistrict: 'หนองใหญ่',
  district: 'โพนทอง',
  province: 'ร้อยเอ็ด',
  postcode: '45110',
  province_id: 33,
  district_id: 4507,
  subdistrict_id: 450705,
  postcode_source: 'geography',
  status: 'resolved',
  issues: [],
};
const category = {
  key: 'clothing_fashion',
  candidate_key: null,
  confidence: 0.95,
  source: 'auto',
  status: 'mapped',
  model: null,
  input_hash: 'abcd1234',
  error: null,
  decided_at: '2026-09-30T00:00:00.000Z',
};

describe('readStructuredData', () => {
  it('keeps the derived address and category so a save spreading it back keeps them', () => {
    const read = readStructuredData({ address, category, interview: {} });
    expect(read.address).toEqual(address);
    expect(read.category).toEqual(category);
    const resaved = readStructuredData({ ...read, interview: { nature_of_business: 'x' } });
    expect(resaved.address).toEqual(address);
    expect(resaved.category).toEqual(category);
  });

  it('reads a malformed address or category as absent without losing the rest', () => {
    const read = readStructuredData({
      address: { full: 1 },
      category: { status: 'maybe' },
      interview: { nature_of_business: 'ขายเสื้อผ้า' },
    });
    expect(read.address).toBeNull();
    expect(read.category).toBeNull();
    expect(read.interview?.nature_of_business).toBe('ขายเสื้อผ้า');
  });

  it('reads an empty column with neither', () => {
    expect(readStructuredData(null)).toMatchObject({ address: null, category: null });
  });
});

describe('categoryInputHash', () => {
  it('changes with the business words and ignores spacing', () => {
    const a = categoryInputHash('ขายเสื้อผ้า', 'เสื้อสตรี');
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(categoryInputHash('ขายเสื้อผ้า ', ' เสื้อสตรี')).toBe(a);
    expect(categoryInputHash('ขายรองเท้า', 'เสื้อสตรี')).not.toBe(a);
  });

  it('has nothing to hash without a nature of business', () => {
    expect(categoryInputHash(null, 'เสื้อ')).toBeNull();
    expect(categoryInputHash('  ', null)).toBeNull();
  });
});
