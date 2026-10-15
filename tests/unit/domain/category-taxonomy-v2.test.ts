import { describe, expect, it } from 'vitest';
import { BUSINESS_NATURES, businessNature } from '@/lib/domain/business-natures';
import { LEGACY_CATEGORY_CROSSWALK, PRIMARY_CATEGORIES } from '@/lib/domain/category-taxonomy';
import { categoryFiguresKey, decideCategory } from '@/lib/domain/business-category';

describe('primary taxonomy compatibility', () => {
  it('has exactly 25 stable unique primary keys including the no-evidence fallback', () => {
    expect(PRIMARY_CATEGORIES).toHaveLength(25);
    expect(new Set(PRIMARY_CATEGORIES.map((category) => category.key)).size).toBe(25);
    expect(PRIMARY_CATEGORIES.at(-1)?.key).toBe('general_other');
  });

  it('has an explicit, valid crosswalk for every legacy planning category', () => {
    expect(Object.keys(LEGACY_CATEGORY_CROSSWALK).sort()).toEqual(
      BUSINESS_NATURES.map(([key]) => key).sort(),
    );
    for (const item of Object.values(LEGACY_CATEGORY_CROSSWALK)) {
      expect(PRIMARY_CATEGORIES.some((category) => category.key === item.key)).toBe(true);
      expect(item.reason.length).toBeGreaterThan(0);
    }
  });

  it('keeps historical figures and resolves new keys to existing illustrative references', () => {
    expect(businessNature('furniture_home')?.slice(2, 5)).toEqual([1500000, 500, 5000]);
    expect(businessNature('furniture_furnishings')?.slice(2, 5)).toEqual([1500000, 500, 5000]);
    expect(businessNature('general_other')).toBeNull();
    expect(
      categoryFiguresKey({ key: 'food_agricultural_trading', legacy_figures_key: 'seafood' }),
    ).toBe('seafood');
    expect(categoryFiguresKey({ key: 'food_agricultural_trading' })).toBe(
      'food_agricultural_trading',
    );
  });

  it('persists a fallback as a selected category with trace, not an unmapped state', () => {
    expect(
      decideCategory({
        result: {
          key: 'general_other',
          confidence: 0,
          method: 'fallback',
          score: 0,
          evidenceLevel: 'none',
          matchedEvidence: [],
          taxonomyVersion: 'primary-25-v1',
          rulesVersion: 'rules-v2',
          fallbackReason: 'no_distinctive_evidence',
          explanation: 'No match',
        },
        activeKeys: new Set(PRIMARY_CATEGORIES.map((category) => category.key)),
        model: 'rules-v2',
        inputHash: 'empty',
        at: '2026-10-15T00:00:00Z',
      }),
    ).toMatchObject({
      status: 'mapped',
      key: 'general_other',
      method: 'fallback',
      evidence_level: 'none',
      taxonomy_version: 'primary-25-v1',
    });
  });
});
