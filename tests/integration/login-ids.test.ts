import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  INTERNAL_DOMAIN,
  adminClient,
  anonClient,
  clientFor,
  createTestLearnerIn,
  createTestManager,
  createTestUser,
  deleteTestUser,
} from './helpers';

const svc = adminClient();

async function signsIn(loginId: string, password: string): Promise<boolean> {
  const { error } = await anonClient().auth.signInWithPassword({
    email: `${loginId}@${INTERNAL_DOMAIN}`,
    password,
  });
  return !error;
}

async function loginIdOf(id: string): Promise<string> {
  const { data, error } = await svc.from('profiles').select('login_id').eq('id', id).single();
  if (error) throw error;
  return data.login_id;
}

/**
 * D69: the accounts numbered under D53 take the new shape — t01 → t-01, t01-01 → t-01-01 — in
 * the profile, the sign-in email and the metadata together, so the person signs in with the new
 * code at once and not with the old one.
 */
describe('rename_legacy_login_ids', () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created.reverse()) await deleteTestUser(id);
  });

  it('renames a numbered team and its learners, and they sign in with the new codes', async () => {
    // A number no real team reaches, so the test never meets another fixture's code.
    const n = String(randomInt(9_000_000, 9_999_999));
    const manager = await createTestManager({ loginId: `t${n}` });
    const learner = await createTestLearnerIn(manager, { loginId: `t${n}-01` });
    created.push(learner.id, manager.id);

    const { data: renamed, error } = await svc.rpc('rename_legacy_login_ids');
    expect(error).toBeNull();
    expect(renamed).toBeGreaterThanOrEqual(2);

    expect(await loginIdOf(manager.id)).toBe(`t-${n}`);
    expect(await loginIdOf(learner.id)).toBe(`t-${n}-01`);
    expect(await signsIn(`t-${n}`, manager.password)).toBe(true);
    expect(await signsIn(`t-${n}-01`, learner.password)).toBe(true);
    expect(await signsIn(`t${n}`, manager.password)).toBe(false);
    expect(await signsIn(`t${n}-01`, learner.password)).toBe(false);

    const { data: auth } = await svc.auth.admin.getUserById(learner.id);
    expect(auth.user?.email).toBe(`t-${n}-01@${INTERNAL_DOMAIN}`);
    expect(auth.user?.user_metadata.login_id).toBe(`t-${n}-01`);
  });

  it('leaves every other shape alone and renames nothing the second time', async () => {
    const n = String(randomInt(9_000_000, 9_999_999));
    // An admin outside the team system, a learner named by hand, and a code already new.
    const admin = await createTestUser('admin', { loginId: `t${n}` });
    const named = await createTestUser('learner', {
      loginId: `somchai-${randomUUID().slice(0, 6)}`,
    });
    const current = await createTestManager({ loginId: `t-${n.slice(0, 6)}` });
    created.push(admin.id, named.id, current.id);

    await svc.rpc('rename_legacy_login_ids');
    const { data: again } = await svc.rpc('rename_legacy_login_ids');
    expect(again).toBe(0);
    expect(await loginIdOf(admin.id)).toBe(admin.loginId);
    expect(await loginIdOf(named.id)).toBe(named.loginId);
    expect(await loginIdOf(current.id)).toBe(current.loginId);
  });

  it('is the service role’s alone', async () => {
    const manager = await createTestManager();
    created.push(manager.id);
    const { error } = await (await clientFor(manager)).rpc('rename_legacy_login_ids');
    expect(error).not.toBeNull();
  });
});

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
