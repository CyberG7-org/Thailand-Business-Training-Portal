import { describe, expect, it } from 'vitest';
import { LOCALES } from '@/i18n/routing';
import { evaluateReadinessAnswer } from '@/lib/domain/interview/answer-validation';
import { READINESS_ITEMS, questionFor } from '@/lib/domain/interview/plan';
import type { PlanItem } from '@/lib/domain/interview/types';

const item = (concept: string, expected: string) => ({ concept, expected }) as PlanItem;

describe('five-language interview', () => {
  it('has a distinct fixed question for every readiness concept and language', () => {
    for (const definition of READINESS_ITEMS) {
      for (const language of LOCALES) {
        const question = questionFor(definition.concept, language, definition.question.th);
        expect(question, `${definition.concept}:${language}`).toBe(definition.question[language]);
        if (language !== 'th') expect(question).not.toBe(definition.question.th);
      }
    }
  });

  it.each([
    ['th', 'กรรมการ', 'ตัวอย่าง ทดสอบ เป็นกรรมการ'],
    ['en', 'Director', 'ตัวอย่าง ทดสอบ is a Director'],
    ['zh', '董事', 'ตัวอย่าง ทดสอบ 是董事'],
    ['ms', 'Pengarah', 'ตัวอย่าง ทดสอบ ialah pengarah'],
    ['ta', 'இயக்குநர்', 'ตัวอย่าง ทดสอบ இயக்குநர்'],
  ])(
    'accepts the director role in %s without requiring seal wording',
    (_language, role, identity) => {
      const signer = item(
        'authorized_representative',
        'ตัวอย่าง ทดสอบ / กรรมการหนึ่งคนลงนามและประทับตรา',
      );
      const attendee = item('attendee_identity', 'ตัวอย่าง ทดสอบ / กรรมการ');
      expect(evaluateReadinessAnswer(signer, role)).toBe('correct');
      expect(evaluateReadinessAnswer(attendee, identity)).toBe('correct');
      expect(evaluateReadinessAnswer(attendee, role)).toBe('wrong');
    },
  );

  it('accepts verified English company names and saved translated business facts', () => {
    const name = item('company_name', 'บริษัท วารัน เทรด จำกัด');
    expect(
      evaluateReadinessAnswer(name, 'WARAN TRADE CO., LTD.', undefined, 'WARAN TRADE CO., LTD.'),
    ).toBe('correct');
    expect(
      evaluateReadinessAnswer(name, 'OTHER TRADE CO., LTD.', undefined, 'WARAN TRADE CO., LTD.'),
    ).toBe('wrong');
    const business = item('actual_business', 'จำหน่ายเฟอร์นิเจอร์สำนักงาน');
    expect(
      evaluateReadinessAnswer(business, 'Menjual perabot pejabat', 'Menjual perabot pejabat'),
    ).toBe('correct');
    expect(evaluateReadinessAnswer(business, 'Menjual makanan', 'Menjual perabot pejabat')).toBe(
      'wrong',
    );
  });

  it('accepts the verified romanized province and subdistrict for a Thai legal address', () => {
    const address = item(
      'registered_address',
      '17/1 หมู่ที่ 6 ตำบลบ้านปึก อำเภอเมืองชลบุรี จังหวัดชลบุรี 20000 / Chon Buri / Ban Puek',
    );
    expect(evaluateReadinessAnswer(address, 'Ban Puek, Chon Buri')).toBe('correct');
    expect(evaluateReadinessAnswer(address, 'Bang Na, Bangkok')).toBe('wrong');
  });

  it('accepts dates, account purpose and figures written in the selected language', () => {
    const date = item('registration_date', '10 เมษายน 2569');
    expect(evaluateReadinessAnswer(date, '10 April 2026')).toBe('correct');
    expect(evaluateReadinessAnswer(date, '10 ஏப்ரல் 2026')).toBe('correct');
    expect(evaluateReadinessAnswer(date, '10 四月 2026')).toBe('correct');
    const purpose = item('account_purpose', 'รับเงินลูกค้าและจ่ายค่าใช้จ่ายบริษัท');
    expect(
      evaluateReadinessAnswer(purpose, 'Terima bayaran pelanggan dan bayar perbelanjaan syarikat'),
    ).toBe('correct');
    expect(
      evaluateReadinessAnswer(
        purpose,
        'வாடிக்கையாளரிடமிருந்து பணம் பெற, நிறுவனச் செலவுகளை செலுத்த',
      ),
    ).toBe('correct');
    const revenue = item('monthly_revenue', '2,700,000 บาท');
    expect(evaluateReadinessAnswer(revenue, '2.7 juta baht')).toBe('correct');
    expect(evaluateReadinessAnswer(revenue, '2,700,000 ரூபாய்')).toBe('correct');
  });
});
