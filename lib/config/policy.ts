import 'server-only';
import { createSupabaseAdminClient } from '@/lib/db/admin';
import { POLICY_DEFAULTS, type PolicyKey, type PolicyValue } from './policy-defaults';

export { POLICY_DEFAULTS, type PolicyKey, type PolicyValue };

export async function getPolicy<K extends PolicyKey>(key: K): Promise<PolicyValue<K>> {
  const { data, error } = await createSupabaseAdminClient()
    .from('policy_config')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  if (!data) return POLICY_DEFAULTS[key];
  return data.value as PolicyValue<K>;
}
