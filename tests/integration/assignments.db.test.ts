import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assignDbdRecord,
  deactivateAssignment,
  getActiveAssignmentForUser,
  getLatestEligibility,
  learnersOfRecords,
  listConfirmedDbdRecords,
} from '@/lib/db/assignments';
import {
  CONFIRMED_ANSWERS,
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
        structured_data: CONFIRMED_ANSWERS as never,
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

/** D93: a company has one learner; the list of companies reads who it is. */
describe('learnersOfRecords', () => {
  let admin: TestUser;
  let first: TestUser;
  let second: TestUser;
  let asAdmin: Client;
  let recordId: string;

  beforeAll(async () => {
    [admin, first, second] = await Promise.all([
      createTestUser('admin'),
      createTestUser('learner'),
      createTestUser('learner'),
    ]);
    asAdmin = await clientFor(admin);
    const { data } = await asAdmin
      .from('dbd_records')
      .insert({
        company_name_th: 'บริษัท หนึ่งต่อหนึ่ง จำกัด',
        juristic_id: '0105568233704',
        issued_on: '2026-07-13',
        structured_data: CONFIRMED_ANSWERS as never,
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
    await Promise.all([admin, first, second].map((u) => deleteTestUser(u.id)));
  });

  it('names the learner a company has now, the first of two given before D93, none once gone', async () => {
    const svc = adminClient();
    expect((await learnersOfRecords(svc, [recordId])).size).toBe(0);

    const kept = await assignDbdRecord(asAdmin, { userId: first.id, dbdRecordId: recordId });
    await assignDbdRecord(asAdmin, { userId: second.id, dbdRecordId: recordId });
    // Hundreds of other ids are asked in slices, and the answer is the same.
    const others = Array.from({ length: 250 }, () => randomUUID());
    const learners = await learnersOfRecords(svc, [...others, recordId]);
    expect(learners.size).toBe(1);
    expect(learners.get(recordId)).toEqual({
      userId: first.id,
      loginId: first.loginId,
      managerId: null,
    });

    await deactivateAssignment(asAdmin, kept.id);
    expect((await learnersOfRecords(svc, [recordId])).get(recordId)?.userId).toBe(second.id);
  });
});
