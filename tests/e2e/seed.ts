import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { E2E_PASSWORD } from './fixtures';

config({ path: '.env.local' });

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/** Creates a learner with a confirmed, assigned company. Returns the login id. */
export async function seedLearnerWithCompany(
  companyNameTh: string,
  issuedOn: string | null,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const admin = svc();
  const domain = process.env.APP_INTERNAL_EMAIL_DOMAIN ?? 'learner.portal.internal';
  const loginId = `e2e-seed-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const { data: user, error } = await admin.auth.admin.createUser({
    email: `${loginId}@${domain}`,
    password: E2E_PASSWORD,
    email_confirm: true,
    user_metadata: { login_id: loginId, display_name: loginId, preferred_language: 'th' },
    app_metadata: { role: 'learner' },
  });
  if (error) throw error;
  const { data: record, error: recordError } = await admin
    .from('dbd_records')
    .insert({
      company_name_th: companyNameTh,
      juristic_id: '0105568233704',
      issued_on: issuedOn,
      ...extra,
      extraction_status: 'confirmed',
      confirmed_by: user.user.id,
      confirmed_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (recordError) throw recordError;
  const { error: assignError } = await admin
    .from('user_dbd_assignments')
    .insert({ user_id: user.user.id, dbd_record_id: record.id });
  if (assignError) throw assignError;
  return loginId;
}

/** Sets a policy_config value directly (service role). */
export async function setPolicy(key: string, value: unknown): Promise<void> {
  const { error } = await svc()
    .from('policy_config')
    .upsert({ key, value: value as never });
  if (error) throw error;
}

/** Records a submitted, passing exam attempt for a seeded learner (bypasses the UI). */
export async function seedPassedExam(loginId: string): Promise<void> {
  const admin = svc();
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('login_id', loginId)
    .single();
  if (!profile) throw new Error(`no profile for ${loginId}`);
  const { data: question } = await admin.from('questions').select('id').limit(1).single();
  const { error } = await admin.from('assessment_attempts').insert({
    user_id: profile.id,
    kind: 'exam',
    language: 'th',
    attempt_no: 1,
    status: 'submitted',
    question_ids: question ? [question.id] : [],
    shuffle_seed: 'seed',
    passing_mark_snapshot: 80,
    score: 1,
    max_score: 1,
    result: 'pass',
    submitted_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Creates a learner assigned to an existing confirmed record. Returns the login id. */
export async function seedLearnerForRecord(recordId: string): Promise<string> {
  const admin = svc();
  const domain = process.env.APP_INTERNAL_EMAIL_DOMAIN ?? 'learner.portal.internal';
  const loginId = `e2e-rag-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const { data: user, error } = await admin.auth.admin.createUser({
    email: `${loginId}@${domain}`,
    password: E2E_PASSWORD,
    email_confirm: true,
    user_metadata: { login_id: loginId, display_name: loginId, preferred_language: 'th' },
    app_metadata: { role: 'learner' },
  });
  if (error) throw error;
  const { error: assignError } = await admin
    .from('user_dbd_assignments')
    .insert({ user_id: user.user.id, dbd_record_id: recordId });
  if (assignError) throw assignError;
  return loginId;
}
