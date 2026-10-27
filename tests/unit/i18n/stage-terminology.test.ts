import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const labels = {
  en: { exam: 'Quiz', interview: 'Interview', nameCard: 'Namecard' },
  th: { exam: 'แบบทดสอบ', interview: 'สัมภาษณ์', nameCard: 'นามบัตร' },
  zh: { exam: '测验', interview: '面试', nameCard: '名片' },
  ms: { exam: 'Kuiz', interview: 'Temu Duga', nameCard: 'Kad Nama' },
  ta: { exam: 'வினாடி வினா', interview: 'நேர்காணல்', nameCard: 'பெயர் அட்டை' },
} as const;

const retiredNames = {
  en: /Business Knowledge Quiz|(?:Bank )?Readiness Interview|Name card|name card/iu,
  th: /แบบทดสอบความรู้ธุรกิจ|สัมภาษณ์ความพร้อม/u,
  zh: /业务知识测验|银行准备面试|准备度面试/u,
} as const;

describe('stage terminology', () => {
  for (const locale of Object.keys(labels) as (keyof typeof labels)[]) {
    it(`uses the same short names throughout ${locale} UI copy`, () => {
      const source = readFileSync(`messages/${locale}.json`, 'utf8');
      const messages = JSON.parse(source);
      const expected = labels[locale];

      for (const stage of ['exam', 'interview', 'nameCard'] as const) {
        expect(messages.stages.titles[stage]).toBe(expected[stage]);
        expect(messages.stages.short[stage]).toBe(expected[stage]);
        expect(messages.study.tabs[stage]).toBe(expected[stage]);
      }
      expect(messages.exam.title).toBe(expected.exam);
      expect(messages.interview.title).toBe(expected.interview);
      if (messages.nameCard?.title) expect(messages.nameCard.title).toBe(expected.nameCard);
      if (locale === 'en' || locale === 'th' || locale === 'zh') {
        expect(source).not.toMatch(retiredNames[locale]);
      }
    });
  }
});
