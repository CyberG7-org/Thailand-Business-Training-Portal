import { describe, expect, it } from 'vitest';
import { resolveInterviewProvider } from '@/lib/integrations/interview';

describe('resolveInterviewProvider', () => {
  it('uses fake locally when no key is configured, even if Anthropic is configured elsewhere', () => {
    expect(resolveInterviewProvider({ NODE_ENV: 'development', ANTHROPIC_API_KEY: 'key' })).toBe(
      'fake',
    );
  });

  it('selects Gemini when the AI Studio key is present', () => {
    expect(resolveInterviewProvider({ GEMINI_API_KEY: 'key', NODE_ENV: 'production' })).toBe(
      'gemini',
    );
  });

  it('turns off a requested Gemini interview when its key is missing', () => {
    expect(resolveInterviewProvider({ INTERVIEW_PROVIDER: 'gemini', NODE_ENV: 'production' })).toBe(
      'off',
    );
  });
});
