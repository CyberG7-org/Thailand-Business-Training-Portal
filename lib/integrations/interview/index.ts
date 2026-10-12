import 'server-only';
import { ClaudeInterview } from './claude';
import { FakeInterview } from './fake';
import { GeminiInterview } from './gemini';
import type { InterviewProvider, InterviewProviderName } from './types';

export type { InterviewProvider, InterviewProviderName, NarrateInput, TurnInput } from './types';

/**
 * INTERVIEW_PROVIDER=gemini|claude|fake|off. Gemini is the default when its key is set.
 * Without a Gemini key, development uses fake and production disables the interview.
 */
export function resolveInterviewProvider(
  env: Record<string, string | undefined> = process.env,
): InterviewProviderName {
  const configured = env.INTERVIEW_PROVIDER;
  if (configured === 'gemini') return env.GEMINI_API_KEY ? 'gemini' : 'off';
  if (configured === 'claude' || configured === 'fake' || configured === 'off') return configured;
  if (env.GEMINI_API_KEY) return 'gemini';
  return env.NODE_ENV === 'production' ? 'off' : 'fake';
}

export function getInterviewProvider(
  env: Record<string, string | undefined> = process.env,
): InterviewProvider | null {
  switch (resolveInterviewProvider(env)) {
    case 'gemini':
      return new GeminiInterview(env.GEMINI_API_KEY);
    case 'claude':
      return new ClaudeInterview();
    case 'fake':
      return new FakeInterview();
    default:
      return null;
  }
}
