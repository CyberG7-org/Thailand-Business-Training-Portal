// No `server-only` here, on purpose: everything below is pure or reads with the client it is
// given, and the e2e seed — plain Node, where `server-only` throws — builds a record's first
// version with it, the same way `syncTrainingVersion` does.
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { conceptCoverage, type Coverage } from '@/lib/domain/concepts/resolve';
import { readStructuredData, type StructuredData } from '@/lib/domain/dbd-profile';
import {
  buildTrainingSnapshot,
  canonicalJson,
  type TrainingSnapshot,
} from '@/lib/domain/facts/snapshot';
import { resolveRegisteredAddress, type RegisteredAddress } from '@/lib/domain/geo/resolve';
import type { Database, Json } from './database.types';
import type { DbdRecordRow } from './dbd-records';
import { geoLookup } from './geo';

type Db = SupabaseClient<Database>;

/**
 * The stored address, or — for a record saved before P17a — the printed address resolved on the
 * fly. Never written on a read: the next save stores it.
 */
export async function currentAddress(
  db: Db,
  record: Pick<DbdRecordRow, 'head_office_address'>,
  stored: StructuredData,
): Promise<RegisteredAddress> {
  return stored.address ?? resolveRegisteredAddress(record.head_office_address, geoLookup(db));
}

/** Content identity of a sheet: the facts and the extras, never the provenance. */
export function snapshotHash(snapshot: TrainingSnapshot): string {
  return createHash('sha256').update(canonicalJson(snapshot)).digest('hex').slice(0, 32);
}

export const isComplete = (c: Coverage): boolean =>
  c.mcq.ready === c.mcq.total && c.interview.ready === c.interview.total;

/** A record's live sheet as its next version would freeze it (spec §5.6). */
export type TrainingSheet = {
  snapshot: TrainingSnapshot;
  structured: StructuredData;
  coverage: Coverage;
  hash: string;
};

export async function readTrainingSheet(db: Db, record: DbdRecordRow): Promise<TrainingSheet> {
  const structured = readStructuredData(record.structured_data);
  const address = await currentAddress(db, record, structured);
  const snapshot = buildTrainingSnapshot({ record, structured, address });
  return {
    snapshot,
    structured,
    coverage: conceptCoverage(snapshot.facts, 'company'),
    hash: snapshotHash(snapshot),
  };
}

export type VersionColumns = Pick<
  Database['public']['Tables']['company_training_versions']['Insert'],
  | 'facts'
  | 'extras'
  | 'provenance'
  | 'coverage'
  | 'company_complete'
  | 'facts_hash'
  | 'source_updated_at'
  | 'created_by'
>;

export type ActivationArgs = Database['public']['Functions']['activate_training_version']['Args'];

function frozen(sheet: TrainingSheet) {
  return {
    facts: sheet.snapshot.facts as unknown as Json,
    extras: sheet.snapshot.extras as unknown as Json,
    provenance: (sheet.structured.provenance ?? {}) as unknown as Json,
    coverage: {
      mcq: sheet.coverage.mcq,
      interview: sheet.coverage.interview,
      missingFacts: sheet.coverage.missingFacts,
    } as unknown as Json,
    complete: isComplete(sheet.coverage),
  };
}

/** What a version row freezes from a sheet; the draft and the activation write the same. */
export function versionColumns(
  sheet: TrainingSheet,
  record: Pick<DbdRecordRow, 'updated_at'>,
  actorId: string | null,
): VersionColumns {
  const f = frozen(sheet);
  return {
    facts: f.facts,
    extras: f.extras,
    provenance: f.provenance,
    coverage: f.coverage,
    company_complete: f.complete,
    facts_hash: sheet.hash,
    source_updated_at: record.updated_at,
    created_by: actorId,
  };
}

/** The arguments of `activate_training_version`: supersede, insert, pin — one serialized step. */
export function activationArgs(
  sheet: TrainingSheet,
  record: Pick<DbdRecordRow, 'id' | 'updated_at'>,
  actorId: string | null,
  now: Date,
): ActivationArgs {
  const f = frozen(sheet);
  return {
    p_record_id: record.id,
    p_facts: f.facts,
    p_extras: f.extras,
    p_provenance: f.provenance,
    p_coverage: f.coverage,
    p_complete: f.complete,
    p_hash: sheet.hash,
    p_source_updated_at: record.updated_at,
    p_actor: actorId ?? undefined,
    p_at: now.toISOString(),
  };
}
