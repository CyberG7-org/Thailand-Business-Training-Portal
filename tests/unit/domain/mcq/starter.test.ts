import { describe, expect, it } from 'vitest';
import { MCQ_STARTER } from '@/lib/content/mcq-starter';
import { TRAINING_SYLLABUS } from '@/lib/content/training-syllabus';
import { MCQ_CONCEPTS } from '@/lib/domain/concepts/registry';
import type { FactKey } from '@/lib/domain/facts/fact-sheet';
import type { RenderContext } from '@/lib/domain/mcq/context';
import { placeholdersOf } from '@/lib/domain/mcq/grammar';
import { checkBank, preflightVariant } from '@/lib/domain/mcq/preflight';
import { renderVariant } from '@/lib/domain/mcq/render';
import { SAMPLE_CONTEXT } from '@/lib/domain/mcq/sample';
import { RECIPES, TOKENS } from '@/lib/domain/mcq/tokens';
import { validateVariant } from '@/lib/domain/mcq/validate';
import { OPTION_KEYS, type AppliesWhen, type Variant } from '@/lib/domain/mcq/variant';

/** The sample company put into the status a variant is worded for. */
function contextFor(when: AppliesWhen | null): RenderContext {
  if (!when) return SAMPLE_CONTEXT;
  const facts = { ...SAMPLE_CONTEXT.facts, [when.fact]: when.value };
  if (when.fact === 'learner_is_shareholder' && !when.value) {
    facts.my_shares = null;
    facts.my_share_percent = null;
  }
  return { ...SAMPLE_CONTEXT, facts };
}

const approved = (): Variant[] =>
  MCQ_STARTER.map((s) => ({ ...s, id: s.key, status: 'approved' as const }));

describe('the starter drafts', () => {
  it('have unique keys and use every recipe of D77', () => {
    expect(new Set(MCQ_STARTER.map((s) => s.key)).size).toBe(MCQ_STARTER.length);
    const used = new Set(MCQ_STARTER.flatMap((s) => OPTION_KEYS.map((k) => s.optionRecipes[k])));
    expect([...used].sort()).toEqual([...RECIPES].sort());
  });

  it('gives every one of the 30 concepts exactly three simple variants', () => {
    expect(MCQ_CONCEPTS).toHaveLength(30);
    for (const concept of MCQ_CONCEPTS) {
      const own = MCQ_STARTER.filter((s) => s.conceptKey === concept.key);
      expect(own, concept.key).toHaveLength(3);
      const syllabus = TRAINING_SYLLABUS.find((item) => item.conceptKey === concept.key)!;
      for (const locale of ['th', 'en', 'zh'] as const) {
        expect(own.map((variant) => variant.texts[locale]?.prompt)).toEqual([
          ...syllabus.quizPrompts[locale],
        ]);
      }
    }
    expect(MCQ_STARTER).toHaveLength(90);
  });

  it('keeps every rule, in all three languages', () => {
    for (const starter of MCQ_STARTER) {
      expect(Object.keys(starter.texts).sort(), starter.key).toEqual([
        'en',
        'ms',
        'ta',
        'th',
        'zh',
      ]);
      expect(validateVariant(starter), starter.key).toEqual([]);
      expect(starter.texts.th?.explanation, starter.key).toBeTruthy();
    }
  });

  it('asks only about its own concept: a prompt names no other fact than the company name', () => {
    for (const starter of MCQ_STARTER) {
      const concept = MCQ_CONCEPTS.find((c) => c.key === starter.conceptKey)!;
      const allowed: readonly FactKey[] = [...concept.facts, 'company_name_th'];
      const prompt = starter.texts.th!.prompt;
      expect(prompt, starter.key).not.toContain('(s)');
      for (const p of placeholdersOf(prompt)) {
        expect(
          TOKENS[p.token].facts.every((f) => allowed.includes(f)),
          `${starter.key}: ${p.raw}`,
        ).toBe(true);
      }
    }
  });

  it('passes preflight for the sample company and reads the same in every language', () => {
    for (const starter of MCQ_STARTER) {
      const variant = { ...starter, id: starter.key, status: 'approved' as const };
      const ctx = contextFor(starter.appliesWhen);
      const result = preflightVariant(variant, ctx, 'seed');
      expect(result.ok, `${starter.key}: ${result.ok ? '' : result.code}`).toBe(true);
      for (const locale of ['en', 'zh'] as const) {
        const view = renderVariant(variant, ctx, 'seed', locale);
        expect(view.ok, `${starter.key} ${locale}`).toBe(true);
        expect(view.ok && new Set(view.rendered.options.map((o) => o.text)).size).toBe(4);
      }
    }
  });

  it('can ask the sample company all 30 concepts once approved', () => {
    const checks = checkBank(approved(), SAMPLE_CONTEXT, 'seed');
    expect(checks.filter((c) => c.variant === null).map((c) => c.conceptKey)).toEqual([]);
  });

  it('still asks a company with one shareholder, one sale a month and an unresolved district', () => {
    const ctx: RenderContext = {
      ...SAMPLE_CONTEXT,
      facts: {
        ...SAMPLE_CONTEXT.facts,
        shareholders: SAMPLE_CONTEXT.facts.shareholders.slice(0, 1),
        shareholder_count: 1,
        monthly_transactions: 'ประมาณ 1 รายการต่อเดือน',
      },
      geo: { ...SAMPLE_CONTEXT.geo, district: null, districts: [] },
    };
    const checks = checkBank(approved(), ctx, 'seed');
    const picked = (key: string) => checks.find((c) => c.conceptKey === key)?.variant?.key;
    expect(picked('shareholder_count')).toBe('mcq-v2-shareholder-count-1');
    expect(picked('monthly_transactions')).toBe('mcq-v2-monthly-transactions-1');
    expect(picked('actual_business_location')).toBe('mcq-v2-actual-business-location-1');
  });

  it('asks the number of shares when known and keeps percentage questions for older records', () => {
    const count = MCQ_STARTER.find((s) => s.key === 'mcq-v2-learner-shareholding-1')!;
    const countVariant = { ...count, id: count.key, status: 'approved' as const };
    const english = renderVariant(countVariant, SAMPLE_CONTEXT, 'seed', 'en');
    expect(english.ok).toBe(true);
    if (english.ok) {
      expect(english.rendered.prompt).toBe('How many shares do you have?');
      expect(english.rendered.options.find((option) => option.key === 'A')?.text).toBe(
        '12,000 shares',
      );
    }
    const ctx: RenderContext = {
      ...SAMPLE_CONTEXT,
      facts: { ...SAMPLE_CONTEXT.facts, my_shares: null, my_share_percent: 90 },
    };
    for (const starter of MCQ_STARTER.filter(
      (s) => s.conceptKey === 'learner_shareholding' && s.key !== count.key,
    )) {
      const variant = { ...starter, id: starter.key, status: 'approved' as const };
      for (const locale of ['th', 'en', 'zh'] as const) {
        const result = renderVariant(variant, ctx, 'seed', locale);
        expect(result.ok, `${starter.key} ${locale}`).toBe(true);
        if (!result.ok) continue;
        expect(result.rendered.options.find((option) => option.key === 'A')?.text).toBe('90%');
        expect(result.rendered.prompt).not.toMatch(/shares|หุ้นกี่หุ้น|多少股份/i);
      }
    }
    expect(preflightVariant(countVariant, ctx, 'seed')).toMatchObject({
      ok: false,
      code: 'missing_fact',
    });
    expect(
      checkBank(approved(), ctx, 'seed').find((c) => c.conceptKey === 'learner_shareholding')
        ?.variant?.key,
    ).not.toBe(count.key);
  });
});
