import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LearnerRole } from '@/lib/domain/bank-interview';
import { revealedFact } from '@/lib/domain/interview/leak';
import {
  advance,
  buildReadinessPlan,
  currentItem,
  isReadinessPlan,
  probingItems,
} from '@/lib/domain/interview/plan';
import { detectPasted } from '@/lib/domain/interview/pasted';
import type {
  Assessment,
  CloseReason,
  FactSheet,
  InterviewPlan,
  OfficerTurn,
  PlanItem,
  Turn,
} from '@/lib/domain/interview/types';
import { decideVerdict } from '@/lib/domain/interview/verdict';
import { stageStatuses, type StageInfo } from '@/lib/domain/progression';
import { formatDate } from '@/lib/domain/thai-date';
import { getInterviewProvider, type InterviewProvider } from '@/lib/integrations/interview';
import { createSupabaseAdminClient } from './admin';
import type { TemplateRecord } from '@/lib/domain/assessment/template';
import { templateRecordFromSnapshot } from '@/lib/domain/facts/snapshot';
import { invoiceFacts } from '@/lib/domain/invoices/answers';
import type { InvoiceSummary } from '@/lib/domain/invoices/arithmetic';
import { toTemplateRecord } from './assessment';
import { pinnedFactsFor } from './pinning';
import { getActiveAssignmentForUser } from './assignments';
import type { Database, Json } from './database.types';
import type { DbdRecordRow } from './dbd-records';
import { loadProgressionFacts } from './progression';

type Db = SupabaseClient<Database>;
export type InterviewSessionRow = Database['public']['Tables']['interview_sessions']['Row'];
export type InterviewTurnRow = Database['public']['Tables']['interview_turns']['Row'];

export const IDLE_MINUTES = 30;
export const MAX_LEARNER_TURNS = 30;
export const MAX_INPUT_CHARS = 1000;
const MAX_EVASIONS = 3;

/** Two attempts per item plus room for the probing pass; never below the spec's 30 (D64). */
export function turnBudget(plan: InterviewPlan): number {
  return Math.max(MAX_LEARNER_TURNS, plan.items.length * 2 + 8);
}

export type Budget = { used: number; max: number };

const GREETING = 'สวัสดีค่ะ ดิฉันเป็นเจ้าหน้าที่ธนาคาร ขอสอบถามข้อมูลบริษัทนะคะ ';
const REASK = 'ขอถามอีกครั้งนะคะ ';
/** What the officer says when the code, not the model, closes the interview. */
const CLOSING = {
  turn_limit: 'ขอบคุณค่ะ การสัมภาษณ์ครบจำนวนข้อความที่กำหนดแล้ว ธนาคารจะสรุปผลให้นะคะ',
  too_many_evasions: 'ขออภัยค่ะ วันนี้ธนาคารยังไม่สามารถดำเนินการต่อได้ ขอบคุณที่มาค่ะ',
} as const;

export type InterviewErrorCode =
  | 'not_open'
  | 'not_configured'
  | 'not_found'
  | 'no_assignment'
  | 'no_version'
  | 'no_facts'
  | 'closed'
  | 'expired'
  | 'too_long';

export class InterviewError extends Error {
  constructor(
    message: string,
    public readonly code: InterviewErrorCode,
    public readonly gate?: StageInfo,
  ) {
    super(message);
    this.name = 'InterviewError';
  }
}

/** Every fact the officer may verify (D39), as Thai display strings; the set the call used. */
export function interviewFacts(record: DbdRecordRow, role: LearnerRole | null): FactSheet {
  return factsFromTemplate(toTemplateRecord(record, role));
}

/**
 * The same display strings from any template record — a version's or the live row's — plus the
 * invoices' ranges when the version has them (D101).
 */
export function factsFromTemplate(
  t: TemplateRecord,
  invoices: InvoiceSummary | null = null,
): FactSheet {
  const text = (v: unknown): string | null =>
    v === null || v === undefined || v === ''
      ? null
      : typeof v === 'number'
        ? v.toLocaleString('th-TH')
        : String(v);
  return {
    company_name_th: text(t.company_name_th),
    company_name_en: text(t.company_name_en),
    juristic_id: text(t.juristic_id),
    registered_capital: text(t.registered_capital),
    head_office_address: text(t.head_office_address),
    province: text(t.province),
    directors: t.directors?.length ? t.directors.map((d) => d.name_th).join(', ') : null,
    directors_count: t.directors?.length ? String(t.directors.length) : null,
    signing_authority: text(t.signing_authority),
    // The officer reads the date the way the certificate prints it (D47), so a Thai answer matches.
    registered_on: t.registered_on ? formatDate(t.registered_on, 'th') : null,
    business_categories: t.business_categories?.length ? t.business_categories.join(', ') : null,
    objectives: t.objectives?.length
      ? t.objectives
          .map((o) => o.text)
          .slice(0, 10)
          .join('; ')
      : null,
    shareholders: t.shareholders?.length ? t.shareholders.map((s) => s.name).join(', ') : null,
    shareholders_count: text(t.shareholders_count),
    total_shares: text(t.total_shares),
    par_value: text(t.par_value),
    nature_of_business: text(t.nature_of_business),
    products_services: text(t.products_services),
    account_purpose: text(t.account_purpose),
    monthly_volume: text(t.monthly_volume),
    clients_location: text(t.clients_location),
    suppliers_location: text(t.suppliers_location),
    source_of_funds: text(t.source_of_funds),
    business_address: text(t.business_address),
    operations_status: text(t.operations_status),
    my_name: text(t.my_name),
    my_position: text(t.my_position),
    my_responsibilities: text(t.my_responsibilities),
    my_relationship: text(t.my_relationship),
    my_shares: text(t.my_shares),
    my_share_percent: text(t.my_share_percent),
    customer_profile: text(t.customer_profile),
    transaction_details: text(t.transaction_details),
    ...invoiceFacts(invoices),
  };
}

function provider(): InterviewProvider {
  const p = getInterviewProvider();
  if (!p) throw new InterviewError('The interview is not configured', 'not_configured');
  return p;
}

async function gateFor(userId: string): Promise<StageInfo> {
  const admin = createSupabaseAdminClient();
  return stageStatuses(await loadProgressionFacts(admin, userId)).interview;
}

function toTurns(rows: InterviewTurnRow[]): Turn[] {
  return rows.map((r) => ({
    role: r.role as Turn['role'],
    content: r.content,
    assessment: (r.assessment as Assessment | null) ?? null,
  }));
}

const assessed = (turns: Turn[]): Assessment[] =>
  turns.flatMap((t) => (t.assessment && 'verdict' in t.assessment ? [t.assessment] : []));

async function turnsOf(sessionId: string): Promise<InterviewTurnRow[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from('interview_turns')
    .select('*')
    .eq('session_id', sessionId)
    .order('seq');
  if (error) throw error;
  return data;
}

async function record(
  sessionId: string,
  seq: number,
  role: Turn['role'],
  content: string,
  assessment: Json | null,
): Promise<InterviewTurnRow> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('interview_turns')
    .insert({ session_id: sessionId, seq, role, content, assessment })
    .select()
    .single();
  if (error) throw error;
  await admin
    .from('interview_sessions')
    .update({ last_turn_at: new Date().toISOString() })
    .eq('id', sessionId);
  return data;
}

async function factsFor(userId: string) {
  const admin = createSupabaseAdminClient();
  const assignment = await getActiveAssignmentForUser(admin, userId);
  if (!assignment) throw new InterviewError('No active assignment', 'no_assignment');
  const pinned = await pinnedFactsFor(admin, assignment);
  if (!pinned) throw new InterviewError('No training version yet', 'no_version');
  return {
    assignment,
    facts: factsFromTemplate(
      templateRecordFromSnapshot(pinned.snapshot, pinned.role),
      pinned.snapshot.extras.invoice_summary,
    ),
  };
}

function isIdle(session: InterviewSessionRow): boolean {
  return Date.now() - new Date(session.last_turn_at).getTime() >= IDLE_MINUTES * 60_000;
}

async function abandon(sessionId: string): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from('interview_sessions')
    .update({ status: 'abandoned', ended_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) throw error;
}

/** Spec §4.5: an open session idle for IDLE_MINUTES is abandoned wherever it is next touched. */
async function assertFresh(session: InterviewSessionRow): Promise<void> {
  if (!isIdle(session)) return;
  await abandon(session.id);
  throw new InterviewError('The session sat idle too long', 'expired');
}

/**
 * The code's last word on a turn: the assessment is of the answer to the question actually
 * asked, whatever concept the model named; and an officer who states a fact (spec §4.3) is
 * replaced by a plain re-ask, so nothing from the record reaches the transcript.
 */
function guard(
  reply: OfficerTurn,
  item: PlanItem | null,
  facts: FactSheet,
  opening: boolean,
): OfficerTurn {
  const assessment =
    reply.assessment && item ? { ...reply.assessment, concept: item.concept } : reply.assessment;
  if (revealedFact(reply.say, facts) === null) return { ...reply, assessment };
  console.warn('interview: the officer stated a fact; the turn was replaced');
  const say = item ? (opening ? GREETING : REASK) + item.question : CLOSING.turn_limit;
  return { say, assessment, next: reply.next };
}

/**
 * The learner's open session, or a new one. An open session idle for IDLE_MINUTES is abandoned
 * first: the bank would not have waited either, and an abandoned session never gets a verdict.
 */
export async function startOrResumeInterview(
  userId: string,
): Promise<{ session: InterviewSessionRow; turns: InterviewTurnRow[] }> {
  const officer = provider();
  const gate = await gateFor(userId);
  if (gate.status !== 'available' && gate.status !== 'in_progress' && gate.status !== 'done') {
    throw new InterviewError('The interview is not open', 'not_open', gate);
  }
  const admin = createSupabaseAdminClient();
  const { data: open } = await admin
    .from('interview_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open) {
    if (!isIdle(open)) return { session: open, turns: await turnsOf(open.id) };
    await abandon(open.id);
  }
  const { assignment, facts } = await factsFor(userId);
  const plan = buildReadinessPlan(facts);
  // Only a record confirmed before D58 can lack every fact; it would otherwise end ready
  // without a single question.
  if (plan.items.length === 0) throw new InterviewError('Nothing to verify', 'no_facts');
  // The officer speaks before the session exists: a provider failure leaves nothing behind.
  const opening = guard(
    await officer.turn({
      facts,
      plan,
      transcript: [],
      learnerMessage: null,
      pastedDetected: false,
      evasions: 0,
    }),
    plan.items[0] ?? null,
    facts,
    true,
  );
  const { data: session, error } = await admin
    .from('interview_sessions')
    .insert({
      user_id: userId,
      dbd_record_id: assignment.dbd_record_id,
      status: 'in_progress',
      plan: plan as unknown as Json,
      provider: officer.name,
    })
    .select()
    .single();
  if (error) throw error;
  const turn = await record(session.id, 1, 'officer', opening.say, {
    next: opening.next,
  } as unknown as Json);
  return { session, turns: [turn] };
}

async function ownSession(userId: string, sessionId: string): Promise<InterviewSessionRow> {
  const { data } = await createSupabaseAdminClient()
    .from('interview_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) throw new InterviewError('No such session', 'not_found');
  return data;
}

/** The verdict is stored first; the narrative is the model's and never blocks it. */
async function close(
  session: InterviewSessionRow,
  plan: InterviewPlan,
  transcript: Turn[],
  facts: FactSheet,
  reason: CloseReason,
): Promise<void> {
  const core = decideVerdict(plan, assessed(transcript), reason);
  const admin = createSupabaseAdminClient();
  const summary = { ...core, narrative: '', closeReason: reason };
  const { error } = await admin
    .from('interview_sessions')
    .update({
      status: 'completed',
      verdict: core.verdict,
      summary: summary as unknown as Json,
      plan: advance(plan, { close: reason }) as unknown as Json,
      ended_at: new Date().toISOString(),
    })
    .eq('id', session.id);
  if (error) throw error;
  try {
    const narrative = await provider().narrate({ facts, verdict: core, transcript });
    if (narrative) {
      await admin
        .from('interview_sessions')
        .update({ summary: { ...summary, narrative } as unknown as Json })
        .eq('id', session.id);
    }
  } catch (e) {
    console.error('interview: the narrative failed; the verdict stands without it', e);
  }
}

/**
 * One learner message in, one officer turn out; the session closes when the officer says so, or
 * when the code's limits say so. Nothing is written until the officer has answered: a provider
 * failure leaves the learner's message in their hands, not in the transcript.
 */
export async function submitLearnerMessage(
  userId: string,
  sessionId: string,
  content: string,
): Promise<{ turns: InterviewTurnRow[]; closed: boolean; budget: Budget }> {
  const text = content.trim();
  if (text.length === 0 || text.length > MAX_INPUT_CHARS) {
    throw new InterviewError('Message too long', 'too_long');
  }
  const session = await ownSession(userId, sessionId);
  if (session.status !== 'in_progress') throw new InterviewError('The session is closed', 'closed');
  await assertFresh(session);
  const admin = createSupabaseAdminClient();
  const { facts } = await factsFor(userId);
  const rows = await turnsOf(sessionId);
  const transcript = toTurns(rows);
  let plan = session.plan as unknown as InterviewPlan;
  const item = currentItem(plan);
  // Spec §4.2, the second phase: when the last facts item is on the table, the risk officer's
  // probing items are appended, so the officer moves on to them instead of closing. The item
  // being answered now is not probed: its verdict is not known yet.
  if (item && item.phase === 'facts' && plan.cursor === plan.items.length - 1) {
    const probing = probingItems(plan, assessed(transcript)).filter(
      (p) => p.concept !== item.concept,
    );
    if (probing.length) plan = { ...plan, items: [...plan.items, ...probing] };
  }
  const learnerTurns = rows.filter((r) => r.role === 'learner').length + 1;
  const evasions = assessed(transcript).filter((a) => a.verdict === 'evasive').length;
  // The transcript ends with the officer's question; the answer travels as learnerMessage, so
  // the Claude adapter's messages alternate.
  const reply = guard(
    await provider().turn({
      facts,
      plan,
      transcript,
      learnerMessage: text,
      pastedDetected: detectPasted(text, facts),
      evasions,
    }),
    item,
    facts,
    false,
  );
  const assessment = reply.assessment;
  const evasionsNow = evasions + (assessment?.verdict === 'evasive' ? 1 : 0);
  // Hard limits belong to the code, whatever the officer decided; they close with a closing
  // line, not with a question the learner can no longer answer.
  let next = reply.next;
  let say = reply.say;
  if ('concept' in next && learnerTurns >= turnBudget(plan)) {
    next = { close: 'turn_limit' };
    say = CLOSING.turn_limit;
  }
  if ('concept' in next && !isReadinessPlan(plan) && evasionsNow >= MAX_EVASIONS) {
    next = { close: 'too_many_evasions' };
    say = CLOSING.too_many_evasions;
  }
  // A v2 learner always gets the full 11-question practice. If an older provider instruction
  // asks to stop for an evasive, pasted or off-topic answer, keep the promised one follow-up and
  // then move on instead.
  if (
    isReadinessPlan(plan) &&
    'close' in next &&
    (next.close === 'too_many_evasions' || next.close === 'off_topic_limit') &&
    item
  ) {
    const followUp = assessment?.verdict !== 'correct' && item.attempts < 1;
    const following = plan.items[plan.cursor + 1];
    if (followUp) {
      next = { concept: item.concept };
      say = REASK + item.question;
    } else if (following) {
      next = { concept: following.concept };
      say = 'รับทราบค่ะ ' + following.question;
    } else {
      next = { close: 'plan_complete' };
      say = 'ขอบคุณค่ะ ครบทุกข้อแล้ว ระบบจะสรุปผลให้นะคะ';
    }
  }
  const seq = rows.length + 1;
  await record(sessionId, seq, 'learner', text, null);
  await record(sessionId, seq + 1, 'officer', say, {
    ...(assessment ?? {}),
    next,
  } as unknown as Json);
  const withReply: Turn[] = [
    ...transcript,
    { role: 'learner', content: text },
    { role: 'officer', content: say, assessment },
  ];
  if ('concept' in next) plan = advance(plan, next);
  const budget: Budget = { used: learnerTurns, max: turnBudget(plan) };
  if ('close' in next || !currentItem(plan)) {
    await close(session, plan, withReply, facts, 'close' in next ? next.close : 'plan_complete');
    return { turns: await turnsOf(sessionId), closed: true, budget };
  }
  await admin
    .from('interview_sessions')
    .update({ plan: plan as unknown as Json })
    .eq('id', sessionId);
  return { turns: await turnsOf(sessionId), closed: false, budget };
}

/** The learner ends early: a verdict on what was answered, which cannot be ready (spec §4.5). */
export async function endInterview(userId: string, sessionId: string): Promise<void> {
  const session = await ownSession(userId, sessionId);
  if (session.status !== 'in_progress') return;
  await assertFresh(session);
  // The pinned facts the session was built on (review on #6), or none when nothing is pinned
  // any more — the narrative then has no facts to lean on, as before.
  const facts = await factsFor(userId)
    .then((f) => f.facts)
    .catch(() => ({}) as FactSheet);
  await close(
    session,
    session.plan as unknown as InterviewPlan,
    toTurns(await turnsOf(sessionId)),
    facts,
    'learner_ended',
  );
}

export async function listMyInterviews(db: Db, userId: string): Promise<InterviewSessionRow[]> {
  const { data, error } = await db
    .from('interview_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** A session with its turns through the caller's own client: RLS decides who sees what. */
export async function getInterviewWithTurns(
  db: Db,
  id: string,
): Promise<{ session: InterviewSessionRow; turns: InterviewTurnRow[] } | null> {
  const { data: session } = await db
    .from('interview_sessions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!session) return null;
  const { data: turns, error } = await db
    .from('interview_turns')
    .select('*')
    .eq('session_id', id)
    .order('seq');
  if (error) throw error;
  return { session, turns };
}

export type StaffInterviewRow = InterviewSessionRow & {
  profiles: { login_id: string; display_name: string | null };
  dbd_records: { company_name_th: string | null } | null;
};

/** RLS narrows a manager to their team; the admin reads everything. */
export async function listInterviewsForStaff(db: Db): Promise<StaffInterviewRow[]> {
  const { data, error } = await db
    .from('interview_sessions')
    .select(
      '*, profiles!interview_sessions_user_id_fkey(login_id, display_name), dbd_records(company_name_th)',
    )
    .order('started_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data as unknown as StaffInterviewRow[];
}
