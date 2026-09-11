import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assignDbdRecord,
  deactivateAssignment,
  getActiveAssignmentForUser,
  getLatestEligibility,
  listConfirmedDbdRecords,
} from '@/lib/db/assignments';
import {
  adminClient,
  clientFor,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

describe('lib/db/assignments', () => {
  let admin: TestUser;
  let learner: TestUser;
  let asAdmin: Client;
  let recordId: string;

  beforeAll(async () => {
    [admin, learner] = await Promise.all([createTestUser('admin'), createTestUser('learner')]);
    asAdmin = await clientFor(admin);
    const { data } = await asAdmin
      .from('dbd_records')
      .insert({
        company_name_th: 'บริษัท มอบหมาย จำกัด',
        juristic_id: '0105568233704',
        issued_on: '2026-07-13',
      })
      .select()
      .single();
    recordId = data!.id;
    await asAdmin
      .from('dbd_records')
      .update({
        extraction_status: 'confirmed',
        confirmed_by: admin.id,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', recordId);
  });

  afterAll(async () => {
    const svc = adminClient();
    await svc.from('user_dbd_assignments').delete().eq('dbd_record_id', recordId);
    await svc.from('eligibility_snapshots').delete().eq('dbd_record_id', recordId);
    await svc.from('dbd_records').delete().eq('id', recordId);
    await Promise.all([admin, learner].map((u) => deleteTestUser(u.id)));
  });

  it('lists confirmed records only', async () => {
    const rows = await listConfirmedDbdRecords(asAdmin);
    expect(rows.some((r) => r.id === recordId)).toBe(true);
  });

  it('assigns, reads back the joined record and the latest eligibility, then deactivates', async () => {
    expect(await getActiveAssignmentForUser(asAdmin, learner.id)).toBeNull();

    const assignment = await assignDbdRecord(asAdmin, {
      userId: learner.id,
      dbdRecordId: recordId,
    });
    const active = await getActiveAssignmentForUser(asAdmin, learner.id);
    expect(active?.id).toBe(assignment.id);
    expect(active?.dbd_records.company_name_th).toBe('บริษัท มอบหมาย จำกัด');

    const eligibility = await getLatestEligibility(asAdmin, learner.id, recordId);
    expect(eligibility?.available_from).toBe('2026-08-27');

    await deactivateAssignment(asAdmin, assignment.id);
    expect(await getActiveAssignmentForUser(asAdmin, learner.id)).toBeNull();
  });
});
