import { describe, expect, it } from 'vitest';
import {
  CRITICAL_CONCEPT_KEYS,
  EVALUATION_CONCEPTS,
  INTERVIEW_CONCEPTS,
  MCQ_CONCEPTS,
  conceptTitle,
} from '@/lib/domain/concepts/registry';
import { STATUS_FACTS } from '@/lib/domain/facts/fact-sheet';

describe('the concept registry (spec §7.1)', () => {
  it('has 36 distinct concepts (D91 removed the examples of customers)', () => {
    expect(EVALUATION_CONCEPTS).toHaveLength(36);
    expect(new Set(EVALUATION_CONCEPTS.map((c) => c.key)).size).toBe(36);
    expect(EVALUATION_CONCEPTS.map((c) => c.key)).not.toContain('customer_examples');
  });

  it('keeps main customers as quiz question 14 only', () => {
    const main = EVALUATION_CONCEPTS.find((c) => c.key === 'main_clients')!;
    expect([main.mcqOrder, main.interviewSlot, main.interviewMatch]).toEqual([14, null, null]);
  });

  it('has exactly the 30 MCQ concepts in order 1–30', () => {
    expect(MCQ_CONCEPTS.map((c) => c.mcqOrder)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1),
    );
  });

  it('has exactly the nine critical concepts (D72)', () => {
    expect([...CRITICAL_CONCEPT_KEYS].sort()).toEqual(
      [
        'company_name',
        'registration_number',
        'registration_date',
        'registered_location',
        'registered_capital',
        'director_identity',
        'director_count',
        'actual_business',
        'signing_authority',
      ].sort(),
    );
  });

  it('has the 11 chatbot slots in the Owner’s order with the Owner’s match types (D78, D91)', () => {
    expect(INTERVIEW_CONCEPTS.map((c) => [c.key, c.interviewMatch])).toEqual([
      ['company_name', 'normalized'],
      ['registration_number', 'exact'],
      ['registered_address', 'structured'],
      ['actual_business', 'semantic'],
      ['products_services', 'semantic'],
      ['authorized_representative', 'structured'],
      ['attendee_identity', 'normalized'],
      ['registration_date', 'normalized'],
      ['account_purpose', 'semantic'],
      ['customer_profile', 'semantic'],
      ['transaction_details', 'semantic'],
    ]);
  });

  it('allows semantic grading only on open-text concepts', () => {
    for (const c of EVALUATION_CONCEPTS.filter((x) => x.interviewMatch === 'semantic')) {
      expect(c.answer, c.key).toBe('open_text');
    }
  });

  it('gives KYC policy concepts no facts, and every other concept at least one', () => {
    for (const c of EVALUATION_CONCEPTS) {
      expect(c.facts.length === 0, c.key).toBe(c.source === 'KYC_POLICY');
    }
  });

  it('only names known status facts as alternates', () => {
    for (const c of EVALUATION_CONCEPTS) {
      for (const s of c.alternateWhen) expect(STATUS_FACTS, c.key).toContain(s);
    }
  });

  it('keeps one alternate wording: whether the learner holds shares (D91)', () => {
    const alt = Object.fromEntries(
      EVALUATION_CONCEPTS.filter((c) => c.alternateWhen.length > 0).map((c) => [
        c.key,
        [...c.alternateWhen],
      ]),
    );
    expect(alt).toEqual({ learner_shareholding: ['learner_is_shareholder'] });
  });

  it('titles every concept in three languages', () => {
    expect(conceptTitle('registered_capital', 'th')).toBe('ทุนจดทะเบียน');
    expect(conceptTitle('registered_capital', 'en')).toBe('Registered capital');
    expect(conceptTitle('registered_capital', 'zh')).toBe('注册资本');
  });
});
