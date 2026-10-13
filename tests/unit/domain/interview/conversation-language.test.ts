import { describe, expect, it } from 'vitest';
import { OFFICER_CONVERSATION_LANGUAGE } from '@/lib/domain/interview/language';

describe('officer conversation language', () => {
  it('always uses Thai for the conversation', () => {
    expect(OFFICER_CONVERSATION_LANGUAGE).toBe('th');
  });
});
