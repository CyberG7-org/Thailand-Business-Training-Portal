import { afterAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  createTestLearnerIn,
  createTestManager,
  createTestUser,
  deleteTestUser,
} from './helpers';

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

describe('team membership', () => {
  const created: string[] = [];
  afterAll(async () => {
    await Promise.all(created.map((id) => deleteTestUser(id)));
  });

  it('puts a learner in a manager team and rejects a manager carrying one', async () => {
    const manager = await createTestManager();
    const learner = await createTestLearnerIn(manager);
    created.push(learner.id, manager.id);
    const { data } = await adminClient()
      .from('profiles')
      .select('manager_id')
      .eq('id', learner.id)
      .single();
    expect(data?.manager_id).toBe(manager.id);

    const other = await createTestManager();
    created.push(other.id);
    const { error } = await adminClient()
      .from('profiles')
      .update({ manager_id: other.id })
      .eq('id', manager.id);
    expect(error).not.toBeNull();
  });

  it('refuses a learner parented to someone who is not a manager', async () => {
    const admin = await createTestUser('admin');
    const learner = await createTestUser('learner');
    created.push(admin.id, learner.id);
    const { error } = await adminClient()
      .from('profiles')
      .update({ manager_id: admin.id })
      .eq('id', learner.id);
    expect(error).not.toBeNull();
  });
});
