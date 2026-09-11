import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from './admin';
import {
  getActiveAssignmentForUser,
  getLatestEligibility,
  type ActiveAssignment,
  type EligibilitySnapshotRow,
} from './assignments';
import type { Database } from './database.types';

type Db = SupabaseClient<Database>;

/** RLS guarantees a learner's client can only ever see their own assignment. */
export async function getMyCompany(db: Db, userId: string): Promise<ActiveAssignment | null> {
  return getActiveAssignmentForUser(db, userId);
}

export async function getMyEligibility(
  db: Db,
  userId: string,
  dbdRecordId: string,
): Promise<EligibilitySnapshotRow | null> {
  return getLatestEligibility(db, userId, dbdRecordId);
}

const SIGNED_URL_SECONDS = 300;

/** Service role is needed to sign, so ownership is verified explicitly first (spec §5). */
export async function createMyDocumentSignedUrl(
  userId: string,
  dbdRecordId: string,
): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data: assignment } = await admin
    .from('user_dbd_assignments')
    .select('dbd_records(document_path)')
    .eq('user_id', userId)
    .eq('dbd_record_id', dbdRecordId)
    .eq('active', true)
    .maybeSingle();
  const documentPath = (assignment?.dbd_records as { document_path: string | null } | null)
    ?.document_path;
  if (!documentPath) return null;
  const { data, error } = await admin.storage
    .from('dbd-documents')
    .createSignedUrl(documentPath, SIGNED_URL_SECONDS);
  if (error) return null;
  return data.signedUrl;
}
