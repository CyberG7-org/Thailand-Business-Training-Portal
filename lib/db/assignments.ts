import type { SupabaseClient } from '@supabase/supabase-js';
import type { LearnerRole } from '@/lib/domain/bank-interview';
import type { Database } from './database.types';
import type { DbdRecordRow } from './dbd-records';

type Db = SupabaseClient<Database>;
export type AssignmentRow = Database['public']['Tables']['user_dbd_assignments']['Row'];
export type EligibilitySnapshotRow = Database['public']['Tables']['eligibility_snapshots']['Row'];
export type ActiveAssignment = AssignmentRow & { dbd_records: DbdRecordRow };

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
