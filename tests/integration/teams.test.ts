import { afterAll, describe, expect, it } from 'vitest';
import { adminClient, createTestUser, deleteTestUser } from './helpers';

describe('the manager role', () => {
  const created: string[] = [];
  afterAll(async () => {
    await Promise.all(created.map((id) => deleteTestUser(id)));
  });

  it('creates a profile with role manager from app metadata', async () => {
    const manager = await createTestUser('manager');
    created.push(manager.id);
    const { data } = await adminClient()
      .from('profiles')
      .select('role, status')
      .eq('id', manager.id)
      .single();
    expect(data).toMatchObject({ role: 'manager', status: 'active' });
  });

  it('syncs a role change to manager through app metadata', async () => {
    const user = await createTestUser('learner');
    created.push(user.id);
    await adminClient().auth.admin.updateUserById(user.id, { app_metadata: { role: 'manager' } });
    const { data } = await adminClient().from('profiles').select('role').eq('id', user.id).single();
    expect(data?.role).toBe('manager');
  });
});
