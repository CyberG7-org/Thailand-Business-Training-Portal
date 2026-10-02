import type { SupabaseClient } from '@supabase/supabase-js';
import type { LearnerRole } from '@/lib/domain/bank-interview';
import { inChunks } from './chunks';
import type { Database } from './database.types';
import type { DbdRecordRow } from './dbd-records';

type Db = SupabaseClient<Database>;
export type AssignmentRow = Database['public']['Tables']['user_dbd_assignments']['Row'];
export type EligibilitySnapshotRow = Database['public']['Tables']['eligibility_snapshots']['Row'];
export type ActiveAssignment = AssignmentRow & { dbd_records: DbdRecordRow };

/** The learner a company has now: one at a time (D93). */
export type RecordLearner = { userId: string; loginId: string; managerId: string | null };

/**
 * The learner each company has now (D93). Pass the service-role client: a company studied by a
 * learner of another team must still read as taken, and RLS hides that learner from a manager.
 * Only the learner's id, code and team come back; the caller decides who may see the code. A
 * company given two learners before D93 answers with the first.
 */
export async function learnersOfRecords(
  admin: Db,
  recordIds: string[],
): Promise<Map<string, RecordLearner>> {
  const learners = new Map<string, RecordLearner>();
  // The owner's list holds every company, so the ids go in slices (a whole list overflows the URL).
  const assignments = await inChunks(recordIds, async (ids) => {
    const { data, error } = await admin
      .from('user_dbd_assignments')
      .select('dbd_record_id, user_id')
      .eq('active', true)
      .in('dbd_record_id', ids)
      .order('assigned_at');
    if (error) throw error;
    return data;
  });
  if (assignments.length === 0) return learners;
  const profiles = await inChunks([...new Set(assignments.map((a) => a.user_id))], async (ids) => {
    const { data, error } = await admin
      .from('profiles')
      .select('id, login_id, manager_id')
      .in('id', ids);
    if (error) throw error;
    return data;
  });
  const byId = new Map(profiles.map((p) => [p.id, p]));
  for (const a of assignments) {
    const p = byId.get(a.user_id);
    if (!p || learners.has(a.dbd_record_id)) continue;
    learners.set(a.dbd_record_id, { userId: p.id, loginId: p.login_id, managerId: p.manager_id });
  }
  return learners;
}

export async function getActiveAssignmentForUser(
  db: Db,
  userId: string,
): Promise<ActiveAssignment | null> {
  const { data, error } = await db
    .from('user_dbd_assignments')
    .select('*, dbd_records(*)')
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  return (data as ActiveAssignment | null) ?? null;
}

/**
 * The database enforces "confirmed only" and "one active per learner"; errors surface as thrown
 * PostgrestErrors. The assignment pins the record's active version (spec §5.6); when there is
 * none yet, the first one to appear pins itself (plan decision 2).
 */
export async function assignDbdRecord(
  db: Db,
  args: { userId: string; dbdRecordId: string },
): Promise<AssignmentRow> {
  const { data: active, error: versionError } = await db
    .from('company_training_versions')
    .select('id')
    .eq('dbd_record_id', args.dbdRecordId)
    .eq('status', 'active')
    .maybeSingle();
  if (versionError) throw versionError;
  const { data, error } = await db
    .from('user_dbd_assignments')
    .insert({
      user_id: args.userId,
      dbd_record_id: args.dbdRecordId,
      training_version_id: active?.id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * The learner's own role in the company (decision D39): feeds {my_*} placeholders. Editing it
 * withdraws a confirmation (plan decision 4); the caller refuses the edit while an evaluation
 * is in progress.
 */
export async function updateAssignmentRole(
  db: Db,
  assignmentId: string,
  role: LearnerRole,
): Promise<void> {
  const { error } = await db
    .from('user_dbd_assignments')
    .update({
      holder_name: role.holder_name,
      position: role.position,
      responsibilities: role.responsibilities,
      relationship_to_shareholders: role.relationship_to_shareholders,
      role_snapshot: null,
      role_confirmed_at: null,
      role_confirmed_by: null,
    })
    .eq('id', assignmentId);
  if (error) throw error;
}

export async function deactivateAssignment(db: Db, assignmentId: string): Promise<void> {
  const { error } = await db
    .from('user_dbd_assignments')
    .update({ active: false, deactivated_at: new Date().toISOString() })
    .eq('id', assignmentId);
  if (error) throw error;
}

export async function getLatestEligibility(
  db: Db,
  userId: string,
  dbdRecordId: string,
): Promise<EligibilitySnapshotRow | null> {
  const { data, error } = await db
    .from('eligibility_snapshots')
    .select('*')
    .eq('user_id', userId)
    .eq('dbd_record_id', dbdRecordId)
    .order('calculated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listConfirmedDbdRecords(db: Db) {
  const { data, error } = await db
    .from('dbd_records')
    .select('id, company_name_th, juristic_id, issued_on, team_id')
    .eq('extraction_status', 'confirmed')
    .order('company_name_th');
  if (error) throw error;
  return data;
}
