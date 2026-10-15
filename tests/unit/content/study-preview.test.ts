import { describe, expect, it } from 'vitest';
import { BANK_INTERVIEW_CARDS } from '@/lib/content/bank-interview-cards';
import { studyPreview } from '@/lib/content/study-preview';
import { renderTemplateLenient, type TemplateRecord } from '@/lib/domain/assessment/template';

describe('studyPreview', () => {
  it('uses the opening sentence and the first two populated facts from a card', () => {
    const preview = studyPreview(`Learn these company facts.

| What to remember | Your answer |
|---|---|
| Full name | **Example Co., Ltd.** |
| Missing shares | — shares at — Baht each |
| Registration number | 0105568233704 |
| Director | Someone Else |`);

    expect(preview).toEqual({
      introduction: 'Learn these company facts.',
      facts: [
        { label: 'Full name', value: 'Example Co., Ltd.' },
        { label: 'Registration number', value: '0105568233704' },
      ],
    });
  });

  it('handles a card without a fact table', () => {
    expect(studyPreview('Just read this short note.')).toEqual({
      introduction: 'Just read this short note.',
      facts: [],
    });
  });

  it('shows the learner share-count question and answer in card 2 and its preview', () => {
    const card = BANK_INTERVIEW_CARDS.find(
      (item) => item.contentKey === 'bank-interview-2-ownership',
    )!;
    const record = {
      registered_capital: 4_000_000,
      total_shares: 40_000,
      par_value: 100,
      my_shares: 36_000,
      my_share_percent: 90,
    } as TemplateRecord;
    const labels = {
      en: ['How many shares do you hold?', '36,000 shares (90%)'],
      th: ['คุณถือหุ้นกี่หุ้น?', '36,000 หุ้น (90%)'],
      zh: ['您持有多少股？', '36,000 股（90%）'],
      ms: ['Berapa saham yang anda pegang?', '36,000 saham (90%)'],
    } as const;

    for (const locale of ['en', 'th', 'zh', 'ms'] as const) {
      const body = renderTemplateLenient(card.localizations[locale]!.body, record, locale);
      const { facts } = studyPreview(body);
      expect(facts[1], locale).toEqual({ label: labels[locale][0], value: labels[locale][1] });
    }
  });
});
