import 'server-only';
import { z } from 'zod';
import { createSupabaseAdminClient } from './admin';
import { createDbdRecord, readingStatesOf } from './dbd-records';
import { learnersOfRecords } from './assignments';
import { dbdRecordInputSchema } from '@/lib/domain/dbd-record';
import { companyStatus } from '@/lib/domain/auto-confirm';
import { displayLoginId } from '@/lib/domain/login-id';
import type { CompanyRow } from '@/app/[locale]/(admin)/admin/users/companies-panel';
import type { Json } from './database.types';

/** Actor IDs come only from the authenticated session, never from upload form fields. */
export async function submanagerUploadContext(
  actorId: string,
): Promise<{ actorId: string; teamId: string }> {
  const db = createSupabaseAdminClient();
  const { data: actor, error } = await db
    .from('profiles')
    .select('role, status, archived_at, manager_id')
    .eq('id', actorId)
    .single();
  if (
    error ||
    !actor ||
    actor.role !== 'submanager' ||
    actor.status !== 'active' ||
    actor.archived_at ||
    !actor.manager_id
  )
    throw new Error('not-allowed');
  const { data: parent } = await db
    .from('profiles')
    .select('role, status, archived_at')
    .eq('id', actor.manager_id)
    .single();
  if (!parent || parent.role !== 'manager' || parent.status !== 'active' || parent.archived_at)
    throw new Error('not-allowed');
  return { actorId, teamId: actor.manager_id };
}

export async function createSubmanagerUpload(actorId: string) {
  const { teamId } = await submanagerUploadContext(actorId);
  const db = createSupabaseAdminClient();
  const row = await createDbdRecord(db, dbdRecordInputSchema.parse({}), actorId, undefined, teamId);
  const { error } = await db
    .from('audit_logs')
    .insert({
      actor_id: actorId,
      action: 'dbd_records.upload',
      entity_type: 'dbd_records',
      entity_id: row.id,
      after: { team_id: teamId, created_by: actorId },
    });
  if (error) throw error;
  return row;
}

const manifestSchema = z.object({
  state: z.enum(['pending', 'claimed']),
  files: z.array(
    z.object({
      path: z.string(),
      name: z.string(),
      group: z.enum(['pack', 'invoice', 'agreement']),
    }),
  ),
});
export type InitialUploadFile = z.infer<typeof manifestSchema>['files'][number];

export function initialUploadFiles(id: string, structured: Json): InitialUploadFile[] {
  const manifest = manifestSchema.safeParse(
    (structured as Record<string, Json> | null)?.initial_upload,
  );
  return manifest.success
    ? manifest.data.files.filter((f) => f.path.startsWith(`${id}/`) && !f.path.includes('..'))
    : [];
}

/** Server-created manifest is immutable to the Submanager: RLS grants no record writes. */
export async function saveInitialUploadManifest(
  actorId: string,
  id: string,
  files: InitialUploadFile[],
) {
  const { teamId } = await submanagerUploadContext(actorId);
  const { error } = await createSupabaseAdminClient()
    .from('dbd_records')
    .update({ structured_data: { initial_upload: { state: 'pending', files } } })
    .eq('id', id)
    .eq('created_by', actorId)
    .eq('team_id', teamId);
  if (error) throw error;
}

/** Exact manifest match + atomic claim prevents replay, parallel registration and adding documents later. */
export async function claimInitialUpload(actorId: string, id: string, files: InitialUploadFile[]) {
  const { teamId } = await submanagerUploadContext(actorId);
  const db = createSupabaseAdminClient();
  const { data: row } = await db
    .from('dbd_records')
    .select('structured_data, extraction_status')
    .eq('id', id)
    .eq('created_by', actorId)
    .eq('team_id', teamId)
    .single();
  const structured = row?.structured_data as Record<string, Json> | undefined;
  const manifest = manifestSchema.safeParse(structured?.initial_upload);
  if (
    !manifest.success ||
    manifest.data.state !== 'pending' ||
    row?.extraction_status !== 'none' ||
    JSON.stringify(manifest.data.files) !== JSON.stringify(files)
  )
    throw new Error('not-allowed');
  const { data, error } = await db
    .from('dbd_records')
    .update({
      structured_data: { ...structured, initial_upload: { ...manifest.data, state: 'claimed' } },
    })
    .eq('id', id)
    .eq('created_by', actorId)
    .eq('team_id', teamId)
    .eq('structured_data->initial_upload->>state', 'pending')
    .select('id')
    .maybeSingle();
  if (error || !data) throw new Error('not-allowed');
  return db;
}

/** Safe error marker, with source retained on the same Manager-owned record. */
export async function markUploadForManager(id: string) {
  const { error } = await createSupabaseAdminClient()
    .from('dbd_records')
    .update({ extraction_raw: { error: 'manager_review_required' } })
    .eq('id', id);
  if (error) throw error;
}

/** Only list display fields cross the server boundary; raw records/documents stay staff-only. */
export async function listTeamCompaniesForSubmanager(actorId: string): Promise<CompanyRow[]> {
  const { teamId } = await submanagerUploadContext(actorId);
  const db = createSupabaseAdminClient();
  const { data: records, error } = await db
    .from('dbd_records')
    .select(
      'id, company_name_en, company_name_th, directors, registered_on, extraction_status, confirmed_automatically, created_by',
    )
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const ids = records.map((r) => r.id);
  const [reading, learners] = await Promise.all([
    readingStatesOf(db, ids),
    learnersOfRecords(db, ids),
  ]);
  return records.map((r) => {
    const learner = learners.get(r.id);
    return {
      id: r.id,
      name: r.company_name_en ?? r.company_name_th,
      director: Array.isArray(r.directors)
        ? ((r.directors[0] as { name_th?: string } | undefined)?.name_th ?? null)
        : null,
      registeredOn: r.registered_on,
      status: companyStatus(r, reading.get(r.id) ?? null),
      teamCode: null,
      learner: learner
        ? learner.managerId === teamId
          ? { id: learner.userId, code: displayLoginId(learner.loginId) }
          : 'other'
        : null,
      createdByMe: r.created_by === actorId,
      displayOnly: true,
    };
  });
}
