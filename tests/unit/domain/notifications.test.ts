import { describe, expect, it } from 'vitest';
import { backoffMinutes, canStartExam, examResultMessage } from '@/lib/domain/notifications';
import { resolveNotifyProvider } from '@/lib/integrations/notify/index';

describe('backoffMinutes', () => {
  it('doubles per attempt and caps at 16 minutes', () => {
    expect([1, 2, 3, 4, 5, 6].map(backoffMinutes)).toEqual([1, 2, 4, 8, 16, 16]);
  });
});

describe('examResultMessage', () => {
  it('renders a bilingual message with percentage and pass/fail', () => {
    const m = examResultMessage({
      login_id: 'siam001',
      display_name: 'Somchai',
      company_name_th: 'บริษัท ทดสอบ จำกัด',
      attempt_no: 2,
      score: 15,
      max_score: 20,
      result: 'pass',
      passing_mark_percent: 70,
      submitted_on: '2026-09-11',
    });
    expect(m.subject).toBe('[Exam PASS] Somchai (siam001) — 15/20 (75%)');
    expect(m.text).toContain('ผลสอบ: ผ่าน');
    expect(m.text).toContain('11 กันยายน 2569');
    expect(m.text).toContain('passing mark 70%');
  });
});

describe('canStartExam', () => {
  const now = new Date('2026-09-11T10:00:00Z');
  it('allows unlimited attempts by default', () => {
    expect(
      canStartExam({
        submittedCount: 9,
        lastSubmittedAt: null,
        maxAttempts: null,
        retryWaitHours: 0,
        now,
      }),
    ).toEqual({ ok: true });
  });
  it('enforces the attempt cap', () => {
    expect(
      canStartExam({
        submittedCount: 2,
        lastSubmittedAt: null,
        maxAttempts: 2,
        retryWaitHours: 0,
        now,
      }),
    ).toEqual({ ok: false, reason: 'max_attempts' });
  });
  it('enforces the waiting period after the last submission', () => {
    const r = canStartExam({
      submittedCount: 1,
      lastSubmittedAt: '2026-09-11T09:00:00Z',
      maxAttempts: null,
      retryWaitHours: 24,
      now,
    });
    expect(r).toMatchObject({
      ok: false,
      reason: 'retry_wait',
      retryAt: '2026-09-12T09:00:00.000Z',
    });
    expect(
      canStartExam({
        submittedCount: 1,
        lastSubmittedAt: '2026-09-10T09:00:00Z',
        maxAttempts: null,
        retryWaitHours: 24,
        now,
      }),
    ).toEqual({ ok: true });
  });
});

describe('resolveNotifyProvider', () => {
  it('goes live with any channel key, fake in dev, off in production', () => {
    expect(resolveNotifyProvider({ TELEGRAM_BOT_TOKEN: 't' })).toBe('live');
    expect(resolveNotifyProvider({ RESEND_API_KEY: 'r', NODE_ENV: 'production' })).toBe('live');
    expect(resolveNotifyProvider({ NODE_ENV: 'development' })).toBe('fake');
    expect(resolveNotifyProvider({ NODE_ENV: 'production' })).toBe('off');
    expect(resolveNotifyProvider({ NOTIFY_PROVIDER: 'off', TELEGRAM_BOT_TOKEN: 't' })).toBe('off');
  });
});
