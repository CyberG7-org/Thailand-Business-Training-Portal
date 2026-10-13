import 'server-only';
import { RulesCategoryMapper } from './rules';
import type { CategoryMapper } from './types';

export type CategoryMapProvider = 'rules' | 'off';

/**
 * Category selection is local and deterministic. A legacy AI setting must not silently
 * re-enable an external API call; only "off" is still honored for diagnostics.
 */
export function resolveCategoryMapProvider(
  env: Record<string, string | undefined> = process.env,
): CategoryMapProvider {
  const configured = env.CATEGORY_MAP_PROVIDER;
  return configured === 'off' ? 'off' : 'rules';
}

export function getCategoryMapper(): CategoryMapper | null {
  switch (resolveCategoryMapProvider()) {
    case 'rules':
      return new RulesCategoryMapper();
    case 'off':
      return null;
  }
}
