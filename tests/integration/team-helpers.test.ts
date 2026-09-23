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
