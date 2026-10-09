import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Coverage } from '@/lib/domain/concepts/resolve';
import type { FactSheet } from '@/lib/domain/facts/fact-sheet';
import type { TrainingExtras, TrainingSnapshot } from '@/lib/domain/facts/snapshot';
import { createSupabaseAdminClient } from './admin';
import type { Database } from './database.types';
import { getDbdRecord } from './dbd-records';
import {
  activationArgs,
  readTrainingSheet,
  versionColumns,
  type VersionColumns,
} from './training-sheet';

type Db = SupabaseClient<Database>;
export type TrainingVersionRow = Database['public']['Tables']['company_training_versions']['Row'];

/** What a version records about its own readiness (spec §5.6): company scope, at freeze time. */
export type VersionCoverage = Pick<Coverage, 'mcq' | 'interview' | 'missingFacts'>;

export type SyncResult = 'not_found' | 'unconfirmed' | 'unchanged' | 'activated' | 'draft';

/** A stored version's content. Written only by `syncTrainingVersion`, so the shape is trusted. */
export function readSnapshot(row: Pick<TrainingVersionRow, 'facts' | 'extras'>): TrainingSnapshot {
  if (!row.facts || typeof row.facts !== 'object' || !('company_name_th' in row.facts)) {
    throw new Error('training version without a fact sheet');
  }
  return {
    facts: row.facts as unknown as FactSheet,
    extras: (row.extras ?? {}) as unknown as TrainingExtras,
  };
}

export function versionCoverage(row: Pick<TrainingVersionRow, 'coverage'>): VersionCoverage {
  return row.coverage as unknown as VersionCoverage;
}

export async function getActiveVersion(
  db: Db,
  recordId: string,
): Promise<TrainingVersionRow | null> {
  const { data, error } = await db
    .from('company_training_versions')
    .select('*')
    .eq('dbd_record_id', recordId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getVersion(db: Db, versionId: string): Promise<TrainingVersionRow | null> {
  const { data, error } = await db
    .from('company_training_versions')
    .select('*')
    .eq('id', versionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Newest first. */
export async function listVersions(db: Db, recordId: string): Promise<TrainingVersionRow[]> {
  const { data, error } = await db
    .from('company_training_versions')
    .select('*')
    .eq('dbd_record_id', recordId)
    .order('version_no', { ascending: false });
  if (error) throw error;
  return data;
}

/** Active assignments of the record that are not on its active version (risk §12.4). */
export async function countAssignmentsBehind(
  db: Db,
  recordId: string,
  activeVersionId: string,
): Promise<number> {
  const { count, error } = await db
    .from('user_dbd_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('dbd_record_id', recordId)
    .eq('active', true)
    .or(`training_version_id.is.null,training_version_id.neq.${activeVersionId}`);
  if (error) throw error;
  return count ?? 0;
}

/** Open exceptions that hold back the version (P17c, plan decision 1): both tiers count. */
export async function countOpenBlockers(
  db: Db,
  recordId: string,
): Promise<{ acceptance: number; version: number }> {
  const { data, error } = await db
    .from('training_fact_exceptions')
    .select('blocks')
    .eq('dbd_record_id', recordId)
    .eq('status', 'open')
    .in('blocks', ['acceptance', 'version']);
  if (error) throw error;
  return {
    acceptance: data.filter((e) => e.blocks === 'acceptance').length,
    version: data.filter((e) => e.blocks === 'version').length,
  };
}

/**
 * Freezes a confirmed record's current sheet as its active version when the sheet changed
 * (spec §5.6): the previous active version is superseded, an assignment without a version is
 * pinned to this one (plan decision 2), and nobody else moves (D75) — all in one serialized
 * database step, so a failure leaves the previous version active and two syncs take turns. An
 * open blocking exception keeps the sheet as a draft (P17c). `admin` is the service role: versions have no write policy.
 */
export async function syncTrainingVersion(
  admin: Db,
  recordId: string,
  actorId: string | null,
  now: Date = new Date(),
): Promise<SyncResult> {
  const record = await getDbdRecord(admin, recordId);
  if (!record) return 'not_found';
  if (record.extraction_status !== 'confirmed') return 'unconfirmed';

  const sheet = await readTrainingSheet(admin, record);
  const active = await getActiveVersion(admin, recordId);
  if (active && active.facts_hash === sheet.hash) return 'unchanged';

  // A sheet with an open blocking exception waits as the record's draft (spec §5.6); the
  // learners stay on the active version until the last one is resolved.
  const blockers = await countOpenBlockers(admin, recordId);
  if (blockers.acceptance + blockers.version > 0) {
    await upsertDraft(admin, recordId, versionColumns(sheet, record, actorId));
    return 'draft';
  }
  // One serialized step in the database (review on #6): supersede, insert, pin — or nothing.
  const { data: activeId, error } = await admin.rpc(
    'activate_training_version',
    activationArgs(sheet, record, actorId, now),
  );
  if (error) throw error;
  return activeId ? 'activated' : 'unchanged';
}

/** After a change that may have altered the sheet: versioning never fails the change itself. */
export async function syncAfterChange(recordId: string, actorId: string | null): Promise<void> {
  try {
    await syncTrainingVersion(createSupabaseAdminClient(), recordId, actorId);
  } catch (e) {
    console.error('training version', recordId, e);
  }
}

/** The record's one draft: the sheet as it would be activated, kept current for the panels. */
async function upsertDraft(admin: Db, recordId: string, columns: VersionColumns): Promise<void> {
  const { data: draft } = await admin
    .from('company_training_versions')
    .select('id')
    .eq('dbd_record_id', recordId)
    .eq('status', 'draft')
    .maybeSingle();
  if (draft) {
    const { error } = await admin
      .from('company_training_versions')
      .update(columns)
      .eq('id', draft.id);
    if (error) throw error;
    return;
  }
  const { data: last } = await admin
    .from('company_training_versions')
    .select('version_no')
    .eq('dbd_record_id', recordId)
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await admin.from('company_training_versions').insert({
    ...columns,
    dbd_record_id: recordId,
    version_no: (last?.version_no ?? 0) + 1,
    status: 'draft',
  });
  if (error?.code === '23505') {
    // Two requests may see no draft and choose the same next version number. Reuse the draft
    // inserted by the other request instead of surfacing a transient validation error.
    const { data: concurrentDraft, error: readError } = await admin
      .from('company_training_versions')
      .select('id')
      .eq('dbd_record_id', recordId)
      .eq('status', 'draft')
      .maybeSingle();
    if (readError) throw readError;
    if (concurrentDraft) {
      const { error: updateError } = await admin
        .from('company_training_versions')
        .update(columns)
        .eq('id', concurrentDraft.id);
      if (updateError) throw updateError;
      return;
    }
  }
  if (error) throw error;
}
