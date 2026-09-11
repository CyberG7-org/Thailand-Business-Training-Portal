import { describe, expect, it } from 'vitest';
import {
  buildNameCardData,
  missingNameCardFields,
  withThaiBreaks,
  NAME_CARD_TEMPLATE_VERSION,
} from '@/lib/domain/name-card';
import { formatThaiMobile, normalizeThaiMobile } from '@/lib/domain/phone';

describe('normalizeThaiMobile', () => {
  it('accepts local and international forms and normalizes to 0XXXXXXXXX', () => {
    expect(normalizeThaiMobile('0812345678')).toBe('0812345678');
    expect(normalizeThaiMobile('081-234-5678')).toBe('0812345678');
    expect(normalizeThaiMobile('+66 81 234 5678')).toBe('0812345678');
    expect(normalizeThaiMobile('66812345678')).toBe('0812345678');
  });
  it('rejects landlines, short numbers and garbage', () => {
    expect(normalizeThaiMobile('021234567')).toBeNull();
    expect(normalizeThaiMobile('08123456')).toBeNull();
    expect(normalizeThaiMobile('abc')).toBeNull();
    expect(normalizeThaiMobile('')).toBeNull();
  });
  it('formats for display', () => {
    expect(formatThaiMobile('0812345678')).toBe('081-234-5678');
  });
});

describe('name card data', () => {
  const source = {
    company_name_th: 'บริษัท ทดสอบ จำกัด',
    company_name_en: 'TEST CO., LTD.',
    head_office_address: '99/9 หมู่ 1 ตำบลตัวอย่าง',
    juristic_id: '0105569000123',
    directors: [{ name_th: 'นางสาวตัวอย่าง ทดสอบ', name_en: null }],
    holder_name: null,
  };
  it('builds the render model, falling back to the first director as holder', () => {
    const d = buildNameCardData(source, '0812345678');
    expect(d.holderName).toBe('นางสาวตัวอย่าง ทดสอบ');
    expect(d.phoneDisplay).toBe('081-234-5678');
    expect(d.templateVersion).toBe(NAME_CARD_TEMPLATE_VERSION);
  });
  it('prefers the learner display name when present', () => {
    expect(buildNameCardData({ ...source, holder_name: 'สมชาย' }, '0812345678').holderName).toBe(
      'สมชาย',
    );
  });
  it('refuses to fabricate missing DBD fields', () => {
    expect(missingNameCardFields({ ...source, head_office_address: null })).toEqual([
      'head_office_address',
    ]);
    expect(() => buildNameCardData({ ...source, company_name_th: null }, '0812345678')).toThrow(
      /company_name_th/,
    );
    expect(() =>
      buildNameCardData({ ...source, directors: [], holder_name: '' }, '0812345678'),
    ).toThrow(/holder/);
  });
});

describe('withThaiBreaks', () => {
  it('inserts zero-width spaces between Thai words and leaves Latin readable', () => {
    const out = withThaiBreaks('บริษัททดสอบจำกัด TEST');
    expect(out.replace(/​/g, '')).toBe('บริษัททดสอบจำกัด TEST');
    expect(out.split('​').length).toBeGreaterThan(2);
  });
});
