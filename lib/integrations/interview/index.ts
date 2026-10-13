import 'server-only';
import { FakeInterview } from './fake';
import type { InterviewProvider, InterviewProviderName } from './types';

export type { InterviewProvider, InterviewProviderName, NarrateInput, TurnInput } from './types';

/**
 * The readiness interview is local and deterministic in every environment.
 * API credentials for other features never enable remote interview calls.
 */
export function resolveInterviewProvider(): InterviewProviderName {
  return 'fake';
}

export function getInterviewProvider(): InterviewProvider {
  return new FakeInterview();
}
