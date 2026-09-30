import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { conceptCoverage, type Coverage } from '@/lib/domain/concepts/resolve';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import type { FactSheet } from '@/lib/domain/facts/fact-sheet';
import {
  buildTrainingSnapshot,
  canonicalJson,
  type TrainingExtras,
  type TrainingSnapshot,
} from '@/lib/domain/facts/snapshot';
import { createSupabaseAdminClient } from './admin';
import type { Database, Json } from './database.types';
import { getDbdRecord } from './dbd-records';
import { currentAddress } from './derived-facts';

type Db = SupabaseClient<Database>;
export type TrainingVersionRow = Database['public']['Tables']['company_training_versions']['Row'];

/** What a version records about its own readiness (spec §5.6): company scope, at freeze time. */
export type VersionCoverage = Pick<Coverage, 'mcq' | 'interview' | 'missingFacts'>;

export type SyncResult = 'not_found' | 'unconfirmed' | 'unchanged' | 'activated';

/** Content identity of a sheet: the facts and the extras, never the provenance. */
export function snapshotHash(snapshot: TrainingSnapshot): string {
  return createHash('sha256').update(canonicalJson(snapshot)).digest('hex').slice(0, 32);
}

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

const isComplete = (c: Coverage) =>
  c.mcq.ready === c.mcq.total && c.interview.ready === c.interview.total;

/**
 * Freezes a confirmed record's current sheet as its active version when the sheet changed
 * (spec §5.6): the previous active version is superseded, an assignment without a version is
 * pinned to this one (plan decision 2), and nobody else moves (D75). No blocking-exception
 * gate yet — P17c adds it in front of the activation; the `draft` status waits for it.
 * `admin` is the service role: versions have no write policy.
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

  const structured = readStructuredData(record.structured_data);
  const address = await currentAddress(admin, record, structured);
  const snapshot = buildTrainingSnapshot({ record, structured, address });
  const hash = snapshotHash(snapshot);
  const active = await getActiveVersion(admin, recordId);
  if (active && active.facts_hash === hash) return 'unchanged';

  const coverage = conceptCoverage(snapshot.facts, 'company');
  const { data: last } = await admin
    .from('company_training_versions')
    .select('version_no')
    .eq('dbd_record_id', recordId)
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle();
  const at = now.toISOString();

  if (active) {
    const { error } = await admin
      .from('company_training_versions')
      .update({ status: 'superseded', superseded_at: at })
      .eq('id', active.id);
    if (error) throw error;
  }
  const { data: created, error } = await admin
    .from('company_training_versions')
    .insert({
      dbd_record_id: recordId,
      version_no: (last?.version_no ?? 0) + 1,
      status: 'active',
      facts: snapshot.facts as unknown as Json,
      extras: snapshot.extras as unknown as Json,
      provenance: (structured.provenance ?? {}) as unknown as Json,
      coverage: {
        mcq: coverage.mcq,
        interview: coverage.interview,
        missingFacts: coverage.missingFacts,
      } as unknown as Json,
      company_complete: isComplete(coverage),
      facts_hash: hash,
      source_updated_at: record.updated_at,
      created_by: actorId,
      activated_at: at,
    })
    .select('id')
    .single();
  if (error) throw error;

  const { error: pinError } = await admin
    .from('user_dbd_assignments')
    .update({ training_version_id: created.id })
    .eq('dbd_record_id', recordId)
    .eq('active', true)
    .is('training_version_id', null);
  if (pinError) throw pinError;
  return 'activated';
}

/** After a change that may have altered the sheet: versioning never fails the change itself. */
export async function syncAfterChange(recordId: string, actorId: string | null): Promise<void> {
  try {
    await syncTrainingVersion(createSupabaseAdminClient(), recordId, actorId);
  } catch (e) {
    console.error('training version', recordId, e);
  }
}
