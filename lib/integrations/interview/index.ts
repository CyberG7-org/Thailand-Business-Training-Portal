import 'server-only';
import { ClaudeInterview } from './claude';
import { FakeInterview } from './fake';
import type { InterviewProvider, InterviewProviderName } from './types';

export type { InterviewProvider, InterviewProviderName, NarrateInput, TurnInput } from './types';

/**
 * INTERVIEW_PROVIDER=claude|fake|off. Default: claude when ANTHROPIC_API_KEY is set, otherwise
 * fake outside production and off in production (the extraction rule).
 */
export function resolveInterviewProvider(
  env: Record<string, string | undefined> = process.env,
): InterviewProviderName {
  const configured = env.INTERVIEW_PROVIDER;
  if (configured === 'claude' || configured === 'fake' || configured === 'off') return configured;
  if (env.ANTHROPIC_API_KEY) return 'claude';
  return env.NODE_ENV === 'production' ? 'off' : 'fake';
}

export function getInterviewProvider(
  env: Record<string, string | undefined> = process.env,
): InterviewProvider | null {
  switch (resolveInterviewProvider(env)) {
    case 'claude':
      return new ClaudeInterview();
    case 'fake':
      return new FakeInterview();
    default:
      return null;
  }
}
