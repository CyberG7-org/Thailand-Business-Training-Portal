import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  clientFor,
  createTestLearnerIn,
  createTestManager,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

const svc = adminClient();

async function ask(client: Client, fn: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(fn as 'is_manager', args as never);
  if (error) throw error;
  return data;
}

describe('the team helpers', () => {
  let admin: TestUser;
  let manager: TestUser;
  let learner: TestUser;
  let stranger: TestUser;
  let asAdmin: Client;
  let asManager: Client;
  let asLearner: Client;

  beforeAll(async () => {
    admin = await createTestUser('admin');
    manager = await createTestManager();
    learner = await createTestLearnerIn(manager);
    stranger = await createTestManager();
    [asAdmin, asManager, asLearner] = await Promise.all([
      clientFor(admin),
      clientFor(manager),
      clientFor(learner),
    ]);
  });

  afterAll(async () => {
    await Promise.all([admin, learner, manager, stranger].map((u) => deleteTestUser(u.id)));
  });

  it('answers who is asking', async () => {
    expect(await ask(asManager, 'is_manager')).toBe(true);
    expect(await ask(asAdmin, 'is_manager')).toBe(false);
    expect(await ask(asLearner, 'is_manager')).toBe(false);
    expect(await ask(asAdmin, 'is_staff')).toBe(true);
    expect(await ask(asManager, 'is_staff')).toBe(true);
    expect(await ask(asLearner, 'is_staff')).toBe(false);
  });

  it('reports the caller team', async () => {
    expect(await ask(asManager, 'my_team')).toBe(manager.id);
    expect(await ask(asLearner, 'my_team')).toBe(manager.id);
    expect(await ask(asAdmin, 'my_team')).toBeNull();
  });

  it('places accounts inside or outside the caller team', async () => {
    expect(await ask(asManager, 'in_my_team', { p_user: learner.id })).toBe(true);
    expect(await ask(asManager, 'in_my_team', { p_user: stranger.id })).toBe(false);
    expect(await ask(asAdmin, 'in_my_team', { p_user: stranger.id })).toBe(true);
  });

  it('falls shut for a suspended manager who still holds a session', async () => {
    await svc.from('profiles').update({ status: 'disabled' }).eq('id', manager.id);
    expect(await ask(asManager, 'is_manager')).toBe(false);
    expect(await ask(asManager, 'is_staff')).toBe(false);
    expect(await ask(asManager, 'my_team')).toBeNull();
    await svc.from('profiles').update({ status: 'active' }).eq('id', manager.id);
  });
});

describe('Submanager parent invariant', () => {
  let manager: TestUser;
  let sub: TestUser;
  let asSub: Client;
  beforeAll(async () => {
    manager = await createTestManager();
    sub = await createTestUser('submanager', { managerId: manager.id });
    asSub = await clientFor(sub);
  });
  afterAll(async () => {
    if (sub) await deleteTestUser(sub.id);
    if (manager) await deleteTestUser(manager.id);
  });
  it('synchronizes role and resolves the parent without broad staff privileges', async () => {
    const { data } = await svc
      .from('profiles')
      .select('role, manager_id')
      .eq('id', sub.id)
      .single();
    expect(data).toEqual({ role: 'submanager', manager_id: manager.id });
    expect(await ask(asSub, 'is_submanager')).toBe(true);
    expect(await ask(asSub, 'is_staff')).toBe(false);
    expect(await ask(asSub, 'my_team')).toBe(manager.id);
  });
  it('rejects missing or non-Manager parents and demotion of a parent', async () => {
    expect(
      (await svc.from('profiles').update({ manager_id: null }).eq('id', sub.id)).error,
    ).not.toBeNull();
    expect(
      (await svc.from('profiles').update({ manager_id: sub.id }).eq('id', sub.id)).error,
    ).not.toBeNull();
    expect(
      (await svc.from('profiles').update({ role: 'learner' }).eq('id', manager.id)).error,
    ).not.toBeNull();
  });
  it('syncs a trusted role change and parent together', async () => {
    const learner = await createTestUser('learner');
    try {
      const { error } = await svc.auth.admin.updateUserById(learner.id, {
        app_metadata: { role: 'submanager', manager_id: manager.id },
      });
      expect(error).toBeNull();
      const { data } = await svc
        .from('profiles')
        .select('role, manager_id')
        .eq('id', learner.id)
        .single();
      expect(data).toEqual({ role: 'submanager', manager_id: manager.id });
    } finally {
      await deleteTestUser(learner.id);
    }
  });
  it('revokes the team and Submanager guard when the parent is suspended', async () => {
    await svc.from('profiles').update({ status: 'disabled' }).eq('id', manager.id);
    try {
      expect(await ask(asSub, 'is_submanager')).toBe(false);
      expect(await ask(asSub, 'my_team')).toBeNull();
    } finally {
      await svc.from('profiles').update({ status: 'active' }).eq('id', manager.id);
    }
  });
});
