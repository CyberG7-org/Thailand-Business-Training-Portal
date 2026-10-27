import { describe, expect, it } from 'vitest';
import {
  BANK_INTERVIEW_CARDS,
  STUDY_LANGUAGES,
  studyLanguage,
} from '@/lib/content/bank-interview-cards';
import {
  placeholderFields,
  renderTemplateLenient,
  type TemplateRecord,
} from '@/lib/domain/assessment/template';
import { readingAidSource, withReadingAids } from '@/lib/domain/facts/study-reading-aids';
import { GeminiFactTranslator } from '@/lib/integrations/translation/gemini';

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

  it('accepts only supported study choices', () => {
    expect(studyLanguage('ta', 'en')).toBe('ta');
    expect(studyLanguage('ms', 'en')).toBe('ms');
    expect(studyLanguage('../admin', 'en')).toBe('en');
  });
});

describe('Thai-first study reading aids', () => {
  const record = {
    company_name_th: 'บริษัท วารัน เทรด จำกัด',
    company_name_en: 'WARAN TRADE CO., LTD.',
    head_office_address: '17/1 หมู่ที่ 6 ชลบุรี 20000',
    business_address: 'ร้านค้า ชลบุรี 20000',
    my_name: 'นายบดินทร์',
    directors: [{ name_th: 'นายบดินทร์', name_en: null }],
    shareholders: [{ name: 'นายบดินทร์', shares: 10, nationality: null, percent: 100 }],
  } as TemplateRecord;

  it('preserves originals and adds a second-line reading aid', () => {
    const source = readingAidSource(record);
    expect(source.head_office_address).toContain('20000');
    const result = withReadingAids(
      record,
      {
        company_name_th: 'Waran Trade Company',
        head_office_address: '17/1 Moo 6 Chonburi 20000',
        director_0: 'Mr Bodin',
      },
      'en',
    );
    expect(result.company_name_th).toBe('บริษัท วารัน เทรด จำกัด\u2028WARAN TRADE CO., LTD.');
    expect(result.head_office_address).toBe(
      '17/1 หมู่ที่ 6 ชลบุรี 20000\u202817/1 Moo 6 Chonburi 20000',
    );
    expect(result.directors?.[0].name_th).toBe('นายบดินทร์\u2028Mr Bodin');
    expect(record.company_name_th).toBe('บริษัท วารัน เทรด จำกัด');
  });

  it('renders a Thai-only fallback and translated Malay date', () => {
    expect(withReadingAids(record, {}, 'ta').head_office_address).toBe(record.head_office_address);
    const shown = renderTemplateLenient('{head_office_address}', record, 'ta');
    expect(shown).toContain('20000');
    expect(
      renderTemplateLenient('{registered_on}', { ...record, registered_on: '2026-04-10' }, 'ms'),
    ).toContain('2026');
  });
});

describe('generated reading aids', () => {
  it('rejects an address translation that changes the supplied postcode', async () => {
    const request = async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      head_office_address: '17/1 Chonburi 20001',
                      my_name: 'Mr Bodin',
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      );
    const translator = new GeminiFactTranslator('test-key', request as typeof fetch);
    const result = await translator.translateReadingAids(
      {
        head_office_address: '17/1 ชลบุรี 20000',
        my_name: 'นายบดินทร์',
      },
      'en',
    );
    expect(result).toEqual({ my_name: 'Mr Bodin' });
  });
});
