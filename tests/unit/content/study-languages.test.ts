import { describe, expect, it } from 'vitest';
import { BANK_INTERVIEW_CARDS, STUDY_LANGUAGES } from '@/lib/content/bank-interview-cards';
import {
  placeholderFields,
  renderTemplateLenient,
  type TemplateRecord,
} from '@/lib/domain/assessment/template';
import { studyDisplayRecord } from '@/lib/domain/facts/study-display';

describe('five-language study cards', () => {
  it('has complete cards with matching placeholders in every language', () => {
    expect(BANK_INTERVIEW_CARDS).toHaveLength(5);
    for (const card of BANK_INTERVIEW_CARDS) {
      const sourceFields = placeholderFields(card.localizations.th.body).sort();
      for (const language of STUDY_LANGUAGES) {
        expect(card.localizations[language].title).toBeTruthy();
        expect(placeholderFields(card.localizations[language].body).sort()).toEqual(sourceFields);
      }
    }
    expect(BANK_INTERVIEW_CARDS[2].localizations.ta.body).toContain(
      'நிறுவனத்தின் வணிகச் செயல்பாடுகள்',
    );
    expect(BANK_INTERVIEW_CARDS[2].localizations.ms.body).toContain('Aktiviti Perniagaan Syarikat');
    expect(BANK_INTERVIEW_CARDS[4].localizations.ta.body).toContain(
      'வங்கியாளர் கேட்கக்கூடும் கேள்விகள்',
    );
  });
});

describe('source-accurate study identity', () => {
  const record = {
    company_name_th: 'บริษัท วารัน เทรด จำกัด',
    company_name_en: 'WARAN TRADE CO., LTD.',
    head_office_address: '17/1 หมู่ที่ 6 ตำบลบ้านปึก อำเภอเมืองชลบุรี จังหวัดชลบุรี 20000',
    business_address: 'ร้านค้า ชลบุรี 20000',
    my_name: 'นายบดินทร์',
    directors: [{ name_th: 'นายบดินทร์', name_en: null }],
  } as TemplateRecord;
  const places = {
    province: { nameTh: 'ชลบุรี', nameEn: 'Chon Buri' },
    subdistrict: { nameTh: 'บ้านปึก', nameEn: 'Ban Puek' },
  };

  it('shows source identities and localized place rows in all five languages', () => {
    for (const language of STUDY_LANGUAGES) {
      const shown = studyDisplayRecord(record, language, places);
      const body = renderTemplateLenient(
        BANK_INTERVIEW_CARDS[0].localizations[language].body,
        shown,
        language,
      );
      expect(body).toContain('WARAN TRADE CO., LTD.');
      expect(body).toContain(record.head_office_address);
      expect(body).toContain('นายบดินทร์');
      expect(shown.province).toBe(language === 'th' ? 'ชลบุรี' : 'Chon Buri');
      expect(shown.subdistrict).toBe(language === 'th' ? 'บ้านปึก' : 'Ban Puek');
      expect(body).not.toContain('Waran Trade Company');
    }
    expect(record.company_name_th).toBe('บริษัท วารัน เทรด จำกัด');
  });

  it('falls back to the original Thai name only when no English name was supplied', () => {
    const shown = studyDisplayRecord({ ...record, company_name_en: null }, 'ms', places);
    expect(renderTemplateLenient('{company_name_en}', shown, 'ms')).toBe(record.company_name_th);
  });

  it('does not use a romanization whose Thai name differs from the supplied address', () => {
    const shown = studyDisplayRecord(record, 'ta', {
      province: { nameTh: 'ภูเก็ต', nameEn: 'Phuket' },
      subdistrict: { nameTh: 'บ้านปึก', nameEn: 'Ban Puek' },
    });
    expect(shown.province).toBe('ชลบุรี');
    expect(shown.subdistrict).toBe('Ban Puek');
  });

  it('does not guess an absent subdistrict and keeps the Malay date', () => {
    const shown = studyDisplayRecord(
      {
        ...record,
        head_office_address: '17/1 ชลบุรี 20000',
        province: 'จังหวัดอื่น',
      },
      'ta',
      places,
    );
    expect(renderTemplateLenient('{subdistrict}', shown, 'ta')).toBe('—');
    expect(renderTemplateLenient('{province}', shown, 'ta')).toBe('—');
    expect(
      renderTemplateLenient('{registered_on}', { ...record, registered_on: '2026-04-10' }, 'ms'),
    ).toContain('2026');
  });
});
