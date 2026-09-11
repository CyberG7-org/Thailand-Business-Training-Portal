import { z } from 'zod';

/**
 * Validation and form metadata for every policy_config key (decision D32).
 * `parseInput` turns the raw form string into the stored JSON value.
 */
export type PolicyControl =
  | { kind: 'number'; min: number; max: number; nullable: boolean }
  | { kind: 'boolean' }
  | { kind: 'enum'; options: readonly string[] }
  | { kind: 'list' };

export type PolicyFieldDef = {
  control: PolicyControl;
  schema: z.ZodTypeAny;
  /** Keys that move the bank window and trigger an eligibility recompute. */
  recomputesEligibility?: boolean;
};

const intRange = (min: number, max: number) => z.number().int().min(min).max(max);
const nullableInt = (min: number, max: number) => intRange(min, max).nullable();
const stringList = z.array(z.string().trim().min(1)).max(50);

export const POLICY_FIELDS = {
  bank_eligibility_days: {
    control: { kind: 'number', min: 0, max: 365, nullable: false },
    schema: intRange(0, 365),
    recomputesEligibility: true,
  },
  bank_access_expiry_days: {
    control: { kind: 'number', min: 1, max: 3650, nullable: true },
    schema: nullableInt(1, 3650),
    recomputesEligibility: true,
  },
  exam_passing_mark_percent: {
    control: { kind: 'number', min: 0, max: 100, nullable: false },
    schema: intRange(0, 100),
  },
  quiz_question_count: {
    control: { kind: 'number', min: 1, max: 100, nullable: false },
    schema: intRange(1, 100),
  },
  exam_question_count: {
    control: { kind: 'number', min: 1, max: 100, nullable: false },
    schema: intRange(1, 100),
  },
  exam_max_attempts: {
    control: { kind: 'number', min: 1, max: 100, nullable: true },
    schema: nullableInt(1, 100),
  },
  exam_retry_wait_hours: {
    control: { kind: 'number', min: 0, max: 720, nullable: false },
    schema: intRange(0, 720),
  },
  exam_pass_rule: {
    control: { kind: 'enum', options: ['any', 'latest'] },
    schema: z.enum(['any', 'latest']),
  },
  require_exam_pass_for_name_card: { control: { kind: 'boolean' }, schema: z.boolean() },
  require_exam_pass_for_bank_call: { control: { kind: 'boolean' }, schema: z.boolean() },
  call_max_sessions: {
    control: { kind: 'number', min: 1, max: 100, nullable: true },
    schema: nullableInt(1, 100),
  },
  telegram_admin_chat_ids: { control: { kind: 'list' }, schema: stringList },
  email_admin_recipients: {
    control: { kind: 'list' },
    schema: z.array(z.string().trim().email()).max(50),
  },
  study_completion_tracking: {
    control: { kind: 'enum', options: ['viewed', 'completed'] },
    schema: z.enum(['viewed', 'completed']),
  },
} satisfies Record<string, PolicyFieldDef>;

export type PolicyFieldKey = keyof typeof POLICY_FIELDS;
export const POLICY_FIELD_KEYS = Object.keys(POLICY_FIELDS) as PolicyFieldKey[];

export function isPolicyFieldKey(key: string): key is PolicyFieldKey {
  return Object.prototype.hasOwnProperty.call(POLICY_FIELDS, key);
}

export type ParsedPolicy = { ok: true; value: unknown } | { ok: false; error: string };

/** Converts the raw form string for `key` into a validated JSON value. */
export function parsePolicyInput(key: PolicyFieldKey, raw: string): ParsedPolicy {
  const def: PolicyFieldDef = POLICY_FIELDS[key];
  const text = raw.trim();
  let candidate: unknown;
  switch (def.control.kind) {
    case 'number':
      if (text === '') {
        if (!def.control.nullable) return { ok: false, error: 'required' };
        candidate = null;
      } else {
        candidate = Number(text);
        if (!Number.isFinite(candidate)) return { ok: false, error: 'not_a_number' };
      }
      break;
    case 'boolean':
      candidate = text === 'true';
      break;
    case 'enum':
      candidate = text;
      break;
    case 'list':
      candidate = text
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      break;
  }
  const result = def.schema.safeParse(candidate);
  if (!result.success) return { ok: false, error: result.error.issues[0]?.message ?? 'invalid' };
  return { ok: true, value: result.data };
}

/** Renders a stored JSON value as the form's raw string. */
export function formatPolicyValue(key: PolicyFieldKey, value: unknown): string {
  const def: PolicyFieldDef = POLICY_FIELDS[key];
  if (def.control.kind === 'list') return Array.isArray(value) ? value.join('\n') : '';
  if (value === null || value === undefined) return '';
  return String(value);
}
