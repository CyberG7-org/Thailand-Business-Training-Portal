import 'server-only';
import { ClaudeDbdExtractor } from './claude';
import { FakeDbdExtractor } from './fake';
import type { DbdExtractor } from './types';

export type ExtractionProvider = 'claude' | 'fake' | 'off';

/**
 * EXTRACTION_PROVIDER=claude|fake|off. Default: claude when ANTHROPIC_API_KEY is set,
 * otherwise fake outside production and off in production.
 */
export function resolveExtractionProvider(
  env: NodeJS.ProcessEnv = process.env,
): ExtractionProvider {
  const configured = env.EXTRACTION_PROVIDER;
  if (configured === 'claude' || configured === 'fake' || configured === 'off') return configured;
  if (env.ANTHROPIC_API_KEY) return 'claude';
  return env.NODE_ENV === 'production' ? 'off' : 'fake';
}

export function getDbdExtractor(): DbdExtractor | null {
  switch (resolveExtractionProvider()) {
    case 'claude':
      return new ClaudeDbdExtractor();
    case 'fake':
      return new FakeDbdExtractor();
    case 'off':
      return null;
  }
}
