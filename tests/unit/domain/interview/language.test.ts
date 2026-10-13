import { describe, expect, it } from 'vitest';
import { interviewReplyLanguage } from '@/lib/domain/interview/language';
import { questionFor } from '@/lib/domain/interview/plan';

describe('interview language', () => {
  it('uses the latest written language and retains it for numeric-only answers', () => {
    expect(interviewReplyLanguage('My company sells food', [], 'th')).toBe('en');
    expect(interviewReplyLanguage('公司销售食品', [], 'en')).toBe('zh');
    expect(interviewReplyLanguage('บริษัทขายอาหาร', [], 'en')).toBe('th');
    expect(interviewReplyLanguage('Syarikat kami menjual makanan', [], 'en')).toBe('ms');
    expect(interviewReplyLanguage('Syarikat kami menjual makanan', [], 'ms')).toBe('ms');
    expect(interviewReplyLanguage('Our company sells food', [], 'ms')).toBe('en');
    expect(
      interviewReplyLanguage(
        '300,000',
        [{ role: 'learner', content: 'My company sells food' }],
        'th',
      ),
    ).toBe('en');
  });

  it('uses the same approved readiness concept in each language', () => {
    expect(questionFor('monthly_revenue', 'en', '')).toContain('monthly revenue');
    expect(questionFor('monthly_revenue', 'zh', '')).toContain('每月');
    expect(questionFor('monthly_revenue', 'ms', '')).toContain('hasil bulanan');
  });
});
