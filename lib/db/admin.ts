import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { publicEnv, serverEnv } from './env';

/**
 * Service-role client. Bypasses RLS. Allowed only for: account provisioning,
 * policy_config reads, signed URLs, cron and webhook handlers (spec §3.3).
 */
export function createSupabaseAdminClient() {
  return createClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;
