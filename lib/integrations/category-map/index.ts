import 'server-only';
import { ClaudeCategoryMapper } from './claude';
import { FakeCategoryMapper } from './fake';
import type { CategoryMapper } from './types';

export type CategoryMapProvider = 'claude' | 'fake' | 'off';

/**
 * CATEGORY_MAP_PROVIDER=claude|fake|off. Default: claude when ANTHROPIC_API_KEY is set,
 * otherwise fake outside production and off in production.
 */
export function resolveCategoryMapProvider(
  env: Record<string, string | undefined> = process.env,
): CategoryMapProvider {
  const configured = env.CATEGORY_MAP_PROVIDER;
  if (configured === 'claude' || configured === 'fake' || configured === 'off') return configured;
  if (env.ANTHROPIC_API_KEY) return 'claude';
  return env.NODE_ENV === 'production' ? 'off' : 'fake';
}

export function getCategoryMapper(): CategoryMapper | null {
  switch (resolveCategoryMapProvider()) {
    case 'claude':
      return new ClaudeCategoryMapper();
    case 'fake':
      return new FakeCategoryMapper();
    case 'off':
      return null;
  }
}
