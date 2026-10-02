import { describe, expect, it } from 'vitest';
import { MCQ_STARTER } from '@/lib/content/mcq-starter';
import { MCQ_CONCEPTS } from '@/lib/domain/concepts/registry';
import { buildAttemptQuestions } from '@/lib/domain/mcq/attempt';
import { renderVariant } from '@/lib/domain/mcq/render';
import { SAMPLE_CONTEXT } from '@/lib/domain/mcq/sample';
import type { Variant } from '@/lib/domain/mcq/variant';

const BANK: Variant[] = MCQ_STARTER.map((s) => ({ ...s, id: s.key, status: 'approved' }));
const build = (seed = 'seed-1', seen: ReadonlySet<string> = new Set(), bank = BANK) =>
  buildAttemptQuestions(bank, SAMPLE_CONTEXT, seed, seen);

describe('the questions of one attempt (D100)', () => {
  it('asks each of the 30 concepts once, with four different options known by position', () => {
    const { questions, missing } = build();
    expect(missing).toEqual([]);
    expect(questions).toHaveLength(30);
    expect(questions.map((q) => q.conceptKey).sort()).toEqual(
      MCQ_CONCEPTS.map((c) => c.key).sort(),
    );
    for (const q of questions) {
      expect(q.localized.th.options.map((o) => o.key)).toEqual(['A', 'B', 'C', 'D']);
      expect(new Set(q.localized.th.options.map((o) => o.text)).size).toBe(4);
      expect(q.localized.th.explanation, q.conceptKey).toBeTruthy();
    }
  });

  it('marks as correct the position the variant’s own correct option was moved to', () => {
    const { questions } = build();
    for (const q of questions) {
      const variant = BANK.find((v) => v.id === q.variantId)!;
      const rendered = renderVariant(variant, SAMPLE_CONTEXT, `seed-1:${variant.id}`, 'th');
      const correct = rendered.ok
        ? rendered.rendered.options.find((o) => o.key === variant.correctKey)!.text
        : null;
      expect(q.localized.th.options.find((o) => o.key === q.correctKey)?.text).toBe(correct);
    }
    // The starters all keep their correct option first; an attempt must not.
    expect(new Set(questions.map((q) => q.correctKey)).size).toBeGreaterThan(1);
  });

  it('shows the same question, option for option, in every language', () => {
    const { questions } = build();
    const capital = questions.find((q) => q.conceptKey === 'registered_capital')!;
    const position = capital.localized.th.options.findIndex((o) => o.text === '2,000,000 บาท');
    expect(capital.localized.en?.options[position].text).toBe('2,000,000 THB');
    expect(capital.localized.zh?.options[position].text).toBe('2,000,000 泰铢');
    expect(capital.localized.th.options[position].key).toBe(capital.correctKey);
    // Drawn places are the same places in each language.
    const location = questions.find((q) => q.conceptKey === 'registered_location')!;
    for (const [i, option] of location.localized.th.options.entries()) {
      expect(location.localized.zh?.options[i].text).toContain(option.text);
    }
  });

  it('is the same for the same seed and differs for another', () => {
    expect(build('seed-1')).toEqual(build('seed-1'));
    const order = (seed: string) => build(seed).questions.map((q) => q.conceptKey);
    expect(order('seed-2')).not.toEqual(order('seed-1'));
  });

  it('prefers a variant the learner has not been asked', () => {
    const picked = (seen: ReadonlySet<string>) =>
      build('seed-1', seen).questions.find((q) => q.conceptKey === 'shareholder_count')?.variantId;
    expect(picked(new Set())).toBe('mcq-shareholder-count-1');
    expect(picked(new Set(['mcq-shareholder-count-1']))).toBe('mcq-shareholder-count-2');
    // Both asked before: back to the first.
    expect(picked(new Set(['mcq-shareholder-count-1', 'mcq-shareholder-count-2']))).toBe(
      'mcq-shareholder-count-1',
    );
  });

  it('asks nothing and names the concept when the bank cannot ask one', () => {
    const bank = BANK.filter((v) => v.conceptKey !== 'otp_control');
    const { questions, missing } = build('seed-1', new Set(), bank);
    expect(questions).toEqual([]);
    expect(missing.map((m) => m.conceptKey)).toEqual(['otp_control']);
    // A draft is not asked either.
    const drafts = BANK.map((v) =>
      v.conceptKey === 'company_name' ? { ...v, status: 'draft' as const } : v,
    );
    expect(build('seed-1', new Set(), drafts).missing.map((m) => m.conceptKey)).toEqual([
      'company_name',
    ]);
  });
});
