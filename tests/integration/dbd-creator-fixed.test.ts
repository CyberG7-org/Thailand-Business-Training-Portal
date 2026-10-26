import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, clientFor, createTestUser, deleteTestUser, type TestUser } from './helpers';

/** A Submanager assigns only records they created, so a Manager cannot rewrite the creator. */
describe('dbd_records.created_by is fixed once created', () => {
  const svc = adminClient();
  let manager: TestUser, sub: TestUser;
  let recordId: string;
  beforeAll(async () => {
    manager = await createTestUser('manager');
    sub = await createTestUser('submanager', { managerId: manager.id });
    const { data, error } = await svc
      .from('dbd_records')
      .insert({ company_name_th: 'Creator company', team_id: manager.id, created_by: sub.id })
      .select('id')
      .single();
    if (error) throw error;
    recordId = data.id;
  });
  afterAll(async () => {
    await svc.from('dbd_records').delete().eq('id', recordId);
    for (const u of [sub, manager]) await deleteTestUser(u.id);
  });

  it('refuses a signed-in Manager and keeps the Submanager as creator', async () => {
    const { error } = await (
      await clientFor(manager)
    )
      .from('dbd_records')
      .update({ created_by: manager.id })
      .eq('id', recordId);
    expect(error?.message).toMatch(/creator cannot be changed/);
    const { data } = await svc.from('dbd_records').select('created_by').eq('id', recordId).single();
    expect(data?.created_by).toBe(sub.id);
  });

  it('still lets the Manager edit the record', async () => {
    const { error } = await (
      await clientFor(manager)
    )
      .from('dbd_records')
      .update({ company_name_en: 'Edited by Manager' })
      .eq('id', recordId);
    expect(error).toBeNull();
  });
});
