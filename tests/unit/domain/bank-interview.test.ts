import { describe, expect, it } from 'vitest';
import { TEMPLATE_FIELDS } from '@/lib/domain/assessment/template';
import {
  BANK_INTERVIEW_CONCEPTS,
  interviewProfileSchema,
  myShareholding,
} from '@/lib/domain/bank-interview';
import { BANK_INTERVIEW_CARDS } from '@/lib/content/bank-interview-cards';
import { DBD_CERTIFICATE_REFERENCE } from '@/lib/integrations/question-gen/dbd-reference';
import { BANK_OFFICER_SCRIPT } from '@/lib/integrations/vapi/config';

describe('bank-interview concepts', () => {
  it('lists the 16 questions from the bank, each with placeholders that exist', () => {
    expect(BANK_INTERVIEW_CONCEPTS).toHaveLength(16);
    for (const concept of BANK_INTERVIEW_CONCEPTS) {
      expect(concept.placeholders.length).toBeGreaterThan(0);
      for (const p of concept.placeholders) expect(TEMPLATE_FIELDS).toContain(p);
      expect(concept.question.th.length).toBeGreaterThan(3);
      expect(concept.question.zh.length).toBeGreaterThan(3);
    }
    expect(new Set(BANK_INTERVIEW_CONCEPTS.map((c) => c.id)).size).toBe(16);
  });

  it('is what the question generator and the call script are built on', () => {
    for (const concept of BANK_INTERVIEW_CONCEPTS) {
      expect(DBD_CERTIFICATE_REFERENCE).toContain(concept.question.en);
    }
    // The officer script covers every concept (numbered 1–16) and reads every fact variable.
    for (let i = 1; i <= 16; i++) expect(BANK_OFFICER_SCRIPT).toMatch(new RegExp(`\\n${i}\\. `));
    for (const v of ['my_shares', 'account_purpose', 'operations_status', 'shareholders_count']) {
      expect(BANK_OFFICER_SCRIPT).toContain(`{{${v}}}`);
    }
  });

  it('starter cards cover every concept placeholder in all three languages', () => {
    const covered = new Set<string>();
    for (const card of BANK_INTERVIEW_CARDS) {
      for (const lang of ['th', 'en', 'zh'] as const) {
        for (const m of card.localizations[lang].body.matchAll(/\{([a-z_]+)\}/g)) {
          expect(TEMPLATE_FIELDS).toContain(m[1]);
          covered.add(m[1]);
        }
      }
    }
    for (const concept of BANK_INTERVIEW_CONCEPTS) {
      expect(concept.placeholders.some((p) => covered.has(p))).toBe(true);
    }
  });

  it('matches the learner to a shareholder by name and derives the percentage', () => {
    const business = {
      objectives: [],
      business_categories: [],
      share_structure: {
        total_shares: 20000,
        par_value: 100,
        paid_up_capital: null,
        share_type: null,
      },
      shareholders: [
        { name: 'นางสาว ตัวอย่าง ทดสอบ', nationality: 'ไทย', shares: 19998, percent: null },
        { name: 'นายสอง ทดสอบ', nationality: 'ไทย', shares: 1, percent: null },
      ],
      promoters: [],
    };
    expect(myShareholding(business, 'นางสาวตัวอย่าง ทดสอบ')).toEqual({
      shares: 19998,
      percent: 99.99,
    });
    expect(myShareholding(business, 'ไม่มีคนนี้')).toEqual({ shares: null, percent: null });
    expect(myShareholding(null, 'x')).toEqual({ shares: null, percent: null });
    expect(interviewProfileSchema.parse({ account_purpose: ' รับเงินลูกค้า ' })).toMatchObject({
      account_purpose: 'รับเงินลูกค้า',
      monthly_volume: null,
    });
  });
});
