import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  clientFor,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

// Every table a learner may touch, and what they may do with it (spec §5).
const LEARNER_READ_OWN = ['profiles', 'user_dbd_assignments', 'eligibility_snapshots'] as const;
const ADMIN_ONLY = ['audit_logs', 'policy_config'] as const;

describe('learner isolation matrix', () => {
  let admin: TestUser;
  let a: TestUser;
  let b: TestUser;
  let asA: Client;
  let recordA: string;
  let recordB: string;

  beforeAll(async () => {
    [admin, a, b] = await Promise.all([
      createTestUser('admin'),
      createTestUser('learner'),
      createTestUser('learner'),
    ]);
    asA = await clientFor(a);
    const svc = adminClient();
    const mk = async (name: string) => {
      const { data } = await svc
        .from('dbd_records')
        .insert({
          company_name_th: name,
          juristic_id: '0105568233704',
          issued_on: '2026-07-13',
          extraction_status: 'confirmed',
          confirmed_by: admin.id,
          confirmed_at: new Date().toISOString(),
        })
        .select()
        .single();
      return data!.id as string;
    };
    [recordA, recordB] = await Promise.all([mk('A'), mk('B')]);
    await svc.from('user_dbd_assignments').insert([
      { user_id: a.id, dbd_record_id: recordA, assigned_by: admin.id },
      { user_id: b.id, dbd_record_id: recordB, assigned_by: admin.id },
    ]);
  });

  afterAll(async () => {
    const svc = adminClient();
    await svc.from('user_dbd_assignments').delete().in('dbd_record_id', [recordA, recordB]);
    await svc.from('eligibility_snapshots').delete().in('dbd_record_id', [recordA, recordB]);
    await svc.from('dbd_records').delete().in('id', [recordA, recordB]);
    await Promise.all([admin, a, b].map((u) => deleteTestUser(u.id)));
  });

  it.each(LEARNER_READ_OWN)('%s: learner A sees only rows that are their own', async (table) => {
    const column = table === 'profiles' ? 'id' : 'user_id';
    const { data, error } = await asA.from(table).select(column);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.every((row) => (row as Record<string, string>)[column] === a.id)).toBe(true);
  });

  it("dbd_records: learner A sees only the assigned record, never B's", async () => {
    const { data } = await asA.from('dbd_records').select('id');
    expect(data?.map((r) => r.id)).toEqual([recordA]);
    const { data: byId } = await asA.from('dbd_records').select('id').eq('id', recordB);
    expect(byId).toEqual([]);
  });

  it.each(ADMIN_ONLY)('%s: learner A reads nothing', async (table) => {
    const { data, error } = await asA.from(table).select('*');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('admin-only tables reject learner writes with an RLS error', async () => {
    const { error: auditInsert } = await asA
      .from('audit_logs')
      .insert({ action: 'isolation-test', entity_type: 'isolation-test' });
    expect(auditInsert?.code).toBe('42501');
    const { error: policyInsert } = await asA
      .from('policy_config')
      .insert({ key: 'isolation-test', value: 1 });
    expect(policyInsert?.code).toBe('42501');
  });

  it('learner A cannot modify their assignment, snapshots or record', async () => {
    const { data: updAssign } = await asA
      .from('user_dbd_assignments')
      .update({ active: false })
      .eq('user_id', a.id)
      .select();
    expect(updAssign).toEqual([]);
    const { data: updSnap } = await asA
      .from('eligibility_snapshots')
      .update({ available_from: '2000-01-01' })
      .eq('user_id', a.id)
      .select();
    expect(updSnap).toEqual([]);
    const { data: updRec } = await asA
      .from('dbd_records')
      .update({ issued_on: '2000-01-01' })
      .eq('id', recordA)
      .select();
    expect(updRec).toEqual([]);
    // Prove nothing changed under the covers.
    const { data: record } = await adminClient()
      .from('dbd_records')
      .select('issued_on')
      .eq('id', recordA)
      .single();
    expect(record?.issued_on).toBe('2026-07-13');
  });

  it('learner A cannot list or read the document bucket', async () => {
    const { data, error } = await asA.storage.from('dbd-documents').list();
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });
});
