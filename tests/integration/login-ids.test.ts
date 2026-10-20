import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  clientFor,
  createTestLearnerIn,
  createTestManager,
  createTestUser,
  deleteTestUser,
} from './helpers';

const svc = adminClient();

async function loginIdOf(id: string): Promise<string> {
  const { data, error } = await svc.from('profiles').select('login_id').eq('id', id).single();
  if (error) throw error;
  return data.login_id;
}

/**
 * A code is chosen once, at creation, by the server that composes its prefix. A manager's own
 * session may edit their learners' rows, but never the code.
 */
describe('a login id is fixed once created', () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created.reverse()) await deleteTestUser(id);
  });

  it("refuses a manager rewriting their learner's code, and still lets them rename them", async () => {
    const manager = await createTestManager({ loginId: `t-${randomUUID().slice(0, 6)}` });
    const learner = await createTestLearnerIn(manager, { loginId: `${manager.loginId}-a1` });
    created.push(learner.id, manager.id);
    const asManager = await clientFor(manager);

    const { error } = await asManager
      .from('profiles')
      .update({ login_id: 't-zz-a1' })
      .eq('id', learner.id);
    expect(error?.message).toMatch(/login id cannot be changed/);
    expect(await loginIdOf(learner.id)).toBe(learner.loginId);

    const { error: renameError } = await asManager
      .from('profiles')
      .update({ display_name: 'ชื่อใหม่' })
      .eq('id', learner.id);
    expect(renameError).toBeNull();
  });

  it('refuses a user rewriting their own code', async () => {
    const learner = await createTestUser('learner');
    created.push(learner.id);
    await (
      await clientFor(learner)
    )
      .from('profiles')
      .update({ login_id: 'someone-else' })
      .eq('id', learner.id);
    // Whether RLS finds no row to update or the trigger refuses it, the code stays.
    expect(await loginIdOf(learner.id)).toBe(learner.loginId);
  });
});
