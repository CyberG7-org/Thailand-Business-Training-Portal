import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
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

/** A client with no session at all: what an unauthenticated caller can reach. */
export function anonClient(): Client {
  return createClient<Database>(url, anonKey, noSession);
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

/** A manager account; its profile id is its own team. */
export async function createTestManager(
  overrides: { loginId?: string; displayName?: string } = {},
): Promise<TestUser> {
  return createTestUser('manager', overrides);
}

/** A learner inside the given manager's team. */
export async function createTestLearnerIn(
  manager: TestUser,
  overrides: { loginId?: string; displayName?: string } = {},
): Promise<TestUser> {
  const learner = await createTestUser('learner', overrides);
  const { error } = await adminClient()
    .from('profiles')
    .update({ manager_id: manager.id })
    .eq('id', learner.id);
  if (error) throw error;
  return learner;
}

/**
 * A confirmed record must carry the manager's four business answers (migration 20260924000000),
 * so every fixture that confirms one merges this in.
 */
export const CONFIRMED_ANSWERS = {
  interview: {
    contact_email: 'info@test-company.co.th',
    contact_phone: '02-000-0000',
    nature_of_business: 'ทดสอบระบบ',
    products_services: 'สินค้าทดสอบ',
  },
} as const;

export type Team = {
  manager: TestUser;
  learner: TestUser;
  asManager: Client;
  recordId: string;
  documentPath: string;
};

const teamFixture = readFileSync('tests/fixtures/three-pages.pdf');

/** A manager, one learner of theirs, and one company record with a document. */
export async function seedTeam(label: string): Promise<Team> {
  const svc = adminClient();
  const manager = await createTestManager({ displayName: label });
  const learner = await createTestLearnerIn(manager, { displayName: `${label} learner` });
  const { data: record, error } = await svc
    .from('dbd_records')
    .insert({
      company_name_th: `บริษัท ${label} จำกัด`,
      team_id: manager.id,
      created_by: manager.id,
    })
    .select()
    .single();
  if (error) throw error;
  const documentPath = `${record.id}/${Date.now()}-1.pdf`;
  await svc.storage
    .from('dbd-documents')
    .upload(documentPath, teamFixture, { contentType: 'application/pdf' });
  const { error: docError } = await svc.from('dbd_documents').insert({
    record_id: record.id,
    path: documentPath,
    original_name: 'pack.pdf',
    size_bytes: teamFixture.byteLength,
    position: 1,
    page_count: 3,
    index_status: 'ready',
  });
  if (docError) throw docError;
  return {
    manager,
    learner,
    asManager: await clientFor(manager),
    recordId: record.id,
    documentPath,
  };
}

/** Confirming a record is what makes it assignable (assignment_before_insert). */
export async function confirmRecord(recordId: string, confirmedBy: string): Promise<void> {
  const { error } = await adminClient()
    .from('dbd_records')
    .update({
      extraction_status: 'confirmed',
      structured_data: CONFIRMED_ANSWERS as never,
      juristic_id: String(Date.now()).padStart(13, '0').slice(-13),
      confirmed_by: confirmedBy,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', recordId);
  if (error) throw error;
}

/** Learners hold a foreign key to their manager, so they go first. */
export async function deleteTeam(team: Team): Promise<void> {
  const svc = adminClient();
  await svc.storage.from('dbd-documents').remove([team.documentPath]);
  await svc.from('dbd_records').delete().eq('id', team.recordId);
  await deleteTestUser(team.learner.id);
  await deleteTestUser(team.manager.id);
}
