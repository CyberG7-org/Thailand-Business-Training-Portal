import 'server-only';
import { createSupabaseAdminClient } from './admin';
import { submanagerUploadContext } from './submanager-upload';

/** Authorize before provisioning: the caller supplies only the authenticated actor ID. */
export async function assertSubmanagerMayAssign(
  actorId: string,
  recordId: string,
): Promise<{ managerId: string; recordId: string }> {
  const { teamId } = await submanagerUploadContext(actorId);
  const db = createSupabaseAdminClient();
  const { data: record, error } = await db
    .from('dbd_records')
    .select('id')
    .eq('id', recordId)
    .eq('team_id', teamId)
    .eq('created_by', actorId)
    .eq('extraction_status', 'confirmed')
    .maybeSingle();
  if (error || !record) throw new Error('not-allowed');
  const { data: assignments, error: assignmentError } = await db
    .from('user_dbd_assignments')
    .select('id')
    .eq('dbd_record_id', recordId)
    .eq('active', true)
    .limit(1);
  if (assignmentError || assignments.length) throw new Error('not-allowed');
  return { managerId: teamId, recordId: record.id };
}
