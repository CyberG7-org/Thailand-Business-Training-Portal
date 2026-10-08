import { describe, expect, it } from 'vitest';
import { TRAINING_SYLLABUS } from '@/lib/content/training-syllabus';
import { MCQ_CONCEPTS } from '@/lib/domain/concepts/registry';

describe('the shared learner syllabus', () => {
  it('covers every quiz concept exactly once across the five study cards', () => {
    expect(TRAINING_SYLLABUS).toHaveLength(30);
    expect(TRAINING_SYLLABUS.map((item) => item.conceptKey).sort()).toEqual(
      MCQ_CONCEPTS.map((concept) => concept.key).sort(),
    );
    expect(new Set(TRAINING_SYLLABUS.map((item) => item.conceptKey))).toHaveLength(30);
    expect(new Set(TRAINING_SYLLABUS.map((item) => item.card))).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it('gives every concept three distinct, plain-language prompts in every locale', () => {
    for (const item of TRAINING_SYLLABUS) {
      for (const locale of ['th', 'en', 'zh'] as const) {
        const prompts = item.quizPrompts[locale];
        expect(prompts, `${item.conceptKey}:${locale}`).toHaveLength(3);
        expect(new Set(prompts).size, `${item.conceptKey}:${locale}`).toBe(3);
        // Thai and Chinese can express a complete question in far fewer characters than English.
        for (const prompt of prompts) expect(prompt.trim().length).toBeGreaterThan(4);
      }
    }
  });

  it('keeps the approved concept grouping stable', () => {
    const byCard = (card: number) =>
      TRAINING_SYLLABUS.filter((item) => item.card === card).map((item) => item.conceptKey);
    expect(byCard(1)).toEqual([
      'company_name',
      'registration_number',
      'registration_date',
      'registered_location',
      'director_count',
      'director_identity',
      'signing_authority',
    ]);
    expect(byCard(2)).toEqual(['registered_capital', 'shareholder_count', 'learner_shareholding']);
    expect(byCard(3)).toEqual([
      'actual_business',
      'products_services',
      'business_purpose',
      'main_clients',
      'client_origin',
      'main_suppliers',
      'actual_business_location',
    ]);
    expect(byCard(4)).toEqual([
      'monthly_revenue',
      'revenue_basis',
      'average_transaction',
      'monthly_transactions',
      'startup_source_of_funds',
      'first_incoming_funds',
      'bank_account_purpose',
      'promptpay_qr_purpose',
    ]);
    expect(byCard(5)).toEqual([
      'internet_banking_control',
      'otp_control',
      'transaction_explanation',
      'supporting_documents',
      'answer_consistency',
    ]);
  });
});
