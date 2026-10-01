import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPolicy } from '@/lib/config/policy';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import { buildFactSheet } from '@/lib/domain/facts/fact-sheet';
import { directReadMaxPages } from '@/lib/domain/rag/jobs';
import { todayInBangkok } from '@/lib/domain/thai-date';
import { validateFacts } from '@/lib/domain/validation/validators';
import { createSupabaseAdminClient } from './admin';
import type { Database, Json } from './database.types';
import { getDbdRecord, listDbdDocuments } from './dbd-records';
import { currentAddress } from './training-sheet';
import { syncTrainingVersion, type SyncResult } from './training-versions';

type Db = SupabaseClient<Database>;
export type ExceptionRow = Database['public']['Tables']['training_fact_exceptions']['Row'];

export class ValidationError extends Error {
  constructor(
    public readonly code: 'not_found' | 'not_dismissable' | 'already_resolved' | 'note_required',
  ) {
    super(code);
    this.name = 'ValidationError';
  }
}

export type ValidateResult = {
  findings: number;
  opened: number;
  closed: number;
  accepted: boolean;
  version: SyncResult | 'blocked';
};

const signatureOf = (e: Pick<ExceptionRow, 'detail'>): string =>
  String((e.detail as { signature?: string } | null)?.signature ?? '');

/** The reading has finished: no extract/transcript job open, no oversized document still indexing (D80's rule). */
export async function readingFinished(db: Db, recordId: string): Promise<boolean> {
  const { count, error } = await db
    .from('index_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('record_id', recordId)
    .in('kind', ['extract', 'transcript'])
    .in('status', ['queued', 'running']);
  if (error) throw error;
  if ((count ?? 0) > 0) return false;
  const maxPages = directReadMaxPages();
  const indexing = (await listDbdDocuments(db, recordId)).filter(
    (d) =>
      d.page_count !== null &&
      d.page_count > maxPages &&
      !['ready', 'failed', 'skipped'].includes(d.index_status),
  );
  return indexing.length === 0;
}

export async function listOpenExceptions(db: Db, recordId: string): Promise<ExceptionRow[]> {
  const { data, error } = await db
    .from('training_fact_exceptions')
    .select('*')
    .eq('dbd_record_id', recordId)
    .eq('status', 'open')
    .order('blocks')
    .order('created_at');
  if (error) throw error;
  return data;
}

/**
 * Runs the validators and keeps the queue true to them (spec §5.5): a new problem opens a row,
 * a vanished one closes as `fixed`, a resolved one stays closed while its signature holds. Then
 * accepts the record when nothing blocks acceptance and the reading has finished, and syncs the
 * version, which waits as a draft while anything blocking is open (§5.6). `admin` is the
 * service role; `actorId` names the staff member whose save this was, or null for the cron.
 */
export async function validateRecord(
  admin: Db,
  recordId: string,
  actorId: string | null,
  now: Date = new Date(),
): Promise<ValidateResult | null> {
  const record = await getDbdRecord(admin, recordId);
  if (!record) return null;
  const structured = readStructuredData(record.structured_data);
  const address = await currentAddress(admin, record, structured);
  const [autoAcceptPercent, reviewPercent] = await Promise.all([
    getPolicy('training_auto_accept_confidence_percent'),
    getPolicy('training_review_confidence_percent'),
  ]);
  const findings = validateFacts({
    record,
    structured,
    address,
    facts: buildFactSheet({ record, structured, address, role: null }),
    thresholds: { autoAcceptPercent, reviewPercent },
    today: todayInBangkok(now),
  });

  const { data: rows, error } = await admin
    .from('training_fact_exceptions')
    .select('*')
    .eq('dbd_record_id', recordId);
  if (error) throw error;
  const at = now.toISOString();
  const key = (kind: string, field: string) => `${kind}\u0000${field}`;
  const openByKey = new Map(
    rows.filter((r) => r.status === 'open').map((r) => [key(r.kind, r.field), r]),
  );
  const settled = new Set(
    rows
      .filter((r) => r.status === 'resolved' && r.resolution !== 'fixed')
      .map((r) => `${key(r.kind, r.field)}\u0000${signatureOf(r)}`),
  );

  let opened = 0;
  const kept = new Set<string>();
  for (const f of findings) {
    const k = key(f.kind, f.field);
    const existing = openByKey.get(k);
    if (existing) {
      kept.add(k);
      if (signatureOf(existing) !== f.detail.signature || existing.blocks !== f.blocks) {
        const { error: updateError } = await admin
          .from('training_fact_exceptions')
          .update({ detail: f.detail as unknown as Json, blocks: f.blocks })
          .eq('id', existing.id);
        if (updateError) throw updateError;
      }
      continue;
    }
    if (f.kind !== 'missing' && settled.has(`${k}\u0000${f.detail.signature}`)) continue;
    const { error: insertError } = await admin.from('training_fact_exceptions').insert({
      dbd_record_id: recordId,
      kind: f.kind,
      field: f.field,
      blocks: f.blocks,
      detail: f.detail as unknown as Json,
    });
    if (insertError) throw insertError;
    opened += 1;
  }
  let closed = 0;
  for (const [k, row] of openByKey) {
    if (kept.has(k)) continue;
    const { error: closeError } = await admin
      .from('training_fact_exceptions')
      .update({ status: 'resolved', resolution: 'fixed', resolved_at: at })
      .eq('id', row.id);
    if (closeError) throw closeError;
    closed += 1;
  }

  // Acceptance (plan decision 8): nothing blocking still open — a settled finding does not
  // count — the reading done, and someone to confirm on behalf of.
  const { count: openBlocking, error: countError } = await admin
    .from('training_fact_exceptions')
    .select('id', { count: 'exact', head: true })
    .eq('dbd_record_id', recordId)
    .eq('status', 'open')
    .eq('blocks', 'acceptance');
  if (countError) throw countError;
  let accepted = false;
  if (record.extraction_status !== 'confirmed' && (openBlocking ?? 0) === 0) {
    const confirmedBy = actorId ?? record.created_by;
    if (confirmedBy && (await readingFinished(admin, recordId))) {
      const { data: updated, error: acceptError } = await admin
        .from('dbd_records')
        .update({
          extraction_status: 'confirmed',
          confirmed_by: confirmedBy,
          confirmed_at: at,
          confirmed_automatically: actorId === null,
        })
        .eq('id', recordId)
        .neq('extraction_status', 'confirmed')
        .select('id');
      if (acceptError) throw acceptError;
      accepted = (updated?.length ?? 0) > 0;
    }
  }

  const confirmed = accepted || record.extraction_status === 'confirmed';
  const version: ValidateResult['version'] = confirmed
    ? await syncTrainingVersion(admin, recordId, actorId, now)
    : 'blocked';
  return { findings: findings.length, opened, closed, accepted, version };
}

/** After a change that may have altered the facts: validation never fails the change itself. */
export async function validateAfterChange(recordId: string, actorId: string | null): Promise<void> {
  try {
    await validateRecord(createSupabaseAdminClient(), recordId, actorId);
  } catch (e) {
    console.error('validation', recordId, e);
  }
}

/**
 * A person settles an exception under their own client (RLS: the Owner or the owning manager;
 * the audit names them). A missing fact is supplied, never dismissed (plan decision 6).
 */
export async function resolveException(
  db: Db,
  args: {
    exceptionId: string;
    resolution: 'confirmed' | 'dismissed';
    note: string | null;
    actorId: string;
    now?: Date;
  },
): Promise<ExceptionRow> {
  const { data: row, error } = await db
    .from('training_fact_exceptions')
    .select('*')
    .eq('id', args.exceptionId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new ValidationError('not_found');
  if (row.status !== 'open') throw new ValidationError('already_resolved');
  if (row.kind === 'missing') throw new ValidationError('not_dismissable');
  const note = args.note?.trim() || null;
  if (args.resolution === 'dismissed' && !note) throw new ValidationError('note_required');
  const { data: updated, error: updateError } = await db
    .from('training_fact_exceptions')
    .update({
      status: 'resolved',
      resolution: args.resolution,
      note,
      resolved_by: args.actorId,
      resolved_at: (args.now ?? new Date()).toISOString(),
    })
    .eq('id', row.id)
    .select('*')
    .single();
  if (updateError) throw updateError;
  return updated;
}

export type QueueRow = ExceptionRow & {
  dbd_records: {
    company_name_th: string | null;
    team_id: string | null;
    extraction_status: string;
  } | null;
};

/** Every open exception the caller may see (RLS), acceptance blockers first, oldest first. */
export async function listExceptionQueue(db: Db): Promise<QueueRow[]> {
  const { data, error } = await db
    .from('training_fact_exceptions')
    .select('*, dbd_records(company_name_th, team_id, extraction_status)')
    .eq('status', 'open')
    .order('blocks')
    .order('created_at');
  if (error) throw error;
  return data as QueueRow[];
}
