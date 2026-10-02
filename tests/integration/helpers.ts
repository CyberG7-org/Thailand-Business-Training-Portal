import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { MCQ_STARTER } from '@/lib/content/mcq-starter';
import { manualCategory } from '@/lib/domain/business-category';
import { withCheckDigit } from '@/lib/domain/validation/juristic-id';
import { listVariants, loadStarterVariants, setVariantStatus } from '@/lib/db/mcq-bank';
import { syncTrainingVersion } from '@/lib/db/training-versions';
import { validateRecord } from '@/lib/db/validation';
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
      juristic_id: withCheckDigit(String(Date.now()).padStart(12, '0').slice(-12)),
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

/** Every company-level concept resolvable (29 / 12): the record columns and the structured data. */
export const COMPLETE_RECORD = {
  company_name_th: 'บริษัท ครบถ้วน จำกัด',
  company_name_en: 'COMPLETE CO., LTD.',
  registered_on: '2026-04-16',
  issued_on: '2026-08-05',
  registered_capital: 2_000_000,
  directors: [{ name_th: 'นางสาวกุลธิดา พลเยี่ยม', name_en: null }],
  signing_authority: 'กรรมการหนึ่งคนลงลายมือชื่อและประทับตราสำคัญของบริษัท',
  head_office_address: 'เลขที่ 87 หมู่ที่ 9 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด',
} as const;

export const COMPLETE_STRUCTURED = {
  business: {
    shareholders: [
      { name: 'นางสาวกุลธิดา พลเยี่ยม', nationality: 'ไทย', shares: 18000, percent: null },
      { name: 'นายสมชาย ใจดี', nationality: 'ไทย', shares: 2000, percent: null },
    ],
    share_structure: {
      total_shares: 20000,
      par_value: 100,
      paid_up_capital: null,
      share_type: null,
    },
  },
  interview: {
    ...CONFIRMED_ANSWERS.interview,
    nature_of_business: 'ค้าส่งและค้าปลีกเสื้อผ้า',
    products_services: 'ชุดเดรส เสื้อ กระโปรงสตรี',
    business_purpose: 'จำหน่ายเสื้อผ้าสตรีในภาคอีสาน',
    main_clients: 'ร้านค้าปลีกเสื้อผ้า',
    client_origin: 'หน้าร้านและออนไลน์',
    main_suppliers: 'โรงงานตัดเย็บในกรุงเทพฯ',
    business_address: 'ร้อยเอ็ด',
    monthly_revenue: '300,000 บาท',
    revenue_basis: 'ลูกค้า 30 ราย เฉลี่ย 10,000 บาท',
    average_transaction: '10,000 บาท',
    monthly_transactions: '30',
    source_of_funds: 'เงินออมของกรรมการ',
    first_incoming_funds: 'ทุนจดทะเบียนจากผู้ถือหุ้น',
    account_purpose: 'รับชำระค่าสินค้า',
    promptpay_qr_purpose: 'ให้ลูกค้าชำระเงินสะดวก',
    customer_examples: 'ร้านบุษบา ร้อยเอ็ด',
    customer_profile: 'ร้านค้าปลีกในประเทศ',
    transaction_details: 'โอนผ่านบัญชีบริษัท',
    operations_started: 'yes',
    has_existing_customers: 'yes',
    has_completed_transactions: 'yes',
    has_regular_suppliers: 'yes',
  },
} as const;

/** Makes a confirmed record's sheet complete at company scope (spec §5.6). */
export async function completeRecord(recordId: string): Promise<void> {
  const { error } = await adminClient()
    .from('dbd_records')
    .update({ ...COMPLETE_RECORD, structured_data: COMPLETE_STRUCTURED } as never)
    .eq('id', recordId);
  if (error) throw error;
}

/**
 * Gives a confirmed record an active version from its sheet as it stands — what every confirmed
 * record held before P17c. A fixture whose sheet is deliberately thin calls this before any learner
 * visit: the learner's first pin takes this version, and the sheet's exceptions, once raised, hold
 * only the next version back (plan decision 9).
 */
export async function versionRecord(recordId: string): Promise<void> {
  const result = await syncTrainingVersion(adminClient(), recordId, null);
  if (result !== 'activated')
    throw new Error(`fixture record ${recordId} got no version: ${result}`);
}

const STARTER_KEYS = MCQ_STARTER.map((s) => s.key);

/**
 * The starter bank, approved: what a Business Knowledge Quiz needs to start (D100). Safe to call
 * twice. The returned function removes it; attempts that asked it must be gone by then.
 */
export async function seedApprovedBank(ownerId: string): Promise<() => Promise<void>> {
  const svc = adminClient();
  await loadStarterVariants(svc, MCQ_STARTER, ownerId);
  for (const variant of await listVariants(svc)) {
    if (STARTER_KEYS.includes(variant.key) && variant.status !== 'approved') {
      await setVariantStatus(svc, variant.id, 'approved');
    }
  }
  return async () => {
    await svc.from('questions').delete().in('question_key', STARTER_KEYS);
  };
}

/**
 * A team whose learner can take the quiz: the record complete, categorised, versioned, and the
 * learner assigned to it as its one director.
 */
export async function seedQuizTeam(label: string): Promise<Team> {
  const svc = adminClient();
  const team = await seedTeam(label);
  await confirmRecord(team.recordId, team.manager.id);
  await completeRecord(team.recordId);
  const { error } = await svc
    .from('dbd_records')
    .update({
      structured_data: {
        ...COMPLETE_STRUCTURED,
        category: manualCategory('clothing_fashion', 'fixture', new Date().toISOString()),
      } as never,
    })
    .eq('id', team.recordId);
  if (error) throw error;
  const validated = await validateRecord(svc, team.recordId, null);
  if (validated?.version !== 'activated') {
    throw new Error(`quiz fixture ${team.recordId} got no version: ${validated?.version}`);
  }
  const { error: assignError } = await svc.from('user_dbd_assignments').insert({
    user_id: team.learner.id,
    dbd_record_id: team.recordId,
    assigned_by: team.manager.id,
  });
  if (assignError) throw assignError;
  return team;
}
