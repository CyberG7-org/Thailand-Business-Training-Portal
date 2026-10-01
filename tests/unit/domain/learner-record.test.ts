import { describe, expect, it } from 'vitest';
import {
  chatbotResult,
  chatbotSessionResult,
  dateTimeLabel,
  mcqResult,
} from '@/lib/domain/learner-record';

const at = (day: number) => `2026-10-${String(day).padStart(2, '0')}T03:00:00.000Z`;

/** D82: the Learner Record's MCQ column follows the exam rule in Policy settings. */
describe('mcqResult', () => {
  const failedThenPassed = [
    { result: 'fail', submitted_at: at(1) },
    { result: 'pass', submitted_at: at(2) },
  ];
  const passedThenFailed = [
    { result: 'pass', submitted_at: at(1) },
    { result: 'fail', submitted_at: at(2) },
  ];

  it('is nothing until an attempt is submitted', () => {
    expect(mcqResult([], 'any')).toBeNull();
    expect(mcqResult([{ result: null, submitted_at: null }], 'any')).toBeNull();
  });

  it('under "any", one pass is enough, whatever came after', () => {
    expect(mcqResult(failedThenPassed, 'any')).toBe('pass');
    expect(mcqResult(passedThenFailed, 'any')).toBe('pass');
    expect(mcqResult([{ result: 'fail', submitted_at: at(1) }], 'any')).toBe('fail');
  });

  it('under "latest", the most recent submitted attempt decides, in any order given', () => {
    expect(mcqResult(failedThenPassed, 'latest')).toBe('pass');
    expect(mcqResult(passedThenFailed, 'latest')).toBe('fail');
    expect(mcqResult([...passedThenFailed].reverse(), 'latest')).toBe('fail');
  });
});

/** D82: the Chatbot column is the readiness interview; ready never goes back (D64). */
describe('chatbotResult', () => {
  const ready = { status: 'completed', verdict: 'ready' };
  const notReady = { status: 'completed', verdict: 'not_ready' };
  const open = { status: 'in_progress', verdict: null };
  const abandoned = { status: 'abandoned', verdict: null };

  it('names each session', () => {
    expect(chatbotSessionResult(ready)).toBe('pass');
    expect(chatbotSessionResult(notReady)).toBe('fail');
    expect(chatbotSessionResult(open)).toBe('in_progress');
    expect(chatbotSessionResult(abandoned)).toBe('abandoned');
  });

  it('passes once any session ended ready, even with failures after it', () => {
    expect(chatbotResult([notReady, ready, notReady])).toBe('pass');
  });

  it('fails when sessions ended and none was ready', () => {
    expect(chatbotResult([notReady, abandoned, open])).toBe('fail');
  });

  it('is in progress while one is open and none has ended, nothing otherwise', () => {
    expect(chatbotResult([abandoned, open])).toBe('in_progress');
    expect(chatbotResult([abandoned])).toBeNull();
    expect(chatbotResult([])).toBeNull();
  });
});

describe('dateTimeLabel', () => {
  it('shows the Bangkok date as printed and the time', () => {
    // 2026-10-12 03:00 UTC is 10:00 in Bangkok.
    expect(dateTimeLabel('2026-10-12T03:00:00.000Z', 'th')).toBe('12 ตุลาคม 2569 10:00');
    expect(dateTimeLabel('2026-10-12T03:00:00.000Z', 'en')).toMatch(/^12 October 2026 10:00$/);
  });
});
