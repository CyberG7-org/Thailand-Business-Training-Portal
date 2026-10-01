import { describe, expect, it } from 'vitest';
import { MCQ_STARTER } from '@/lib/content/mcq-starter';
import type { RenderContext } from '@/lib/domain/mcq/context';
import { preflightVariant } from '@/lib/domain/mcq/preflight';
import { renderVariant } from '@/lib/domain/mcq/render';
import { SAMPLE_CONTEXT } from '@/lib/domain/mcq/sample';
import { RECIPES } from '@/lib/domain/mcq/tokens';
import { validateVariant } from '@/lib/domain/mcq/validate';
import { OPTION_KEYS, type AppliesWhen } from '@/lib/domain/mcq/variant';

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

describe('the starter drafts', () => {
  it('holds eleven drafts under unique keys, with every recipe of D77 among them', () => {
    expect(MCQ_STARTER).toHaveLength(11);
    expect(new Set(MCQ_STARTER.map((s) => s.key)).size).toBe(11);
    const used = new Set(MCQ_STARTER.flatMap((s) => OPTION_KEYS.map((k) => s.optionRecipes[k])));
    expect([...used].sort()).toEqual([...RECIPES].sort());
  });

  it('keeps every rule, in all three languages', () => {
    for (const starter of MCQ_STARTER) {
      expect(Object.keys(starter.texts).sort(), starter.key).toEqual(['en', 'th', 'zh']);
      expect(validateVariant(starter), starter.key).toEqual([]);
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
});
