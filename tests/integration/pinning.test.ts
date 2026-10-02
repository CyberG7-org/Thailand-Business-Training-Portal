import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assignDbdRecord,
  getActiveAssignmentForUser,
  updateAssignmentRole,
} from '@/lib/db/assignments';
import {
  PinError,
  confirmAssignmentRole,
  evaluationInProgress,
  moveAssignmentToVersion,
  pinnedFactsFor,
} from '@/lib/db/pinning';
import { getActiveVersion, listVersions, syncTrainingVersion } from '@/lib/db/training-versions';
import {
  adminClient,
  completeRecord,
  confirmRecord,
  deleteTeam,
  seedTeam,
  type Team,
} from './helpers';

const svc = adminClient();
const ROLE = {
  holder_name: 'นางสาวกุลธิดา พลเยี่ยม',
  position: 'กรรมการ',
  responsibilities: 'ดูแลลูกค้า',
  relationship_to_shareholders: null,
};

describe('pinning (spec §5.6, D75)', () => {
  let team: Team;
  let assignmentId: string;
  let attemptId: string;
  beforeAll(async () => {
    team = await seedTeam('ตรึงรุ่น');
    await confirmRecord(team.recordId, team.manager.id);
    await completeRecord(team.recordId);
  });
  afterAll(async () => {
    await svc.from('assessment_attempts').delete().eq('user_id', team.learner.id);
    await svc.from('user_dbd_assignments').delete().eq('dbd_record_id', team.recordId);
    await svc.from('company_training_versions').delete().eq('dbd_record_id', team.recordId);
    await deleteTeam(team);
  });

  it('assigning pins the active version; a first read makes one when none exists yet', async () => {
    const a = await assignDbdRecord(team.asManager, {
      userId: team.learner.id,
      dbdRecordId: team.recordId,
    });
    assignmentId = a.id;
    expect(a.training_version_id).toBeNull();
    const active = (await getActiveAssignmentForUser(svc, team.learner.id))!;
    const pinned = await pinnedFactsFor(svc, active);
    expect(pinned?.version.version_no).toBe(1);
    expect(pinned?.roleConfirmed).toBe(false);
    expect(pinned?.snapshot.facts.company_name_th).toBe('บริษัท ครบถ้วน จำกัด');
    const { data } = await svc
      .from('user_dbd_assignments')
      .select('training_version_id')
      .eq('id', assignmentId)
      .single();
    expect(data!.training_version_id).toBe(pinned!.version.id);
  });

  it('confirms the role against the pinned sheet, and a later edit unconfirms it', async () => {
    await updateAssignmentRole(team.asManager, assignmentId, ROLE);
    const snapshot = await confirmAssignmentRole(team.asManager, {
      assignmentId,
      actorId: team.manager.id,
    });
    expect(snapshot).toMatchObject({
      holder_name: ROLE.holder_name,
      learner_is_shareholder: true,
      my_shares: 18000,
      my_share_percent: 90,
    });
    const active = (await getActiveAssignmentForUser(svc, team.learner.id))!;
    expect(active.role_confirmed_by).toBe(team.manager.id);
    expect((await pinnedFactsFor(svc, active))?.roleConfirmed).toBe(true);
    await updateAssignmentRole(team.asManager, assignmentId, { ...ROLE, position: 'ผู้จัดการ' });
    const edited = (await getActiveAssignmentForUser(svc, team.learner.id))!;
    expect(edited.role_snapshot).toBeNull();
    expect(edited.role_confirmed_at).toBeNull();
    await confirmAssignmentRole(team.asManager, { assignmentId, actorId: team.manager.id });
  });

  it('confirms the only director when nobody picked a name, with the fixed answers (D94)', async () => {
    await updateAssignmentRole(team.asManager, assignmentId, { ...ROLE, holder_name: null });
    const snapshot = await confirmAssignmentRole(team.asManager, {
      assignmentId,
      actorId: team.manager.id,
    });
    expect(snapshot).toMatchObject({
      holder_name: ROLE.holder_name,
      position: 'กรรมการ',
      responsibilities: 'ดูแลการดำเนินงานของบริษัท',
      relationship_to_shareholders: 'เพื่อน',
      my_shares: 18000,
    });
    await updateAssignmentRole(team.asManager, assignmentId, ROLE);
    await confirmAssignmentRole(team.asManager, { assignmentId, actorId: team.manager.id });
  });

  it('moves only to the active version, never while an evaluation is in progress', async () => {
    await svc.from('dbd_records').update({ registered_capital: 5_000_000 }).eq('id', team.recordId);
    await syncTrainingVersion(svc, team.recordId, null);
    const [v2, v1] = await listVersions(svc, team.recordId);
    expect(v2!.version_no).toBe(2);
    const { data: attempt } = await svc
      .from('assessment_attempts')
      .insert({
        user_id: team.learner.id,
        dbd_record_id: team.recordId,
        kind: 'quiz',
        language: 'th',
        attempt_no: 1,
        question_ids: [],
        shuffle_seed: 'pin',
        status: 'in_progress',
      })
      .select('id')
      .single();
    attemptId = attempt!.id;
    expect(await evaluationInProgress(team.asManager, team.learner.id)).toBe('quiz');
    await expect(
      moveAssignmentToVersion(team.asManager, { assignmentId, versionId: v2!.id }),
    ).rejects.toMatchObject({ code: 'evaluation_in_progress' });
    await svc.from('assessment_attempts').update({ status: 'submitted' }).eq('id', attemptId);
    expect(await evaluationInProgress(team.asManager, team.learner.id)).toBeNull();
    await expect(
      moveAssignmentToVersion(team.asManager, { assignmentId, versionId: v1!.id }),
    ).rejects.toMatchObject({ code: 'not_active' });
    const moved = await moveAssignmentToVersion(team.asManager, {
      assignmentId,
      versionId: v2!.id,
    });
    expect(moved).toEqual({ from: 1, to: 2, moved: true });
    const active = (await getActiveAssignmentForUser(svc, team.learner.id))!;
    expect(active.training_version_id).toBe(v2!.id);
    // The confirmation survived the move; the shareholding was derived against the new sheet.
    expect(active.role_confirmed_at).not.toBeNull();
    expect(active.role_snapshot).toMatchObject({ learner_is_shareholder: true, my_shares: 18000 });
    expect(
      await moveAssignmentToVersion(team.asManager, { assignmentId, versionId: v2!.id }),
    ).toEqual({ from: 2, to: 2, moved: false });
    expect(await getActiveVersion(svc, team.recordId)).toMatchObject({ id: v2!.id });
    expect(new PinError('not_found').code).toBe('not_found');
  });

  it('pins a late assignment to the active version even while a newer sheet waits on exceptions', async () => {
    const { validateRecord } = await import('@/lib/db/validation');
    const { getActiveVersion: activeOf } = await import('@/lib/db/training-versions');
    await svc.from('user_dbd_assignments').delete().eq('dbd_record_id', team.recordId);
    await svc.from('dbd_records').update({ registered_capital: 1_500_000 }).eq('id', team.recordId);
    await validateRecord(svc, team.recordId, null); // conflict: the new sheet is a draft
    const { data: inserted } = await svc
      .from('user_dbd_assignments')
      .insert({ user_id: team.learner.id, dbd_record_id: team.recordId })
      .select('training_version_id')
      .single();
    expect(inserted!.training_version_id).toBeNull();
    const active = (await getActiveAssignmentForUser(svc, team.learner.id))!;
    const pinned = await pinnedFactsFor(svc, active);
    expect(pinned?.version.id).toBe((await activeOf(svc, team.recordId))!.id);
    await svc.from('dbd_records').update({ registered_capital: 5_000_000 }).eq('id', team.recordId);
  });
});
