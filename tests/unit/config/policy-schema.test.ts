import { describe, expect, it } from 'vitest';
import {
  POLICY_FIELD_KEYS,
  formatPolicyValue,
  isPolicyFieldKey,
  parsePolicyInput,
} from '@/lib/config/policy-schema';
import { POLICY_DEFAULTS } from '@/lib/config/policy-defaults';

describe('policy schema', () => {
  it('covers every default key and round-trips the defaults', () => {
    expect([...POLICY_FIELD_KEYS].sort()).toEqual(Object.keys(POLICY_DEFAULTS).sort());
    for (const key of POLICY_FIELD_KEYS) {
      const raw = formatPolicyValue(key, POLICY_DEFAULTS[key]);
      expect(parsePolicyInput(key, raw)).toEqual({ ok: true, value: POLICY_DEFAULTS[key] });
    }
  });

  it('parses numbers, nullable numbers, booleans, enums and lists', () => {
    expect(parsePolicyInput('bank_eligibility_days', ' 60 ')).toEqual({ ok: true, value: 60 });
    expect(parsePolicyInput('bank_eligibility_days', '')).toMatchObject({
      ok: false,
      error: 'required',
    });
    expect(parsePolicyInput('bank_eligibility_days', '4.5')).toMatchObject({ ok: false });
    expect(parsePolicyInput('bank_eligibility_days', '999')).toMatchObject({ ok: false });
    expect(parsePolicyInput('exam_max_attempts', '')).toEqual({ ok: true, value: null });
    expect(parsePolicyInput('exam_max_attempts', 'abc')).toMatchObject({
      ok: false,
      error: 'not_a_number',
    });
    expect(parsePolicyInput('require_exam_pass_for_bank_call', 'false')).toEqual({
      ok: true,
      value: false,
    });
    expect(parsePolicyInput('exam_pass_rule', 'latest')).toEqual({ ok: true, value: 'latest' });
    expect(parsePolicyInput('exam_pass_rule', 'newest')).toMatchObject({ ok: false });
    expect(parsePolicyInput('telegram_admin_chat_ids', '123\n, 456 ,\n')).toEqual({
      ok: true,
      value: ['123', '456'],
    });
    expect(parsePolicyInput('email_admin_recipients', 'a@example.com, not-an-email')).toMatchObject(
      {
        ok: false,
      },
    );
    expect(isPolicyFieldKey('exam_pass_rule')).toBe(true);
    expect(isPolicyFieldKey('__proto__')).toBe(false);
    expect(isPolicyFieldKey('nope')).toBe(false);
  });
});
