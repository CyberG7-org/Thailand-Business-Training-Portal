import type { SupabaseClient } from '@supabase/supabase-js';
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

/** The database enforces "confirmed only" and "one active per learner"; errors surface as thrown PostgrestErrors. */
export async function assignDbdRecord(
  db: Db,
  args: { userId: string; dbdRecordId: string },
): Promise<AssignmentRow> {
  const { data, error } = await db
    .from('user_dbd_assignments')
    .insert({ user_id: args.userId, dbd_record_id: args.dbdRecordId })
    .select()
    .single();
  if (error) throw error;
  return data;
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
    .select('id, company_name_th, juristic_id, issued_on')
    .eq('extraction_status', 'confirmed')
    .order('company_name_th');
  if (error) throw error;
  return data;
}
