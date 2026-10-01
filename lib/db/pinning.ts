import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LearnerRole } from '@/lib/domain/bank-interview';
import {
  buildRoleSnapshot,
  type RoleSnapshot,
  type TrainingSnapshot,
} from '@/lib/domain/facts/snapshot';
import type { ActiveAssignment, AssignmentRow } from './assignments';
import type { Database, Json } from './database.types';
import {
  getVersion,
  readSnapshot,
  syncTrainingVersion,
  type TrainingVersionRow,
} from './training-versions';

type Db = SupabaseClient<Database>;

export type PinErrorCode =
  | 'not_found'
  | 'no_version'
  | 'not_active'
  | 'other_record'
  | 'evaluation_in_progress'
  | 'role_missing';

export class PinError extends Error {
  constructor(public readonly code: PinErrorCode) {
    super(code);
    this.name = 'PinError';
  }
}

export type InProgress = 'quiz' | 'exam' | 'interview' | null;

/** A quiz or exam attempt, or a D64 interview session, that the learner has not finished. */
export async function evaluationInProgress(db: Db, userId: string): Promise<InProgress> {
  const attempt = await db
    .from('assessment_attempts')
    .select('kind')
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .limit(1)
    .maybeSingle();
  if (attempt.error) throw attempt.error;
  if (attempt.data) return attempt.data.kind as 'quiz' | 'exam';
  const session = await db
    .from('interview_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .limit(1)
    .maybeSingle();
  if (session.error) throw session.error;
  return session.data ? 'interview' : null;
}

export function roleOf(a: Pick<AssignmentRow, keyof LearnerRole>): LearnerRole {
  return {
    holder_name: a.holder_name,
    position: a.position,
    responsibilities: a.responsibilities,
    relationship_to_shareholders: a.relationship_to_shareholders,
  };
}

async function activeAssignment(db: Db, assignmentId: string): Promise<AssignmentRow> {
  const { data, error } = await db
    .from('user_dbd_assignments')
    .select('*')
    .eq('id', assignmentId)
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new PinError('not_found');
  return data;
}

/**
 * Freezes the role as typed, with the shareholding derived against the pinned sheet (plan
 * decision 4). Written under the caller's own client so the assignments audit names them.
 */
export async function confirmAssignmentRole(
  db: Db,
  args: { assignmentId: string; actorId: string; now?: Date },
): Promise<RoleSnapshot> {
  const a = await activeAssignment(db, args.assignmentId);
  if (!a.training_version_id) throw new PinError('no_version');
  if (!a.holder_name?.trim()) throw new PinError('role_missing');
  const version = await getVersion(db, a.training_version_id);
  if (!version) throw new PinError('no_version');
  const snapshot = buildRoleSnapshot(roleOf(a), readSnapshot(version));
  const { error } = await db
    .from('user_dbd_assignments')
    .update({
      role_snapshot: snapshot as unknown as Json,
      role_confirmed_at: (args.now ?? new Date()).toISOString(),
      role_confirmed_by: args.actorId,
    })
    .eq('id', a.id);
  if (error) throw error;
  return snapshot;
}

/**
 * "Move to version n" (D75): only to the record's active version, never while an evaluation is
 * in progress; a confirmed role stays confirmed, its shareholding re-derived. The caller's own
 * client writes, so the audit trigger records who moved the learner.
 */
export async function moveAssignmentToVersion(
  db: Db,
  args: { assignmentId: string; versionId: string },
): Promise<{ from: number | null; to: number; moved: boolean }> {
  const a = await activeAssignment(db, args.assignmentId);
  const target = await getVersion(db, args.versionId);
  if (!target) throw new PinError('not_found');
  if (target.dbd_record_id !== a.dbd_record_id) throw new PinError('other_record');
  if (target.status !== 'active') throw new PinError('not_active');
  if (a.training_version_id === target.id) {
    return { from: target.version_no, to: target.version_no, moved: false };
  }
  const busy = await evaluationInProgress(db, a.user_id);
  if (busy) throw new PinError('evaluation_in_progress');
  const current = a.training_version_id ? await getVersion(db, a.training_version_id) : null;
  const role = a.role_snapshot ? buildRoleSnapshot(roleOf(a), readSnapshot(target)) : null;
  const { error } = await db
    .from('user_dbd_assignments')
    .update({
      training_version_id: target.id,
      role_snapshot: role as unknown as Json,
    })
    .eq('id', a.id);
  if (error) throw error;
  return { from: current?.version_no ?? null, to: target.version_no, moved: true };
}

export type PinnedFacts = {
  version: TrainingVersionRow;
  snapshot: TrainingSnapshot;
  /** The confirmed role, or — until confirmation — the role as typed (plan decision 4). */
  role: RoleSnapshot | null;
  roleConfirmed: boolean;
};

/**
 * What an assignment is studied and evaluated on. An assignment without a version (from before
 * P17b, or assigned before its record had one) is pinned to the record's first version here,
 * made now if the record is confirmed (plan decision 2). `admin` is the service role.
 */
export async function pinnedFactsFor(
  admin: Db,
  assignment: ActiveAssignment,
): Promise<PinnedFacts | null> {
  let row: AssignmentRow = assignment;
  if (!row.training_version_id) {
    await syncTrainingVersion(admin, assignment.dbd_record_id, null);
    const { data, error } = await admin
      .from('user_dbd_assignments')
      .select('*')
      .eq('id', assignment.id)
      .maybeSingle();
    if (error) throw error;
    if (!data?.training_version_id) return null;
    row = data;
  }
  const version = await getVersion(admin, row.training_version_id!);
  if (!version) return null;
  const snapshot = readSnapshot(version);
  const confirmed = (row.role_snapshot as RoleSnapshot | null) ?? null;
  return {
    version,
    snapshot,
    role: confirmed ?? buildRoleSnapshot(roleOf(row), snapshot),
    roleConfirmed: confirmed !== null,
  };
}
