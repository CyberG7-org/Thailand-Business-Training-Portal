import { describe, expect, it } from 'vitest';
import {
  NAME_CARD_COPY,
  NAME_CARD_TEMPLATE_VERSION,
  buildNameCardData,
  companyInitials,
  missingNameCardFields,
  thaiWords,
  type NameCardSource,
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

const source: NameCardSource = {
  company_name_th: 'บริษัท ธาราวาณิช จำกัด',
  company_name_en: 'THARA VANICH CO., LTD.',
  head_office_address: '99/9 หมู่ 1 ตำบลตัวอย่าง',
  juristic_id: '0105569000134',
  contact_email: 'contact@example.co.th',
  nature_of_business: 'ค้าปลีกอุปกรณ์ไฟฟ้า',
  products_services: 'สายไฟและอุปกรณ์ติดตั้ง',
};
const holder = { nameTh: 'นายตัวอย่าง นามสมมติ', nameEn: 'Sample Holder' };

/** One two-sided design for every company (D63): the learner names the holder, the record does the rest. */
describe('name card data', () => {
  it('builds the render model from the record and the name the learner typed', () => {
    const d = buildNameCardData(source, '0812345678', holder);
    expect(d.holderName).toBe('นายตัวอย่าง นามสมมติ');
    expect(d.holderNameEn).toBe('Sample Holder');
    expect(d.companyInitials).toBe('TV');
    expect(d.phoneDisplay).toBe('081-234-5678');
    expect(d.email).toBe('contact@example.co.th');
    expect(d.natureOfBusiness).toBe('ค้าปลีกอุปกรณ์ไฟฟ้า');
    expect(d.productsServices).toBe('สายไฟและอุปกรณ์ติดตั้ง');
    expect(d.templateVersion).toBe(NAME_CARD_TEMPLATE_VERSION);
    expect(d.templateVersion).toBe('two-sided-v2');
  });

  it('keeps the English name and the business answers optional', () => {
    const d = buildNameCardData(
      { ...source, company_name_en: null, nature_of_business: null, products_services: '  ' },
      '0812345678',
      { nameTh: 'สมชาย', nameEn: '' },
    );
    expect(d.companyNameEn).toBeNull();
    expect(d.holderNameEn).toBeNull();
    expect(d.natureOfBusiness).toBeNull();
    expect(d.productsServices).toBeNull();
  });

  it('refuses to fabricate missing DBD fields or a nameless holder', () => {
    expect(missingNameCardFields({ ...source, head_office_address: null })).toEqual([
      'head_office_address',
    ]);
    expect(() =>
      buildNameCardData({ ...source, company_name_th: null }, '0812345678', holder),
    ).toThrow(/company_name_th/);
    expect(() => buildNameCardData(source, '0812345678', { nameTh: '  ', nameEn: null })).toThrow(
      /holder/,
    );
  });
});

/** The monogram fits every company: initials of the English name, else the Thai name's first letter. */
describe('companyInitials', () => {
  it('drops the legal words and takes two initials', () => {
    expect(companyInitials('THARA VANICH CO., LTD.', null)).toBe('TV');
    expect(companyInitials('Siam Cement Public Company Limited', null)).toBe('SC');
    expect(companyInitials('The Example Company Limited', null)).toBe('E');
  });
  it('falls back to the first Thai letter with its mark, past the legal prefix', () => {
    expect(companyInitials(null, 'บริษัท เกื้อกูล จำกัด')).toBe('เ');
    expect(companyInitials(null, 'ห้างหุ้นส่วนจำกัด ที่ดี')).toBe('ที่');
    expect(companyInitials('', '')).toBe('');
  });
});

/** The tagline and slogan are the same on every card and live in one place the owner can edit. */
describe('NAME_CARD_COPY', () => {
  it('carries a tagline and a two-language slogan', () => {
    expect(NAME_CARD_COPY.tagline.length).toBeGreaterThan(0);
    expect(NAME_CARD_COPY.sloganTh.length).toBeGreaterThan(0);
    expect(NAME_CARD_COPY.sloganEn.length).toBeGreaterThan(0);
  });
});

/** Thai has no spaces between words; the card breaks lines between the pieces this returns. */
describe('thaiWords', () => {
  it('splits Thai into dictionary words and keeps Latin words and digits whole', () => {
    const words = thaiWords('บริษัททดสอบจำกัด 99/9 TEST');
    expect(words.join('')).toBe('บริษัททดสอบจำกัด 99/9 TEST');
    expect(words.filter((w) => /[฀-๿]/.test(w)).length).toBeGreaterThan(1);
    expect(words).toContain('99/9 ');
    expect(words).toContain('TEST');
  });

  it('keeps a space on the word before it, so no piece starts with one or is only space', () => {
    const words = thaiWords('  หมู่ 1   ตำบลตัวอย่าง \n');
    expect(words.join('')).toBe('หมู่ 1 ตำบลตัวอย่าง');
    expect(words.every((w) => w.trim().length > 0 && !w.startsWith(' '))).toBe(true);
    expect(thaiWords('   ')).toEqual([]);
  });
});
