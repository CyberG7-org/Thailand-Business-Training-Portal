/**
 * The Bank of Thailand's 2026 public holidays as ISO dates, substitution days included. The
 * lunar dates (Makha Bucha, Visakha Bucha, Asanha Bucha) and any special holiday the cabinet
 * adds are the owner's to verify against the published list; the admin edits the key in
 * Settings and adds next year's list each December (spec §5.1).
 */
export const THAI_BANK_HOLIDAYS_2026 = [
  '2026-01-01', // New Year's Day
  '2026-03-03', // Makha Bucha Day
  '2026-04-06', // Chakri Memorial Day
  '2026-04-13', // Songkran
  '2026-04-14', // Songkran
  '2026-04-15', // Songkran
  '2026-05-01', // National Labour Day
  '2026-05-04', // Coronation Day
  '2026-06-01', // Substitution for Visakha Bucha Day (Sunday 31 May)
  '2026-06-03', // H.M. Queen Suthida's Birthday
  '2026-07-28', // H.M. King Vajiralongkorn's Birthday
  '2026-07-29', // Asanha Bucha Day
  '2026-08-12', // H.M. Queen Sirikit The Queen Mother's Birthday
  '2026-10-13', // H.M. King Bhumibol Adulyadej Memorial Day
  '2026-10-23', // Chulalongkorn Day
  '2026-12-07', // Substitution for H.M. King Bhumibol Adulyadej's Birthday (Saturday 5 December)
  '2026-12-10', // Constitution Day
  '2026-12-31', // New Year's Eve
];

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
  require_exam_pass_for_interview: true as boolean,
  telegram_admin_chat_ids: [] as string[],
  email_admin_recipients: [] as string[],
  study_completion_tracking: 'viewed' as 'viewed' | 'completed',
  // Appointments (P16b, spec §5.1): Bangkok hours, one learner per slot, the Thai bank holidays.
  appointment_hours_start: 9 as number,
  appointment_hours_end: 16 as number,
  appointment_slot_minutes: 60 as number,
  appointment_notice_hours: 24 as number,
  appointment_holidays: THAI_BANK_HOLIDAYS_2026 as string[],
  training_auto_accept_confidence_percent: 95 as number,
  training_review_confidence_percent: 75 as number,
};

export type PolicyKey = keyof typeof POLICY_DEFAULTS;
export type PolicyValue<K extends PolicyKey> = (typeof POLICY_DEFAULTS)[K];
