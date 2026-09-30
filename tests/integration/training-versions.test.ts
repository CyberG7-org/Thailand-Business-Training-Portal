import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assignDbdRecord } from '@/lib/db/assignments';
import {
  getActiveVersion,
  listVersions,
  readSnapshot,
  syncTrainingVersion,
} from '@/lib/db/training-versions';
import {
  adminClient,
  completeRecord,
  confirmRecord,
  deleteTeam,
  seedTeam,
  type Team,
} from './helpers';

const svc = adminClient();

async function assignment(userId: string) {
  const { data } = await svc
    .from('user_dbd_assignments')
    .select('training_version_id')
    .eq('user_id', userId)
    .eq('active', true)
    .single();
  return data!;
}

describe('syncTrainingVersion (spec §5.6, D75)', () => {
  let team: Team;
  beforeAll(async () => {
    team = await seedTeam('รุ่นข้อมูล');
  });
  afterAll(async () => {
    await svc.from('user_dbd_assignments').delete().eq('dbd_record_id', team.recordId);
    await svc.from('company_training_versions').delete().eq('dbd_record_id', team.recordId);
    await deleteTeam(team);
  });

  it('versions nothing before the record is confirmed', async () => {
    expect(await syncTrainingVersion(svc, team.recordId, null)).toBe('unconfirmed');
    expect(await listVersions(svc, team.recordId)).toEqual([]);
  });

  it('activates version 1 on confirmation, incomplete but usable, and pins the waiting learner', async () => {
    await assignDbdRecord(svc, { userId: team.learner.id, dbdRecordId: team.recordId }).catch(
      () => null,
    );
    await confirmRecord(team.recordId, team.manager.id);
    await assignDbdRecord(svc, { userId: team.learner.id, dbdRecordId: team.recordId });
    expect((await assignment(team.learner.id)).training_version_id).toBeNull();
    expect(await syncTrainingVersion(svc, team.recordId, team.manager.id)).toBe('activated');
    const v1 = await getActiveVersion(svc, team.recordId);
    expect(v1).toMatchObject({ version_no: 1, status: 'active', company_complete: false });
    expect((v1!.coverage as { missingFacts: string[] }).missingFacts).toContain('registered_on');
    expect(readSnapshot(v1!).facts.nature_of_business).toBe('ทดสอบระบบ');
    expect((await assignment(team.learner.id)).training_version_id).toBe(v1!.id);
  });

  it('does nothing when the sheet is unchanged', async () => {
    expect(await syncTrainingVersion(svc, team.recordId, null)).toBe('unchanged');
    expect(await listVersions(svc, team.recordId)).toHaveLength(1);
  });

  it('supersedes with version 2 when a fact changes, and leaves the learner on 1', async () => {
    await completeRecord(team.recordId);
    expect(await syncTrainingVersion(svc, team.recordId, null)).toBe('activated');
    const versions = await listVersions(svc, team.recordId);
    expect(versions.map((v) => [v.version_no, v.status])).toEqual([
      [2, 'active'],
      [1, 'superseded'],
    ]);
    expect(versions[0]).toMatchObject({ company_complete: true });
    expect(versions[1]!.superseded_at).not.toBeNull();
    expect((await assignment(team.learner.id)).training_version_id).toBe(versions[1]!.id);
  });

  it('keeps the frozen sheet when the record moves on again', async () => {
    const before = readSnapshot((await getActiveVersion(svc, team.recordId))!);
    await svc.from('dbd_records').update({ registered_capital: 3_000_000 }).eq('id', team.recordId);
    await syncTrainingVersion(svc, team.recordId, null);
    const versions = await listVersions(svc, team.recordId);
    expect(versions[0]!.version_no).toBe(3);
    expect(readSnapshot(versions[1]!).facts.registered_capital).toBe(
      before.facts.registered_capital,
    );
  });
});
