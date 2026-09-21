import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/lib/db/database.types';
import { clientFor, createTestUser, deleteTestUser, type Client, type TestUser } from './helpers';

/** Privileged security-definer functions must not be reachable through /rest/v1/rpc (migration 0012). */
describe('function grants', () => {
  let learner: TestUser;
  let asLearner: Client;
  const anon = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  beforeAll(async () => {
    learner = await createTestUser('learner');
    asLearner = await clientFor(learner);
  });

  afterAll(async () => {
    await deleteTestUser(learner.id);
  });

  it('refuses privileged RPCs for signed-in learners and anonymous callers', async () => {
    const privileged = [
      asLearner.rpc('compute_eligibility_snapshot', {
        p_user_id: learner.id,
        p_record_id: '00000000-0000-0000-0000-000000000000',
        p_reason: 'assignment',
      }),
      asLearner.rpc('recompute_eligibility_snapshots', { p_reason: 'policy_changed' }),
      asLearner.rpc('finalize_attempt', {
        p_attempt_id: '00000000-0000-0000-0000-000000000000',
        p_score: 0,
        p_max_score: 0,
        p_result: 'fail',
      }),
      asLearner.rpc('claim_notifications', { p_limit: 1 }),
      asLearner.rpc('claim_index_jobs', { p_limit: 1 }),
      anon.rpc('claim_index_jobs', { p_limit: 1 }),
      asLearner.rpc('policy_int', { p_key: 'bank_eligibility_days' }),
      anon.rpc('is_admin'),
      anon.rpc('set_my_preferred_language', { p_lang: 'en' }),
    ];
    for (const call of await Promise.all(privileged)) {
      expect(call.error?.code).toBe('42501'); // insufficient_privilege
    }
  });

  it('keeps the two learner-facing functions callable by signed-in users', async () => {
    expect((await asLearner.rpc('is_admin')).data).toBe(false);
    expect((await asLearner.rpc('set_my_preferred_language', { p_lang: 'en' })).error).toBeNull();
  });
});
