import { describe, expect, it } from 'vitest';
import { studyPreview } from '@/lib/content/study-preview';

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
});
