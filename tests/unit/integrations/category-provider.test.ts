import { describe, expect, it } from 'vitest';
import { getCategoryMapper, resolveCategoryMapProvider } from '@/lib/integrations/category-map';
import { RulesCategoryMapper } from '@/lib/integrations/category-map/rules';

describe('category provider', () => {
  it.each([
    {},
    { CATEGORY_MAP_PROVIDER: 'off' },
    { CATEGORY_MAP_PROVIDER: 'gemini', GEMINI_API_KEY: 'unused' },
    { CATEGORY_MAP_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'unused' },
  ])('always resolves to local rules, including legacy provider settings', (env) => {
    expect(resolveCategoryMapProvider(env)).toBe('rules');
  });

  it('instantiates only the deterministic local classifier', () => {
    expect(getCategoryMapper()).toBeInstanceOf(RulesCategoryMapper);
  });
});
