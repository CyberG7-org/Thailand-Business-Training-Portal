import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assignDbdRecord } from '@/lib/db/assignments';
import { deleteDbdRecord } from '@/lib/db/dbd-records';
import { deleteLearnerAccount } from '@/lib/db/provisioning';
import { FakeVectorStore } from '@/lib/integrations/vector/fake';
import {
  adminClient,
  confirmRecord,
  createTestManager,
  deleteTeam,
  deleteTestUser,
  seedTeam,
  type Team,
  type TestUser,
} from './helpers';

const svc = adminClient();

describe('manager deletion', () => {
  let companyTeam: Team;
  let learnerTeam: Team;
  let outsider: TestUser;

  beforeAll(async () => {
    companyTeam = await seedTeam('ลบบริษัท');
    await confirmRecord(companyTeam.recordId, companyTeam.manager.id);
    await assignDbdRecord(companyTeam.asManager, {
      userId: companyTeam.learner.id,
      dbdRecordId: companyTeam.recordId,
    });

    learnerTeam = await seedTeam('ลบผู้เรียน');
    await confirmRecord(learnerTeam.recordId, learnerTeam.manager.id);
    await assignDbdRecord(learnerTeam.asManager, {
      userId: learnerTeam.learner.id,
      dbdRecordId: learnerTeam.recordId,
    });
    outsider = await createTestManager({ displayName: 'ทีมอื่น' });
  });

  afterAll(async () => {
    await deleteTeam(companyTeam);
    await deleteTeam(learnerTeam);
    await deleteTestUser(outsider.id);
  });

  it('deletes an owned DBD and its assignment while preserving the learner', async () => {
    await deleteDbdRecord(
      companyTeam.asManager,
      companyTeam.recordId,
      new FakeVectorStore(async () => []),
    );

    const [{ data: record }, { data: assignment }, { data: learner }, files] = await Promise.all([
      svc.from('dbd_records').select('id').eq('id', companyTeam.recordId).maybeSingle(),
      svc.from('user_dbd_assignments').select('id').eq('dbd_record_id', companyTeam.recordId),
      svc.from('profiles').select('id').eq('id', companyTeam.learner.id).maybeSingle(),
      svc.storage.from('dbd-documents').list(companyTeam.recordId),
    ]);
    expect(record).toBeNull();
    expect(assignment).toEqual([]);
    expect(learner?.id).toBe(companyTeam.learner.id);
    expect(files.data).toEqual([]);
  });

  it('lets only the owning manager delete a learner and leaves the company assignable', async () => {
    await expect(deleteLearnerAccount(outsider.id, learnerTeam.learner.id)).rejects.toThrow(
      'Learner not found',
    );
    await deleteLearnerAccount(learnerTeam.manager.id, learnerTeam.learner.id);

    const [{ data: learner }, { data: record }, { data: assignments }] = await Promise.all([
      svc.from('profiles').select('id').eq('id', learnerTeam.learner.id).maybeSingle(),
      svc.from('dbd_records').select('id').eq('id', learnerTeam.recordId).maybeSingle(),
      svc.from('user_dbd_assignments').select('id').eq('dbd_record_id', learnerTeam.recordId),
    ]);
    expect(learner).toBeNull();
    expect(record?.id).toBe(learnerTeam.recordId);
    expect(assignments).toEqual([]);
  });
});
