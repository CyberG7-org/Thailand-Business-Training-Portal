import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { POLICY_DEFAULTS } from '@/lib/config/policy-defaults';
import {
  POLICY_FIELD_KEYS,
  parsePolicyInput,
  type PolicyFieldKey,
} from '@/lib/config/policy-schema';
import type { Database, Json } from './database.types';

type Db = SupabaseClient<Database>;

export type PolicyRow = { key: PolicyFieldKey; value: unknown; updated_at: string | null };

/** Every known key with its stored value (or the code default when the row is missing). */
export async function listPolicies(db: Db): Promise<PolicyRow[]> {
  const { data, error } = await db.from('policy_config').select('key, value, updated_at');
  if (error) throw error;
  const byKey = new Map((data ?? []).map((r) => [r.key, r]));
  return POLICY_FIELD_KEYS.map((key) => {
    const row = byKey.get(key);
    return {
      key,
      value: row ? row.value : POLICY_DEFAULTS[key],
      updated_at: row?.updated_at ?? null,
    };
  });
}

/**
 * Validates and stores one key through the admin's own session so RLS and the audit trigger
 * see the real actor (decision D30).
 */
export async function updatePolicy(
  db: Db,
  key: PolicyFieldKey,
  raw: string,
  actorId: string,
): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  const parsed = parsePolicyInput(key, raw);
  if (!parsed.ok) return parsed;
  const { error } = await db.from('policy_config').upsert({
    key,
    value: parsed.value as Json,
    updated_at: new Date().toISOString(),
    updated_by: actorId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: parsed.value };
}

export type AuditRow = Database['public']['Views']['audit_logs_with_actor']['Row'];

export async function listAuditLogs(
  db: Db,
  filter: { entityType?: string; entityId?: string; actorLoginId?: string; limit?: number } = {},
): Promise<AuditRow[]> {
  let query = db
    .from('audit_logs_with_actor')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filter.limit ?? 100);
  if (filter.entityType) query = query.eq('entity_type', filter.entityType);
  if (filter.entityId) query = query.eq('entity_id', filter.entityId);
  // Codes are stored lower-case and shown upper-case (spec §3.3); accept them as typed.
  if (filter.actorLoginId) {
    query = query.eq('actor_login_id', filter.actorLoginId.trim().toLowerCase());
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** Bookkeeping columns the row timestamp already conveys. */
const NOISE_KEYS = new Set(['updated_at', 'created_at']);

/** Keys whose value differs between before and after (both sides shown). */
export function auditDiff(
  before: unknown,
  after: unknown,
): { key: string; before: unknown; after: unknown }[] {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  return [...keys]
    .filter((k) => !NOISE_KEYS.has(k) && JSON.stringify(b[k]) !== JSON.stringify(a[k]))
    .sort()
    .map((k) => ({ key: k, before: b[k], after: a[k] }));
}
