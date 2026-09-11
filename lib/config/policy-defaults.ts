/** Keys and pilot defaults from spec §4.6. Defaults apply only if a row is missing. */
export const POLICY_DEFAULTS = {
  bank_eligibility_days: 45 as number,
  bank_access_expiry_days: null as number | null,
  exam_passing_mark_percent: 70 as number,
  quiz_question_count: 10 as number,
  exam_question_count: 20 as number,
  exam_max_attempts: null as number | null,
  exam_retry_wait_hours: 0 as number,
  exam_pass_rule: 'any' as 'any' | 'latest',
  require_exam_pass_for_name_card: false as boolean,
  require_exam_pass_for_bank_call: true as boolean,
  call_max_sessions: null as number | null,
  telegram_admin_chat_ids: [] as string[],
  email_admin_recipients: [] as string[],
  study_completion_tracking: 'viewed' as 'viewed' | 'completed',
};

export type PolicyKey = keyof typeof POLICY_DEFAULTS;
export type PolicyValue<K extends PolicyKey> = (typeof POLICY_DEFAULTS)[K];
