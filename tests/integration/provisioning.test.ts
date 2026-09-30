import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  LOGIN_ID_TAKEN,
  ProvisioningError,
  createLearnerAccount,
  createManagerAccount,
  isLoginIdTaken,
  learnerPrefixOf,
  suggestLoginSuffix,
} from '@/lib/db/provisioning';
import { MANAGER_PREFIX } from '@/lib/domain/login-id';
import { adminClient, deleteTestUser } from './helpers';

const svc = adminClient();
const PASSWORD = 'Test-Password-123!';

/** A six-character suffix no other run has used, so a persistent local database never collides. */
const fresh = () => randomUUID().replaceAll('-', '').slice(0, 6);

/** D69: staff type the code after a fixed prefix; the server composes and checks it. */
describe('provisioning takes the typed code', () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created.reverse()) await deleteTestUser(id);
  });

  it('gives a manager T- plus the suffix typed, stored lower-case', async () => {
    const suffix = fresh();
    const manager = await createManagerAccount({
      suffix: suffix.toUpperCase(),
      password: PASSWORD,
      displayName: 'หนึ่ง',
    });
    created.push(manager.id);
    expect(manager.loginId).toBe(`t-${suffix}`);

    const { data } = await svc
      .from('profiles')
      .select('login_id, role, manager_id')
      .eq('id', manager.id)
      .single();
    expect(data).toEqual({ login_id: `t-${suffix}`, role: 'manager', manager_id: null });
  });

  it("gives a learner their manager's code, a hyphen and the suffix, in that team", async () => {
    const manager = await createManagerAccount({ suffix: fresh(), password: PASSWORD });
    created.push(manager.id);
    const learner = await createLearnerAccount({
      suffix: 'L8',
      password: PASSWORD,
      managerId: manager.id,
    });
    created.push(learner.id);

    expect(learner.loginId).toBe(`${manager.loginId}-l8`);
    const { data } = await svc
      .from('profiles')
      .select('role, manager_id')
      .eq('id', learner.id)
      .single();
    expect(data).toEqual({ role: 'learner', manager_id: manager.id });
  });

  it('lets two teams use the same learner suffix, as their prefixes differ', async () => {
    const a = await createManagerAccount({ suffix: fresh(), password: PASSWORD });
    const b = await createManagerAccount({ suffix: fresh(), password: PASSWORD });
    created.push(a.id, b.id);
    const inA = await createLearnerAccount({ suffix: 'k2', password: PASSWORD, managerId: a.id });
    const inB = await createLearnerAccount({ suffix: 'k2', password: PASSWORD, managerId: b.id });
    created.push(inA.id, inB.id);
    expect(inA.loginId).not.toBe(inB.loginId);
  });

  it('refuses a learner under a suspended manager', async () => {
    const manager = await createManagerAccount({ suffix: fresh(), password: PASSWORD });
    created.push(manager.id);
    await svc.from('profiles').update({ status: 'disabled' }).eq('id', manager.id);
    await expect(
      createLearnerAccount({ suffix: 'a1', password: PASSWORD, managerId: manager.id }),
    ).rejects.toMatchObject({ code: 'no-manager' });
  });

  it('leaves no account behind when the team cannot be set', async () => {
    const before = await svc
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'learner');
    // A parent that does not exist is refused before any account is made.
    await expect(
      createLearnerAccount({ suffix: 'a1', password: PASSWORD, managerId: randomUUID() }),
    ).rejects.toBeInstanceOf(ProvisioningError);
    const after = await svc
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'learner');
    expect(after.count).toBe(before.count);
  });

  it('refuses a learner whose parent is not a manager', async () => {
    const manager = await createManagerAccount({ suffix: fresh(), password: PASSWORD });
    const learner = await createLearnerAccount({
      suffix: 'b2',
      password: PASSWORD,
      managerId: manager.id,
    });
    created.push(manager.id, learner.id);
    await expect(
      createLearnerAccount({ suffix: 'c3', password: PASSWORD, managerId: learner.id }),
    ).rejects.toMatchObject({ code: 'no-manager' });
  });
});

describe('a code is checked before it is created', () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created.reverse()) await deleteTestUser(id);
  });

  it('refuses a manager code another account holds, whatever the case typed', async () => {
    const suffix = fresh();
    const first = await createManagerAccount({ suffix, password: PASSWORD });
    created.push(first.id);
    await expect(
      createManagerAccount({ suffix: suffix.toUpperCase(), password: PASSWORD }),
    ).rejects.toMatchObject({ code: 'duplicate', message: LOGIN_ID_TAKEN });
  });

  it('refuses a learner code already in the team', async () => {
    const manager = await createManagerAccount({ suffix: fresh(), password: PASSWORD });
    created.push(manager.id);
    const one = await createLearnerAccount({
      suffix: 'd4',
      password: PASSWORD,
      managerId: manager.id,
    });
    created.push(one.id);
    await expect(
      createLearnerAccount({ suffix: 'D4', password: PASSWORD, managerId: manager.id }),
    ).rejects.toMatchObject({ code: 'duplicate' });
  });

  it('counts a disabled account as holding its code', async () => {
    const suffix = fresh();
    const manager = await createManagerAccount({ suffix, password: PASSWORD });
    created.push(manager.id);
    await svc.from('profiles').update({ status: 'disabled' }).eq('id', manager.id);
    expect(await isLoginIdTaken(`t-${suffix}`)).toBe(true);
    expect(await isLoginIdTaken(`T-${suffix.toUpperCase()}`)).toBe(true);
    expect(await isLoginIdTaken(`t-${fresh()}`)).toBe(false);
  });

  it('lets exactly one of two simultaneous creations have a code', async () => {
    const suffix = fresh();
    const results = await Promise.allSettled([
      createManagerAccount({ suffix, password: PASSWORD }),
      createManagerAccount({ suffix, password: PASSWORD }),
    ]);
    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r) => r.status === 'rejected');
    for (const r of won) created.push(r.value.id);
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect((lost[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'duplicate' });
  });

  it('refuses a suffix that is not 2–6 letters or digits, before anything is asked', async () => {
    for (const suffix of ['', 'x', 'abcdefg', 'g-4', 'ก4', 'a b']) {
      await expect(
        createManagerAccount(
          { suffix, password: PASSWORD },
          {
            createAccount: async () => {
              throw new Error('the auth service must not be asked');
            },
          },
        ),
        suffix,
      ).rejects.toMatchObject({ code: 'invalid-login-id' });
    }
  });

  it('refuses a short password before the code is looked at', async () => {
    await expect(
      createManagerAccount({ suffix: fresh(), password: 'short' }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('tells a racing loser the same thing the pre-check would have', async () => {
    await expect(
      createManagerAccount(
        { suffix: fresh(), password: PASSWORD },
        {
          createAccount: async () => {
            throw new ProvisioningError(LOGIN_ID_TAKEN, 'duplicate');
          },
        },
      ),
    ).rejects.toMatchObject({ code: 'duplicate', message: LOGIN_ID_TAKEN });
  });
});

describe('suggestions', () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created.reverse()) await deleteTestUser(id);
  });

  it('offers a free suffix, skipping one an account already holds', async () => {
    const taken = fresh();
    const free = fresh();
    const manager = await createManagerAccount({ suffix: taken, password: PASSWORD });
    created.push(manager.id);
    expect(await suggestLoginSuffix(MANAGER_PREFIX, () => [taken, free])).toBe(free);
  });

  it('grows a character when every candidate of a length is taken', async () => {
    const taken = fresh();
    const manager = await createManagerAccount({ suffix: taken, password: PASSWORD });
    created.push(manager.id);
    const longer = `${fresh()}`.slice(0, 3);
    const offered = await suggestLoginSuffix(MANAGER_PREFIX, (_count, length) =>
      length === 2 ? [taken] : [longer],
    );
    expect(offered).toBe(longer);
  });

  it("suggests two characters by default, under the team's own prefix", async () => {
    const manager = await createManagerAccount({ suffix: fresh(), password: PASSWORD });
    created.push(manager.id);
    const prefix = await learnerPrefixOf(manager.id);
    expect(prefix).toBe(`${manager.loginId}-`);
    const suffix = await suggestLoginSuffix(prefix);
    expect(suffix).toMatch(/^[a-z][0-9]$/);
    expect(await isLoginIdTaken(prefix + suffix)).toBe(false);
  });
});
