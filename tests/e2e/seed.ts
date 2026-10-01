import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { BANK_INTERVIEW_CARDS } from '@/lib/content/bank-interview-cards';
import { loadStarterCards } from '@/lib/db/study';
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
      // A confirmed record owes the four business answers, so they are merged into whatever
      // structured data the caller supplied rather than replacing it.
      structured_data: {
        ...((extra.structured_data as Record<string, unknown> | undefined) ?? {}),
        interview: {
          contact_email: 'info@test-company.co.th',
          contact_phone: '02-000-0000',
          nature_of_business: 'ทดสอบระบบ',
          products_services: 'สินค้าทดสอบ',
          ...(((extra.structured_data as Record<string, unknown> | undefined)?.interview as
            Record<string, unknown> | undefined) ?? {}),
        },
      },
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
export async function seedPassedExam(
  loginId: string,
  result: 'pass' | 'fail' = 'pass',
): Promise<void> {
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
    score: result === 'pass' ? 1 : 0,
    max_score: 1,
    result,
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

/**
 * Disables the profile row only, leaving the auth user unbanned and its token valid. Suspending
 * through the UI also bans the auth user, which the request-boundary guard catches on its own —
 * this is how a test can prove the page guard reads the profile rather than the token.
 */
export async function disableProfileOnly(loginId: string): Promise<void> {
  const { error } = await svc()
    .from('profiles')
    .update({ status: 'disabled' })
    .eq('login_id', loginId);
  if (error) throw error;
}

/** A Thai study card with a table and tips, for the screens that lay tables out. Returns its key. */
export async function seedStudyCard(): Promise<string> {
  const admin = svc();
  const key = 'e2e-table-' + Date.now();
  const { data: creator } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .single();
  const { data: material, error } = await admin
    .from('study_materials')
    .insert({
      content_key: key,
      type: 'card',
      sort_order: 99,
      active: true,
      created_by: creator?.id ?? null,
    })
    .select('id')
    .single();
  if (error || !material) throw error ?? new Error('study card not created');
  const { error: locError } = await admin.from('study_material_localizations').insert({
    material_id: material.id,
    language: 'th',
    title: 'บทเรียนตาราง ' + key,
    body:
      '# หัวข้อ\n\nตอบตาม **หนังสือรับรอง** เสมอ\n\n' +
      '| ธนาคารถาม | คำตอบของคุณ |\n|---|---|\n' +
      '| ชื่อบริษัท | บริษัท ทดสอบ จำกัด |\n| เลขทะเบียนนิติบุคคล | 0105568233704 |\n\n' +
      '### เคล็ดลับ\n\n- บอกชื่อเต็มตามที่จดทะเบียน\n- วันที่ใช้ตามหนังสือรับรอง',
    tts_enabled: false,
  });
  if (locError) throw locError;
  return key;
}

/** A manager account with the e2e password; their profile id is their team. */
export async function seedManager(displayName: string): Promise<{ id: string; loginId: string }> {
  const admin = svc();
  const domain = process.env.APP_INTERNAL_EMAIL_DOMAIN ?? 'learner.portal.internal';
  const loginId = `e2e-mgr-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const { data, error } = await admin.auth.admin.createUser({
    email: `${loginId}@${domain}`,
    password: E2E_PASSWORD,
    email_confirm: true,
    user_metadata: { login_id: loginId, display_name: displayName, preferred_language: 'th' },
    app_metadata: { role: 'manager' },
  });
  if (error) throw error;
  return { id: data.user.id, loginId };
}

/** A completed interview that ended ready, written the way the service role writes it. */
export async function seedReadyInterview(loginId: string): Promise<void> {
  const admin = svc();
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('login_id', loginId)
    .single();
  const { data: assignment } = await admin
    .from('user_dbd_assignments')
    .select('dbd_record_id')
    .eq('user_id', profile!.id)
    .eq('active', true)
    .single();
  const { error } = await admin.from('interview_sessions').insert({
    user_id: profile!.id,
    dbd_record_id: assignment!.dbd_record_id,
    status: 'completed',
    verdict: 'ready',
    plan: { items: [], cursor: 0 },
    provider: 'fake',
  });
  if (error) throw error;
}

/**
 * A learner in a manager's team with a confirmed company of that team, the exam passed and the
 * interview ready: everything before the appointment. Returns the login id.
 */
export async function seedTeamLearner(
  managerId: string,
  companyNameTh: string,
  issuedOn: string,
): Promise<string> {
  const loginId = await seedLearnerWithCompany(companyNameTh, issuedOn, { team_id: managerId });
  const { error } = await svc()
    .from('profiles')
    .update({ manager_id: managerId })
    .eq('login_id', loginId);
  if (error) throw error;
  await seedPassedExam(loginId);
  await seedReadyInterview(loginId);
  return loginId;
}

/**
 * The audit rows for one entity, newest first, with the actor's login id. There is no audit
 * screen (D81); every change is still recorded, and this is how the suite reads the record.
 */
export async function auditRowsFor(filter: {
  entityType?: string;
  entityId?: string;
  action?: string;
  actorLoginId?: string;
}): Promise<{ action: string; actor_login_id: string | null; after: unknown }[]> {
  let query = svc()
    .from('audit_logs_with_actor')
    .select('action, actor_login_id, after, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (filter.entityType) query = query.eq('entity_type', filter.entityType);
  if (filter.entityId) query = query.eq('entity_id', filter.entityId);
  if (filter.action) query = query.eq('action', filter.action);
  if (filter.actorLoginId) query = query.eq('actor_login_id', filter.actorLoginId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as { action: string; actor_login_id: string | null; after: unknown }[];
}

async function ownerId(): Promise<string> {
  const { data, error } = await svc()
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .order('created_at')
    .limit(1)
    .single();
  if (error) throw error;
  return data.id;
}

/** The five bank-interview starter cards, as `pnpm content:starter` loads them (D81). */
export async function ensureStarterCards(): Promise<void> {
  await loadStarterCards(svc() as never, BANK_INTERVIEW_CARDS, await ownerId());
}

/** One study card with its localizations; staff no longer write cards in the UI (D81). */
export async function seedLocalizedStudyCard(
  contentKey: string,
  localizations: Record<'th' | 'en' | 'zh', { title: string; body: string; ttsEnabled?: boolean }>,
): Promise<string> {
  const admin = svc();
  const { data: material, error } = await admin
    .from('study_materials')
    .insert({
      content_key: contentKey,
      type: 'card',
      sort_order: 999,
      active: true,
      created_by: await ownerId(),
    })
    .select('id')
    .single();
  if (error) throw error;
  for (const [language, loc] of Object.entries(localizations)) {
    const { error: locError } = await admin.from('study_material_localizations').insert({
      material_id: material.id,
      language,
      title: loc.title,
      body: loc.body,
      tts_enabled: loc.ttsEnabled ?? false,
    });
    if (locError) throw locError;
  }
  return material.id;
}

/** A learner on a confirmed, complete company (every company-level concept resolvable). */
export async function seedLearnerWithCompleteCompany(companyNameTh: string): Promise<string> {
  // Issued after registration (dbd_issue_not_before_registration).
  return seedLearnerWithCompany(companyNameTh, '2026-08-05', {
    company_name_en: 'COMPLETE CO., LTD.',
    registered_on: '2026-04-16',
    registered_capital: 2_000_000,
    directors: [{ name_th: 'นางสาวกุลธิดา พลเยี่ยม', name_en: null }],
    signing_authority: 'กรรมการหนึ่งคนลงลายมือชื่อและประทับตราสำคัญของบริษัท',
    head_office_address: 'เลขที่ 87 หมู่ที่ 9 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด',
    structured_data: {
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
    },
  });
}

/** An unfinished quiz for the learner, which blocks a version move; returns its id. */
export async function seedInProgressAttempt(loginId: string): Promise<string> {
  const admin = svc();
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('login_id', loginId)
    .single();
  const { data: assignment } = await admin
    .from('user_dbd_assignments')
    .select('dbd_record_id')
    .eq('user_id', profile!.id)
    .eq('active', true)
    .single();
  const { data, error } = await admin
    .from('assessment_attempts')
    .insert({
      user_id: profile!.id,
      dbd_record_id: assignment!.dbd_record_id,
      kind: 'quiz',
      language: 'th',
      attempt_no: 1,
      question_ids: [],
      shuffle_seed: 'e2e',
      status: 'in_progress',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function submitAttempt(attemptId: string): Promise<void> {
  const { error } = await svc()
    .from('assessment_attempts')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', attemptId);
  if (error) throw error;
}

async function learnerAndRecord(loginId: string): Promise<{ userId: string; recordId: string }> {
  const admin = svc();
  const { data: profile, error } = await admin
    .from('profiles')
    .select('id')
    .eq('login_id', loginId)
    .single();
  if (error) throw error;
  const { data: assignment, error: assignmentError } = await admin
    .from('user_dbd_assignments')
    .select('dbd_record_id')
    .eq('user_id', profile.id)
    .eq('active', true)
    .single();
  if (assignmentError) throw assignmentError;
  return { userId: profile.id, recordId: assignment.dbd_record_id };
}

/**
 * A submitted exam attempt with one answered question, as the assessment writes it, so the
 * staff MCQ review (D82) has a question to show. Returns the question's Thai prompt.
 */
export async function seedExamWithAnswer(
  loginId: string,
  attemptNo: number,
  result: 'pass' | 'fail',
): Promise<string> {
  const admin = svc();
  const { userId, recordId } = await learnerAndRecord(loginId);
  const { data: loc, error: locError } = await admin
    .from('question_localizations')
    .select('question_id, prompt, options, correct_key')
    .eq('language', 'th')
    .not('prompt', 'like', '%{%')
    .limit(1)
    .single();
  if (locError) throw locError;
  const options = loc.options as { key: string; text: string }[];
  const { data: attempt, error } = await admin
    .from('assessment_attempts')
    .insert({
      user_id: userId,
      dbd_record_id: recordId,
      kind: 'exam',
      language: 'th',
      attempt_no: attemptNo,
      status: 'submitted',
      question_ids: [loc.question_id],
      shuffle_seed: `seed-${attemptNo}`,
      passing_mark_snapshot: 80,
      score: result === 'pass' ? 1 : 0,
      max_score: 1,
      result,
      submitted_at: new Date(Date.now() - (10 - attemptNo) * 60_000).toISOString(),
    })
    .select('id')
    .single();
  if (error) throw error;
  const wrong = options.find((o) => o.key !== loc.correct_key)!.key;
  const { error: answerError } = await admin.from('assessment_answers').insert({
    attempt_id: attempt.id,
    question_id: loc.question_id,
    position: 1,
    rendered_prompt: loc.prompt,
    rendered_options: options,
    presented_option_order: options.map((o) => o.key),
    selected_key: result === 'pass' ? loc.correct_key : wrong,
    is_correct: result === 'pass',
    answered_at: new Date().toISOString(),
  });
  if (answerError) throw answerError;
  return loc.prompt;
}

/** A closed readiness interview with a short conversation, as the officer writes it (D82). */
export async function seedInterviewWithTurns(
  loginId: string,
  verdict: 'ready' | 'not_ready',
  learnerAnswer: string,
): Promise<void> {
  const admin = svc();
  const { userId, recordId } = await learnerAndRecord(loginId);
  const { data: session, error } = await admin
    .from('interview_sessions')
    .insert({
      user_id: userId,
      dbd_record_id: recordId,
      status: 'completed',
      verdict,
      plan: { items: [], cursor: 0 },
      provider: 'fake',
      summary: { narrative: verdict === 'ready' ? 'ตอบได้ครบถ้วน' : 'ยังตอบไม่ครบ' },
      ended_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw error;
  const { error: turnsError } = await admin.from('interview_turns').insert([
    { session_id: session.id, seq: 1, role: 'officer', content: 'ชื่อบริษัทของคุณคืออะไรคะ' },
    { session_id: session.id, seq: 2, role: 'learner', content: learnerAnswer },
  ]);
  if (turnsError) throw turnsError;
}

/**
 * Marks fields of the learner's company as read with the given confidences and unconfirms the
 * record, so validation has a low-confidence exception to raise. Returns the record id.
 */
export async function setProvenance(
  loginId: string,
  confidences: Record<string, number>,
): Promise<string> {
  const admin = svc();
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('login_id', loginId)
    .single();
  const { data: assignment } = await admin
    .from('user_dbd_assignments')
    .select('dbd_record_id')
    .eq('user_id', profile!.id)
    .eq('active', true)
    .single();
  const recordId = assignment!.dbd_record_id;
  const { data: record } = await admin
    .from('dbd_records')
    .select('structured_data')
    .eq('id', recordId)
    .single();
  const structured = (record!.structured_data as Record<string, unknown>) ?? {};
  const provenance = Object.fromEntries(
    Object.entries(confidences).map(([field, confidence]) => [
      field,
      { confidence, source_page: 1, source_document: 1 },
    ]),
  );
  const { error } = await admin
    .from('dbd_records')
    .update({
      structured_data: {
        ...structured,
        provenance: { ...((structured.provenance as object) ?? {}), ...provenance },
      },
      extraction_status: 'extracted',
      confirmed_by: null,
      confirmed_at: null,
      confirmed_automatically: false,
    })
    .eq('id', recordId);
  if (error) throw error;
  return recordId;
}
