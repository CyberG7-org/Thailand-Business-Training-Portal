import { afterEach, describe, expect, it, vi } from 'vitest';
import { getInterviewProvider, resolveInterviewProvider } from '@/lib/integrations/interview';

describe('resolveInterviewProvider', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses fake locally when no key is configured, even if Anthropic is configured elsewhere', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', 'key');
    expect(resolveInterviewProvider()).toBe('fake');
  });

  it('uses the local officer in production even when an AI Studio key is present', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GEMINI_API_KEY', 'key');
    vi.stubEnv('INTERVIEW_PROVIDER', 'gemini');
    expect(resolveInterviewProvider()).toBe('fake');
    expect(getInterviewProvider().name).toBe('fake');
  });

  it('keeps the local officer available in production without any AI key', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('INTERVIEW_PROVIDER', '');
    expect(resolveInterviewProvider()).toBe('fake');
    expect(getInterviewProvider().name).toBe('fake');
  });
});
