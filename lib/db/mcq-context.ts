import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FactSheet } from '@/lib/domain/facts/fact-sheet';
import { BUSINESS_NATURES } from '@/lib/domain/business-natures';
import { assignmentFacts, buildRoleSnapshot, type RoleSnapshot } from '@/lib/domain/facts/snapshot';
import type { RenderContext } from '@/lib/domain/mcq/context';
import { listBusinessCategories } from './business-categories';
import type { Database } from './database.types';
import { geoNeighbours } from './geo';
import { roleOf } from './pinning';
import { getActiveVersion, readSnapshot } from './training-versions';

type Db = SupabaseClient<Database>;

/** The facts plus the places and categories the recipes draw from (spec §5.2, §5.3). */
export async function loadRenderContext(db: Db, facts: FactSheet): Promise<RenderContext> {
  const [geo, categories] = await Promise.all([
    geoNeighbours(db, {
      provinceId: facts.address?.province_id ?? null,
      districtId: facts.address?.district_id ?? null,
      subdistrictId: facts.address?.subdistrict_id ?? null,
    }),
    listBusinessCategories(db),
  ]);
  return {
    facts,
    geo,
    categories: [
      ...categories.map((c) => ({
        key: c.key,
        th: c.label_th,
        en: c.label_en,
        zh: c.label_zh,
        active: c.active,
      })),
      // Bank-interview categories are approved in code. Keep legacy DB categories too so
      // learners pinned to an older training version can still render their quiz.
      ...BUSINESS_NATURES.filter(([key]) => !categories.some((c) => c.key === key)).map(
        ([key, en, , , , th, zh]) => ({ key, th, en, zh, active: true }),
      ),
    ],
  };
}

export type VersionedCompany = { recordId: string; name: string };

/** Companies that hold an active training version: the only ones a variant can be checked on. */
export async function listVersionedCompanies(db: Db): Promise<VersionedCompany[]> {
  const { data, error } = await db
    .from('company_training_versions')
    .select('dbd_record_id, dbd_records(company_name_th, company_name_en)')
    .eq('status', 'active');
  if (error) throw error;
  return data
    .map((row) => ({
      recordId: row.dbd_record_id,
      name:
        row.dbd_records?.company_name_th ?? row.dbd_records?.company_name_en ?? row.dbd_record_id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'th'));
}

export type RecordLearner = { assignmentId: string; name: string };

/** The learners assigned to a record, for the per-learner concept (`learner_shareholding`). */
export async function listRecordLearners(db: Db, recordId: string): Promise<RecordLearner[]> {
  const { data: assignments, error } = await db
    .from('user_dbd_assignments')
    .select('id, user_id')
    .eq('dbd_record_id', recordId)
    .eq('active', true);
  if (error) throw error;
  if (assignments.length === 0) return [];
  const { data: profiles, error: profileError } = await db
    .from('profiles')
    .select('id, display_name, login_id')
    .in(
      'id',
      assignments.map((a) => a.user_id),
    );
  if (profileError) throw profileError;
  const names = new Map(profiles.map((p) => [p.id, p.display_name ?? p.login_id]));
  return assignments
    .map((a) => ({ assignmentId: a.id, name: names.get(a.user_id) ?? a.user_id }))
    .sort((a, b) => a.name.localeCompare(b.name, 'th'));
}

/**
 * The context of a record's active version; with an assignment, the learner's own role facts on
 * top (their confirmed role, or the role as typed). Null when the record has no version. This
 * reads the record as it stands now — a learner pinned to an older version is P17e's business.
 */
export async function contextForRecord(
  db: Db,
  recordId: string,
  assignmentId: string | null,
): Promise<RenderContext | null> {
  const version = await getActiveVersion(db, recordId);
  if (!version) return null;
  const snapshot = readSnapshot(version);
  let facts = snapshot.facts;
  if (assignmentId) {
    const { data: assignment, error } = await db
      .from('user_dbd_assignments')
      .select('*')
      .eq('id', assignmentId)
      .eq('dbd_record_id', recordId)
      .maybeSingle();
    if (error) throw error;
    if (assignment) {
      const role =
        (assignment.role_snapshot as RoleSnapshot | null) ??
        buildRoleSnapshot(roleOf(assignment), snapshot);
      facts = assignmentFacts(snapshot, role);
    }
  }
  return loadRenderContext(db, facts);
}
