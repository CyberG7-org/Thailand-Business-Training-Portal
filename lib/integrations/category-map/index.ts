import 'server-only';
import { RulesCategoryMapper } from './rules';
import type { CategoryMapper } from './types';

export type CategoryMapProvider = 'rules';

/**
 * Category selection is mandatory, local and deterministic. Legacy provider settings,
 * including "off", must not leave a successfully read record without a category.
 */
export function resolveCategoryMapProvider(
  env: Record<string, string | undefined> = process.env,
): CategoryMapProvider {
  void env;
  return 'rules';
}

export function getCategoryMapper(): CategoryMapper {
  return new RulesCategoryMapper();
}
