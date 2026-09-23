import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/database.types';

export type Role = 'learner' | 'manager' | 'admin';
export type TestUser = { id: string; loginId: string; password: string; role: Role };
export type Client = SupabaseClient<Database>;

export const INTERNAL_DOMAIN = process.env.APP_INTERNAL_EMAIL_DOMAIN ?? 'learner.portal.internal';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

export function adminClient(): Client {
  return createClient<Database>(url, serviceKey, noSession);
}

export async function createTestUser(
  role: Role,
  overrides: {
    loginId?: string;
    displayName?: string;
    preferredLanguage?: 'th' | 'en' | 'zh';
  } = {},
): Promise<TestUser> {
  const loginId = overrides.loginId ?? `${role}-${randomUUID().slice(0, 8)}`;
  const password = 'Test-Password-123!';
  const { data, error } = await adminClient().auth.admin.createUser({
    email: `${loginId}@${INTERNAL_DOMAIN}`,
    password,
    email_confirm: true,
    user_metadata: {
      login_id: loginId,
      display_name: overrides.displayName ?? loginId,
      preferred_language: overrides.preferredLanguage ?? 'th',
    },
    app_metadata: { role },
  });
  if (error || !data.user) throw error ?? new Error('createUser returned no user');
  return { id: data.user.id, loginId, password, role };
}

/** A client signed in as the given user; every query runs under RLS. */
export async function clientFor(user: TestUser): Promise<Client> {
  const client = createClient<Database>(url, anonKey, noSession);
  const { error } = await client.auth.signInWithPassword({
    email: `${user.loginId}@${INTERNAL_DOMAIN}`,
    password: user.password,
  });
  if (error) throw error;
  return client;
}

export async function deleteTestUser(id: string): Promise<void> {
  await adminClient().auth.admin.deleteUser(id);
}
