import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  clientFor,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

describe('set_my_preferred_language', () => {
  let learnerA: TestUser;
  let learnerB: TestUser;
  let asA: Client;

  beforeAll(async () => {
    [learnerA, learnerB] = await Promise.all([
      createTestUser('learner'),
      createTestUser('learner'),
    ]);
    asA = await clientFor(learnerA);
  });

  afterAll(async () => {
    await Promise.all([learnerA, learnerB].map((u) => deleteTestUser(u.id)));
  });

  it('updates only the caller’s own row', async () => {
    const { error } = await asA.rpc('set_my_preferred_language', { p_lang: 'en' });
    expect(error).toBeNull();
    const { data } = await adminClient()
      .from('profiles')
      .select('id, preferred_language')
      .in('id', [learnerA.id, learnerB.id]);
    const byId = Object.fromEntries((data ?? []).map((r) => [r.id, r.preferred_language]));
    expect(byId[learnerA.id]).toBe('en');
    expect(byId[learnerB.id]).toBe('th');
  });

  it('rejects unsupported languages', async () => {
    const { error } = await asA.rpc('set_my_preferred_language', { p_lang: 'fr' });
    expect(error?.code).toBe('23514');
  });

  it('still forbids direct profile updates by learners', async () => {
    const { data } = await asA
      .from('profiles')
      .update({ preferred_language: 'zh' })
      .eq('id', learnerA.id)
      .select();
    expect(data).toEqual([]);
  });
});
