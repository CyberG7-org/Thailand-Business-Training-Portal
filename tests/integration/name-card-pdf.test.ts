import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { NAME_CARD_COPY, buildNameCardData } from '@/lib/domain/name-card';
import { countPages } from '@/lib/pdf/slice';
import { ReactPdfRenderer } from '@/lib/integrations/pdf/name-card';
import { pdfTextItems } from './pdf-text';

describe('name card PDF (spike S3)', () => {
  it('renders Thai text and digits with the embedded font', async () => {
    const data = buildNameCardData(
      {
        company_name_th: 'บริษัท ตัวอย่างนามบัตร จำกัด',
        company_name_en: 'SAMPLE CARD CO., LTD.',
        head_office_address: '99/9 หมู่ 1 ตำบลตัวอย่าง อำเภอตัวอย่าง จังหวัดตัวอย่าง 10110',
        juristic_id: '0105569000134',
        contact_email: 'contact@example.co.th',
        nature_of_business: 'ค้าปลีกอุปกรณ์ไฟฟ้าสำหรับงานติดตั้ง',
      },
      '0812345678',
      'นางสาวตัวอย่าง ทดสอบ',
      {
        website: 'https://www.sample-card.co.th',
        facebookPage: 'https://www.facebook.com/samplecard',
      },
    );
    const bytes = await new ReactPdfRenderer().renderNameCard(data);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(10_000); // font subset embedded
    expect(await countPages(bytes)).toBe(2); // front and back (D63)
    // 90 × 54 mm, landscape (D24); a zero height would print nothing.
    const { width, height } = (await PDFDocument.load(bytes)).getPage(0).getSize();
    expect(width).toBeCloseTo(90 * 2.8346, 0);
    expect(height).toBeCloseTo(54 * 2.8346, 0);

    // What a viewer shows: the record's values, the shared copy, and Thai broken between
    // words. Letter-spaced text comes back a glyph per item, so compare without whitespace;
    // a hyphen at the end of an item is the layout engine breaking inside a word.
    const items = (await pdfTextItems(bytes)).flat();
    const squashed = items.join('').replace(/\s/g, '');
    for (const expected of [
      '081-234-5678',
      '0105569000134',
      NAME_CARD_COPY.tagline.replace(/\s/g, ''),
      'นางสาวตัวอย่างทดสอบ',
      'บริษัท',
      // The learner's website and Facebook page, as people read them (D99).
      'sample-card.co.th',
      'samplecard',
    ]) {
      expect(squashed).toContain(expected);
    }
    expect(items.filter((item) => item.trimEnd().endsWith('-'))).toEqual([]);
    // The back keeps the holder, the phone, the email, the address and the learner's links
    // (D96, D99): no registration number (on the front only), no products, no version.
    expect(squashed).not.toContain('CorporateRegistrationNo.');
    expect(squashed).not.toContain('PRODUCTS');
    expect(squashed).not.toContain('two-sided');
    expect(squashed).toContain('contact@example.co.th');
    // Words with sara am (ำ) keep every glyph; the viewer may give the vowel back as one
    // code point or two. Every Thai word on this card is its own text object.
    expect(squashed).toMatch(/นามบัตรจ.{1,2}กัด/);
    expect(squashed).toMatch(/ตัวอย่างอ.{1,2}เภอตัวอย่าง/);
    expect(squashed).toMatch(/ส.{1,2}หรับงาน/);
  });

  it('wraps a long address on the back and keeps it to the card', async () => {
    const data = buildNameCardData(
      {
        company_name_th: 'บริษัท ตัวอย่างนามบัตร จำกัด',
        company_name_en: 'SAMPLE CARD CO., LTD.',
        head_office_address: '99/9 หมู่ 1 ตำบลตัวอย่าง อำเภอตัวอย่าง จังหวัดตัวอย่าง 10110',
        juristic_id: '0105569000134',
        contact_email: 'contact@example.co.th',
        nature_of_business: 'ค้าปลีก',
      },
      '0812345678',
      'นางสาวตัวอย่าง ทดสอบ',
      {
        website: 'https://www.sample-card.co.th/collections/' + 'summer'.repeat(40),
        facebookPage: 'https://www.facebook.com/samplecard',
      },
    );
    const bytes = await new ReactPdfRenderer().renderNameCard(data);
    // Still one card: front and back, nothing pushed onto a third page.
    expect(await countPages(bytes)).toBe(2);
    const squashed = (await pdfTextItems(bytes)).flat().join('').replace(/\s/g, '');
    expect(squashed).toContain('sample-card.co.th/collections/');
    expect(squashed).toContain('…');
  });

  it('omits the website row completely when the company pack has no website', async () => {
    const data = buildNameCardData(
      {
        company_name_th: 'บริษัท ไม่มีเว็บไซต์ จำกัด',
        company_name_en: 'NO WEBSITE CO., LTD.',
        head_office_address: '99/9 หมู่ 1 ตำบลตัวอย่าง อำเภอตัวอย่าง จังหวัดตัวอย่าง 10110',
        juristic_id: '0105569000134',
        contact_email: 'contact@example.co.th',
        nature_of_business: 'ค้าปลีกอาหาร',
      },
      '0812345678',
      'นางสาวตัวอย่าง ทดสอบ',
      { website: null, facebookPage: 'https://www.facebook.com/nowebsite' },
    );

    expect(data.website).toBeNull();
    const bytes = await new ReactPdfRenderer().renderNameCard(data);
    expect(await countPages(bytes)).toBe(2);
    const squashed = (await pdfTextItems(bytes)).flat().join('').replace(/\s/g, '');
    expect(squashed).toContain('nowebsite');
    expect(squashed).not.toContain('undefined');
  });
});
