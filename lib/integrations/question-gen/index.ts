import 'server-only';
import { ClaudeQuestionGenerator } from './claude';
import { FakeQuestionGenerator } from './fake';
import type { QuestionGenerator } from './types';

export type QuestionGenProvider = 'claude' | 'fake' | 'off';

/**
 * QUESTION_GEN_PROVIDER=claude|fake|off. Default: claude when ANTHROPIC_API_KEY is set,
 * otherwise fake outside production and off in production (decision D33).
 */
export function resolveQuestionGenProvider(
  env: Record<string, string | undefined> = process.env,
): QuestionGenProvider {
  const configured = env.QUESTION_GEN_PROVIDER;
  if (configured === 'claude' || configured === 'fake' || configured === 'off') return configured;
  if (env.ANTHROPIC_API_KEY) return 'claude';
  return env.NODE_ENV === 'production' ? 'off' : 'fake';
}

export function getQuestionGenerator(
  env: Record<string, string | undefined> = process.env,
): QuestionGenerator | null {
  switch (resolveQuestionGenProvider(env)) {
    case 'claude':
      return new ClaudeQuestionGenerator();
    case 'fake':
      return new FakeQuestionGenerator();
    default:
      return null;
  }
}
