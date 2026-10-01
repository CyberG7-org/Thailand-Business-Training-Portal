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
        products_services: 'สายไฟ ท่อร้อยสาย และอุปกรณ์ติดตั้ง',
      },
      '0812345678',
      { nameTh: 'นางสาวตัวอย่าง ทดสอบ', nameEn: 'SAMPLE TESTER' },
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
      'SAMPLETESTER',
      NAME_CARD_COPY.tagline.replace(/\s/g, ''),
      'นางสาวตัวอย่างทดสอบ',
      'สายไฟ',
      'บริษัท',
    ]) {
      expect(squashed).toContain(expected);
    }
    expect(items.filter((item) => item.trimEnd().endsWith('-'))).toEqual([]);
    // Words with sara am (ำ) keep every glyph; the viewer may give the vowel back as one
    // code point or two. Every Thai word on this card is its own text object.
    expect(squashed).toMatch(/นามบัตรจ.{1,2}กัด/);
    expect(squashed).toMatch(/ตัวอย่างอ.{1,2}เภอตัวอย่าง/);
    expect(squashed).toMatch(/ส.{1,2}หรับงาน/);
  });
});
