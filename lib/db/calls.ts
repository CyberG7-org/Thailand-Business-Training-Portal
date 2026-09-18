import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPolicy } from '@/lib/config/policy';
import { stageStatuses, type StageInfo } from '@/lib/domain/progression';
import { FAKE_TRANSCRIPT, resolveVapiProvider } from '@/lib/integrations/vapi';
import {
  buildWebCallConfig,
  companyVariables,
  type CallCompanyFacts,
  type WebCallConfig,
} from '@/lib/integrations/vapi/config';
import type { ParsedVapiMessage } from '@/lib/integrations/vapi/webhook';
import { createSupabaseAdminClient } from './admin';
import { toTemplateRecord } from './assessment';
import { getActiveAssignmentForUser } from './assignments';
import type { DbdRecordRow } from './dbd-records';
import type { LearnerRole } from '@/lib/domain/bank-interview';
import type { Database, Json } from './database.types';
import { loadProgressionFacts } from './progression';

type Db = SupabaseClient<Database>;
export type CallSessionRow = Database['public']['Tables']['call_sessions']['Row'];

/** Every fact the bank-interview script may check (decision D39). */
export function callFacts(record: DbdRecordRow, role: LearnerRole | null): CallCompanyFacts {
  const t = toTemplateRecord(record, role);
  return {
    company_name_th: t.company_name_th,
    company_name_en: t.company_name_en,
    juristic_id: t.juristic_id,
    registered_capital: t.registered_capital,
    head_office_address: t.head_office_address,
    directors: t.directors,
    registered_on: t.registered_on,
    province: t.province,
    business_categories: t.business_categories,
    total_shares: t.total_shares,
    shareholders_count: t.shareholders_count,
    account_purpose: t.account_purpose,
    monthly_volume: t.monthly_volume,
    clients_location: t.clients_location,
    suppliers_location: t.suppliers_location,
    source_of_funds: t.source_of_funds,
    business_address: t.business_address,
    operations_status: t.operations_status,
    my_name: t.my_name,
    my_position: t.my_position,
    my_responsibilities: t.my_responsibilities,
    my_relationship: t.my_relationship,
    my_shares: t.my_shares,
    my_share_percent: t.my_share_percent,
  };
}

export class CallError extends Error {
  constructor(
    message: string,
    public readonly code:
      'not_open' | 'max_sessions' | 'not_configured' | 'not_found' | 'no_assignment',
    public readonly gate?: StageInfo,
  ) {
    super(message);
    this.name = 'CallError';
  }
}

const RECORDINGS_BUCKET = 'recordings';
const SIGNED_URL_SECONDS = 300;

/** The bank stage gate as the dashboard computes it (BR-003/004, exam policy). */
export async function bankGateFor(db: Db, userId: string): Promise<StageInfo> {
  return stageStatuses(await loadProgressionFacts(db, userId)).bank;
}

/** Creates a session after re-checking every gate server-side; returns the web-call config. */
export async function startCallSession(
  db: Db,
  userId: string,
  env: Record<string, string | undefined> = process.env,
): Promise<{ session: CallSessionRow; config: WebCallConfig | null; provider: 'vapi' | 'fake' }> {
  const provider = resolveVapiProvider(env);
  if (provider === 'off') throw new CallError('Call training is not configured', 'not_configured');

  // Practice stays open once the stage is done; only call_max_sessions caps it.
  const gate = await bankGateFor(db, userId);
  if (gate.status !== 'available' && gate.status !== 'in_progress' && gate.status !== 'done') {
    throw new CallError('Bank stage is not open', 'not_open', gate);
  }
  const admin = createSupabaseAdminClient();
  const maxSessions = await getPolicy('call_max_sessions');
  if (maxSessions !== null) {
    const { count } = await admin
      .from('call_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if ((count ?? 0) >= maxSessions) throw new CallError('Session limit reached', 'max_sessions');
  }

  const assignment = await getActiveAssignmentForUser(admin, userId);
  if (!assignment) throw new CallError('No active assignment', 'no_assignment');
  const r = assignment.dbd_records;
  const facts = callFacts(r, assignment);

  const { data: session, error } = await admin
    .from('call_sessions')
    .insert({
      user_id: userId,
      dbd_record_id: assignment.dbd_record_id,
      modality: provider === 'fake' ? 'fake' : 'web',
      status: 'initiated',
      metadata: { provider },
    })
    .select()
    .single();
  if (error) throw error;

  if (provider === 'fake') return { session, config: null, provider };
  const appUrl = env.NEXT_PUBLIC_APP_URL ?? null;
  const config = buildWebCallConfig({
    publicKey: env.VAPI_PUBLIC_KEY ?? '',
    sessionId: session.id,
    facts,
    webhookUrl: appUrl ? `${appUrl.replace(/\/$/, '')}/api/webhooks/vapi` : null,
    webhookSecret: env.VAPI_WEBHOOK_SECRET ?? null,
    env,
  });
  return { session, config, provider };
}

/** Client reports the provider call id right after `vapi.start()` resolves. */
export async function attachVapiCall(
  userId: string,
  sessionId: string,
  vapiCallId: string,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('call_sessions')
    .update({ vapi_call_id: vapiCallId, status: 'in_progress' })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .eq('status', 'initiated')
    .select('id');
  if (error) throw error;
  if (!data?.length) throw new CallError('Session not found', 'not_found');
}

/** Fake modality: complete the session with a canned Thai transcript (dev/tests only). */
export async function completeFakeSession(
  userId: string,
  sessionId: string,
): Promise<CallSessionRow> {
  const admin = createSupabaseAdminClient();
  const { data: session } = await admin
    .from('call_sessions')
    .select('*, dbd_records(*)')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!session || session.modality !== 'fake')
    throw new CallError('Session not found', 'not_found');
  const assignment = await getActiveAssignmentForUser(admin, userId);
  const vars = companyVariables(
    callFacts(session.dbd_records as unknown as DbdRecordRow, assignment),
  );
  const transcript = FAKE_TRANSCRIPT.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => vars[k] ?? '-');
  const { data, error } = await admin
    .from('call_sessions')
    .update({
      status: 'completed',
      vapi_call_id: `fake_${sessionId}`,
      transcript,
      ended_at: new Date().toISOString(),
      metadata: { provider: 'fake', ended_reason: 'simulated' },
    })
    .eq('id', sessionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function copyRecording(sessionId: string, url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
    const ext = contentType.includes('wav') ? 'wav' : contentType.includes('mpeg') ? 'mp3' : 'bin';
    const path = `${sessionId}/${Date.now()}.${ext}`;
    const { error } = await createSupabaseAdminClient()
      .storage.from(RECORDINGS_BUCKET)
      .upload(path, bytes, { contentType });
    return error ? null : path;
  } catch {
    return null;
  }
}

/**
 * Applies a parsed Vapi message. Duplicate deliveries are no-ops via the webhook_events ledger.
 * Returns what happened for logging/tests.
 */
export async function ingestVapiMessage(
  parsed: ParsedVapiMessage,
  rawPayload: unknown,
  fetchRecording: (sessionId: string, url: string) => Promise<string | null> = copyRecording,
): Promise<'duplicate' | 'ignored' | 'no_session' | 'applied'> {
  const admin = createSupabaseAdminClient();
  const { data: inserted } = await admin
    .from('webhook_events')
    .insert({
      provider: 'vapi',
      external_id: parsed.externalId,
      event_type: parsed.type,
      payload: rawPayload as Json,
    })
    .select('id')
    .maybeSingle();
  if (!inserted) return 'duplicate';

  const finish = async (status: 'applied' | 'ignored' | 'no_session', error?: string) => {
    await admin
      .from('webhook_events')
      .update({ processed_at: new Date().toISOString(), error: error ?? null })
      .eq('id', inserted.id);
    return status;
  };

  if (parsed.type !== 'status-update' && parsed.type !== 'end-of-call-report')
    return finish('ignored');

  let query = admin.from('call_sessions').select('*');
  query = parsed.callId
    ? query.eq('vapi_call_id', parsed.callId)
    : parsed.sessionId
      ? query.eq('id', parsed.sessionId)
      : query.eq('id', '00000000-0000-0000-0000-000000000000');
  let { data: session } = await query.maybeSingle();
  if (!session && parsed.sessionId) {
    // The client may not have attached the call id yet; fall back to the session id in variables.
    const { data } = await admin
      .from('call_sessions')
      .select('*')
      .eq('id', parsed.sessionId)
      .maybeSingle();
    session = data;
  }
  if (!session) return finish('no_session', 'no matching session');
  const meta = (session.metadata as Record<string, Json> | null) ?? {};
  const endedReason = parsed.endedReason ?? (meta.ended_reason as string | undefined) ?? null;

  if (parsed.type === 'status-update') {
    if (parsed.status === 'in-progress' && session.status === 'initiated') {
      await admin
        .from('call_sessions')
        .update({ status: 'in_progress', vapi_call_id: parsed.callId ?? session.vapi_call_id })
        .eq('id', session.id);
    } else if (parsed.status === 'ended' && !session.ended_at) {
      await admin
        .from('call_sessions')
        .update({
          ended_at: new Date().toISOString(),
          vapi_call_id: parsed.callId ?? session.vapi_call_id,
          metadata: { ...meta, ended_reason: endedReason },
        })
        .eq('id', session.id);
    }
    return finish('applied');
  }

  const recordingPath = parsed.recordingUrl
    ? await fetchRecording(session.id, parsed.recordingUrl)
    : null;
  const transcript = parsed.transcript ?? session.transcript;
  const status =
    transcript && recordingPath ? 'completed' : transcript || recordingPath ? 'partial' : 'failed';
  await admin
    .from('call_sessions')
    .update({
      status,
      vapi_call_id: parsed.callId ?? session.vapi_call_id,
      transcript,
      recording_path: recordingPath ?? session.recording_path,
      ended_at: session.ended_at ?? new Date().toISOString(),
      metadata: {
        ...meta,
        ended_reason: endedReason,
        ...(parsed.recordingUrl && !recordingPath
          ? { provider_recording_url: parsed.recordingUrl }
          : {}),
      },
    })
    .eq('id', session.id);
  return finish('applied');
}

export async function listMyCallSessions(db: Db, userId: string): Promise<CallSessionRow[]> {
  const { data, error } = await db
    .from('call_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false });
  if (error) throw error;
  return data;
}

export type CallSessionWithUser = CallSessionRow & {
  profiles: { login_id: string; display_name: string | null };
  dbd_records: { company_name_th: string | null };
};

export async function listAllCallSessions(db: Db): Promise<CallSessionWithUser[]> {
  const { data, error } = await db
    .from('call_sessions')
    .select('*, profiles!inner(login_id, display_name), dbd_records(company_name_th)')
    .order('started_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data as unknown as CallSessionWithUser[];
}

export async function getCallSession(db: Db, id: string): Promise<CallSessionWithUser | null> {
  const { data, error } = await db
    .from('call_sessions')
    .select('*, profiles!inner(login_id, display_name), dbd_records(company_name_th)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as CallSessionWithUser | null) ?? null;
}

/** Admin-only signed URL for a stored recording. */
export async function createRecordingUrl(recordingPath: string): Promise<string | null> {
  const { data } = await createSupabaseAdminClient()
    .storage.from(RECORDINGS_BUCKET)
    .createSignedUrl(recordingPath, SIGNED_URL_SECONDS);
  return data?.signedUrl ?? null;
}
