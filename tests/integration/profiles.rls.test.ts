import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  clientFor,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

describe('profiles RLS', () => {
  let learnerA: TestUser;
  let learnerB: TestUser;
  let admin: TestUser;
  let asA: Client;
  let asAdmin: Client;

  beforeAll(async () => {
    [learnerA, learnerB, admin] = await Promise.all([
      createTestUser('learner'),
      createTestUser('learner'),
      createTestUser('admin'),
    ]);
    asA = await clientFor(learnerA);
    asAdmin = await clientFor(admin);
  });

  afterAll(async () => {
    await Promise.all([learnerA, learnerB, admin].map((u) => deleteTestUser(u.id)));
  });

  it('creates a profile from the auth metadata', async () => {
    const { data } = await adminClient()
      .from('profiles')
      .select('*')
      .eq('id', learnerA.id)
      .single();
    expect(data).toMatchObject({
      login_id: learnerA.loginId,
      role: 'learner',
      preferred_language: 'th',
    });
  });

  it('lets a learner read only their own profile', async () => {
    const { data } = await asA.from('profiles').select('id');
    expect(data?.map((r) => r.id)).toEqual([learnerA.id]);
  });

  it("hides another learner's profile even when queried by id", async () => {
    const { data } = await asA.from('profiles').select('id').eq('id', learnerB.id);
    expect(data).toEqual([]);
  });

  it('prevents a learner from escalating their own role', async () => {
    const { data } = await asA
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', learnerA.id)
      .select();
    expect(data).toEqual([]);
    const { data: after } = await adminClient()
      .from('profiles')
      .select('role')
      .eq('id', learnerA.id)
      .single();
    expect(after?.role).toBe('learner');
  });

  it('lets an admin read every profile', async () => {
    const { data } = await asAdmin
      .from('profiles')
      .select('id')
      .in('id', [learnerA.id, learnerB.id]);
    expect(data).toHaveLength(2);
  });
});
