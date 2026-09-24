import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { updateAssignmentRole } from '@/lib/db/assignments';
import {
  CONFIRMED_ANSWERS,
  adminClient,
  clientFor,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

async function createRecord(
  asAdmin: Client,
  adminId: string,
  fields: Record<string, unknown>,
  confirm = true,
) {
  const { data, error } = await asAdmin
    .from('dbd_records')
    .insert({ company_name_th: 'บริษัท ทดสอบ จำกัด', juristic_id: '0105568233704', ...fields })
    .select()
    .single();
  if (error) throw error;
  if (confirm) {
    const { error: e } = await asAdmin
      .from('dbd_records')
      .update({
        structured_data: CONFIRMED_ANSWERS as never,
        extraction_status: 'confirmed',
        confirmed_by: adminId,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', data.id);
    if (e) throw e;
  }
  return data.id as string;
}

describe('assignments and eligibility snapshots', () => {
  let admin: TestUser;
  let learnerA: TestUser;
  let learnerB: TestUser;
  let asAdmin: Client;
  let asA: Client;
  let asB: Client;
  const recordIds: string[] = [];

  beforeAll(async () => {
    [admin, learnerA, learnerB] = await Promise.all([
      createTestUser('admin'),
      createTestUser('learner'),
      createTestUser('learner'),
    ]);
    [asAdmin, asA, asB] = await Promise.all([
      clientFor(admin),
      clientFor(learnerA),
      clientFor(learnerB),
    ]);
  });

  afterAll(async () => {
    const svc = adminClient();
    await svc.from('user_dbd_assignments').delete().in('dbd_record_id', recordIds);
    await svc.from('eligibility_snapshots').delete().in('dbd_record_id', recordIds);
    await svc.from('dbd_records').delete().in('id', recordIds);
    await Promise.all([admin, learnerA, learnerB].map((u) => deleteTestUser(u.id)));
  });

  it('refuses to assign an unconfirmed record', async () => {
    const id = await createRecord(asAdmin, admin.id, { issued_on: '2026-09-11' }, false);
    recordIds.push(id);
    const { error } = await asAdmin
      .from('user_dbd_assignments')
      .insert({ user_id: learnerA.id, dbd_record_id: id });
    expect(error?.code).toBe(CHECK_VIOLATION);
  });

  it('assigns a confirmed record, records assigned_by, and snapshots issued_on + 45 days (AC-001)', async () => {
    const id = await createRecord(asAdmin, admin.id, { issued_on: '2026-09-11' });
    recordIds.push(id);
    const { data: assignment, error } = await asAdmin
      .from('user_dbd_assignments')
      .insert({ user_id: learnerA.id, dbd_record_id: id })
      .select()
      .single();
    expect(error).toBeNull();
    expect(assignment?.assigned_by).toBe(admin.id);

    const { data: snapshots } = await asAdmin
      .from('eligibility_snapshots')
      .select('issued_on_snapshot, available_from, expires_at, reason')
      .eq('user_id', learnerA.id)
      .eq('dbd_record_id', id);
    expect(snapshots).toEqual([
      {
        issued_on_snapshot: '2026-09-11',
        available_from: '2026-10-26',
        expires_at: null,
        reason: 'assignment',
      },
    ]);
  });

  it('allows only one active assignment per learner', async () => {
    const id = await createRecord(asAdmin, admin.id, { issued_on: '2026-09-11' });
    recordIds.push(id);
    const { error } = await asAdmin
      .from('user_dbd_assignments')
      .insert({ user_id: learnerA.id, dbd_record_id: id });
    expect(error?.code).toBe(UNIQUE_VIOLATION);
  });

  it('stores the learner role on the assignment; only admins write it, the learner reads it (P13)', async () => {
    const { data: active } = await asAdmin
      .from('user_dbd_assignments')
      .select('id')
      .eq('user_id', learnerA.id)
      .eq('active', true)
      .single();
    const role = {
      holder_name: 'นางสาวผู้เรียน ทดสอบ',
      position: 'กรรมการผู้จัดการ',
      responsibilities: 'ดูแลลูกค้าและอนุมัติการชำระเงิน',
      relationship_to_shareholders: null,
    };
    await updateAssignmentRole(asAdmin, active!.id, role);

    const { data: mine } = await asA
      .from('user_dbd_assignments')
      .select('holder_name, position, responsibilities, relationship_to_shareholders')
      .eq('id', active!.id)
      .single();
    expect(mine).toEqual(role);

    // RLS: a learner's update matches no rows, so nothing changes.
    await asA.from('user_dbd_assignments').update({ position: 'เจ้าของ' }).eq('id', active!.id);
    const { data: after } = await asAdmin
      .from('user_dbd_assignments')
      .select('position')
      .eq('id', active!.id)
      .single();
    expect(after?.position).toBe('กรรมการผู้จัดการ');
  });

  it('re-snapshots every active assignment when issued_on changes, keeping history', async () => {
    const { data: active } = await asAdmin
      .from('user_dbd_assignments')
      .select('dbd_record_id')
      .eq('user_id', learnerA.id)
      .eq('active', true)
      .single();
    const recordId = active!.dbd_record_id;

    const { error } = await asAdmin
      .from('dbd_records')
      .update({ issued_on: '2026-09-12' })
      .eq('id', recordId);
    expect(error).toBeNull();

    const { data: snapshots } = await asAdmin
      .from('eligibility_snapshots')
      .select('available_from, reason')
      .eq('user_id', learnerA.id)
      .eq('dbd_record_id', recordId)
      .order('calculated_at', { ascending: true });
    expect(snapshots).toEqual([
      { available_from: '2026-10-26', reason: 'assignment' },
      { available_from: '2026-10-27', reason: 'issue_date_changed' },
    ]);
  });

  it('creates no snapshot when issued_on is missing', async () => {
    const id = await createRecord(asAdmin, admin.id, { issued_on: null });
    recordIds.push(id);
    const { error } = await asAdmin
      .from('user_dbd_assignments')
      .insert({ user_id: learnerB.id, dbd_record_id: id });
    expect(error).toBeNull();
    const { data } = await asAdmin
      .from('eligibility_snapshots')
      .select('id')
      .eq('user_id', learnerB.id);
    expect(data).toEqual([]);
  });

  it('lets learners read only their own assignment, record and snapshots', async () => {
    const { data: aRecords } = await asA.from('dbd_records').select('id');
    const { data: aAssignments } = await asA.from('user_dbd_assignments').select('user_id');
    const { data: aSnapshots } = await asA.from('eligibility_snapshots').select('user_id');
    expect(aRecords).toHaveLength(1);
    expect(aAssignments?.every((r) => r.user_id === learnerA.id)).toBe(true);
    expect(aSnapshots?.length).toBeGreaterThan(0);
    expect(aSnapshots?.every((r) => r.user_id === learnerA.id)).toBe(true);

    const { data: bRecords } = await asB.from('dbd_records').select('id');
    expect(bRecords).toHaveLength(1);
    expect(bRecords![0].id).not.toBe(aRecords![0].id);

    const { error: insertDenied } = await asA
      .from('user_dbd_assignments')
      .insert({ user_id: learnerA.id, dbd_record_id: aRecords![0].id });
    expect(insertDenied).not.toBeNull();
  });

  it('deactivating an assignment frees the learner for a new one', async () => {
    const { data: active } = await asAdmin
      .from('user_dbd_assignments')
      .select('id')
      .eq('user_id', learnerA.id)
      .eq('active', true)
      .single();
    const { error } = await asAdmin
      .from('user_dbd_assignments')
      .update({ active: false, deactivated_at: new Date().toISOString() })
      .eq('id', active!.id);
    expect(error).toBeNull();

    const id = await createRecord(asAdmin, admin.id, { issued_on: '2026-10-01' });
    recordIds.push(id);
    const { error: reassign } = await asAdmin
      .from('user_dbd_assignments')
      .insert({ user_id: learnerA.id, dbd_record_id: id });
    expect(reassign).toBeNull();
  });
});
