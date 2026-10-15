import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  LEARNER_SUFFIX_INVALID,
  LOGIN_ID_TAKEN,
  MANAGER_SUFFIX_INVALID,
  ProvisioningError,
  createLearnerAccount,
  createManagerAccount,
  isLoginIdTaken,
  learnerPrefixOf,
  suggestSuffix,
} from '@/lib/db/provisioning';
import { MANAGER_PREFIX } from '@/lib/domain/login-id';
import { adminClient, deleteTestUser } from './helpers';

const svc = adminClient();
const PASSWORD = 'Test-Password-123!';
const LEARNER_PASSWORD = 'Test1234';

/**
 * A manager code no account holds. Suggestions use one letter and one digit, so a
 * persistent local database is asked rather than a random one invented.
 */
const fresh = () => suggestSuffix('manager', MANAGER_PREFIX);

/** New manager IDs have no prefix; the server still checks uniqueness. */
describe('provisioning takes the typed code', () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created.reverse()) await deleteTestUser(id);
  });

  it('gives a manager the two-character code typed, stored lower-case', async () => {
    const suffix = await fresh();
    const manager = await createManagerAccount({
      suffix: suffix.toUpperCase(),
      password: PASSWORD,
      displayName: 'หนึ่ง',
    });
    created.push(manager.id);
    expect(manager.loginId).toBe(suffix);

    const { data } = await svc
      .from('profiles')
      .select('login_id, role, manager_id')
      .eq('id', manager.id)
      .single();
    expect(data).toEqual({ login_id: suffix, role: 'manager', manager_id: null });
  });

  it("gives a learner their manager's code, a hyphen and the suffix, in that team", async () => {
    const manager = await createManagerAccount({ suffix: await fresh(), password: PASSWORD });
    created.push(manager.id);
    const learner = await createLearnerAccount({
      suffix: 'LA08',
      password: LEARNER_PASSWORD,
      managerId: manager.id,
    });
    created.push(learner.id);

    expect(learner.loginId).toBe(`${manager.loginId}la08`);
    const { data } = await svc
      .from('profiles')
      .select('role, manager_id')
      .eq('id', learner.id)
      .single();
    expect(data).toEqual({ role: 'learner', manager_id: manager.id });
  });

  it('lets two teams use the same learner suffix, as their prefixes differ', async () => {
    const a = await createManagerAccount({ suffix: await fresh(), password: PASSWORD });
    const b = await createManagerAccount({ suffix: await fresh(), password: PASSWORD });
    created.push(a.id, b.id);
    const inA = await createLearnerAccount({
      suffix: 'ka02',
      password: LEARNER_PASSWORD,
      managerId: a.id,
    });
    const inB = await createLearnerAccount({
      suffix: 'ka02',
      password: LEARNER_PASSWORD,
      managerId: b.id,
    });
    created.push(inA.id, inB.id);
    expect(inA.loginId).not.toBe(inB.loginId);
  });

  it('refuses a learner under a suspended manager', async () => {
    const manager = await createManagerAccount({ suffix: await fresh(), password: PASSWORD });
    created.push(manager.id);
    await svc.from('profiles').update({ status: 'disabled' }).eq('id', manager.id);
    await expect(
      createLearnerAccount({ suffix: 'aa01', password: LEARNER_PASSWORD, managerId: manager.id }),
    ).rejects.toMatchObject({ code: 'no-manager' });
  });

  it('leaves no account behind when the team cannot be set', async () => {
    const before = await svc
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'learner');
    // A parent that does not exist is refused before any account is made.
    await expect(
      createLearnerAccount({ suffix: 'aa01', password: LEARNER_PASSWORD, managerId: randomUUID() }),
    ).rejects.toBeInstanceOf(ProvisioningError);
    const after = await svc
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'learner');
    expect(after.count).toBe(before.count);
  });

  it('refuses a learner whose parent is not a manager', async () => {
    const manager = await createManagerAccount({ suffix: await fresh(), password: PASSWORD });
    const learner = await createLearnerAccount({
      suffix: 'ba02',
      password: LEARNER_PASSWORD,
      managerId: manager.id,
    });
    created.push(manager.id, learner.id);
    await expect(
      createLearnerAccount({ suffix: 'ca03', password: LEARNER_PASSWORD, managerId: learner.id }),
    ).rejects.toMatchObject({ code: 'no-manager' });
  });
});

describe('a code is checked before it is created', () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created.reverse()) await deleteTestUser(id);
  });

  it('refuses a manager code another account holds, whatever the case typed', async () => {
    const suffix = await fresh();
    const first = await createManagerAccount({ suffix, password: PASSWORD });
    created.push(first.id);
    await expect(
      createManagerAccount({ suffix: suffix.toUpperCase(), password: PASSWORD }),
    ).rejects.toMatchObject({ code: 'duplicate', message: LOGIN_ID_TAKEN });
  });

  it('refuses a learner code already in the team', async () => {
    const manager = await createManagerAccount({ suffix: await fresh(), password: PASSWORD });
    created.push(manager.id);
    const one = await createLearnerAccount({
      suffix: 'da04',
      password: LEARNER_PASSWORD,
      managerId: manager.id,
    });
    created.push(one.id);
    await expect(
      createLearnerAccount({ suffix: 'DA04', password: LEARNER_PASSWORD, managerId: manager.id }),
    ).rejects.toMatchObject({ code: 'duplicate' });
  });

  it('counts a disabled account as holding its code', async () => {
    const suffix = await fresh();
    const manager = await createManagerAccount({ suffix, password: PASSWORD });
    created.push(manager.id);
    await svc.from('profiles').update({ status: 'disabled' }).eq('id', manager.id);
    expect(await isLoginIdTaken(suffix)).toBe(true);
    expect(await isLoginIdTaken(suffix.toUpperCase())).toBe(true);
    expect(await isLoginIdTaken(await fresh())).toBe(false);
  });

  it('lets exactly one of two simultaneous creations have a code', async () => {
    const suffix = await fresh();
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

  it('refuses a manager code that is not two letters or digits', async () => {
    for (const suffix of ['', 'x', 'A12', 'AB12', 'SALES1', 'a123', 'g-4', 'ก1', 'a 1']) {
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
      ).rejects.toMatchObject({ code: 'invalid-login-id', message: MANAGER_SUFFIX_INVALID });
    }
  });

  it('refuses a short password before the code is looked at', async () => {
    await expect(
      createManagerAccount({ suffix: await fresh(), password: 'short' }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('tells a racing loser the same thing the pre-check would have', async () => {
    await expect(
      createManagerAccount(
        { suffix: await fresh(), password: PASSWORD },
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
    const taken = await fresh();
    const manager = await createManagerAccount({ suffix: taken, password: PASSWORD });
    created.push(manager.id);
    const free = await fresh();
    expect(await suggestSuffix('manager', MANAGER_PREFIX, () => [taken, free])).toBe(free);
  });

  it("reads the managers' codes once the random batches find nothing free", async () => {
    const taken = await fresh();
    const manager = await createManagerAccount({ suffix: taken, password: PASSWORD });
    created.push(manager.id);
    // The batches offer only a held code; the full read of two-character IDs skips what is held.
    const offered = await suggestSuffix('manager', MANAGER_PREFIX, () => [taken]);
    expect(offered).not.toBe(taken);
    expect(offered).toMatch(/^[a-hj-np-z][0-9]$/);
    expect(await isLoginIdTaken(MANAGER_PREFIX + offered)).toBe(false);
  });

  it('suggests one letter and one digit for a manager by default', async () => {
    const suffix = await suggestSuffix('manager', MANAGER_PREFIX);
    expect(suffix).toMatch(/^[a-hj-np-z][0-9]$/);
    expect(await isLoginIdTaken(MANAGER_PREFIX + suffix)).toBe(false);
  });

  it("suggests a learner's code under the team's own prefix", async () => {
    const manager = await createManagerAccount({ suffix: await fresh(), password: PASSWORD });
    created.push(manager.id);
    const prefix = await learnerPrefixOf(manager.id);
    expect(prefix).toBe(manager.loginId);
    const suffix = await suggestSuffix('learner', prefix);
    expect(suffix).toMatch(/^[a-z]{2}[0-9]{2}$/);
    expect(await isLoginIdTaken(prefix + suffix)).toBe(false);
  });
});

/** New learner suffixes have four alphanumeric characters in any order. */
describe('learner suffix validation', () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created.reverse()) await deleteTestUser(id);
  });

  it('refuses a learner suffix that is not four letters or digits', async () => {
    const manager = await createManagerAccount({ suffix: await fresh(), password: PASSWORD });
    created.push(manager.id);
    for (const suffix of ['D42', 'L8', 'AB1', 'AB123', 'AB-1', 'A 23']) {
      await expect(
        createLearnerAccount(
          { suffix, password: LEARNER_PASSWORD, managerId: manager.id },
          {
            createAccount: async () => {
              throw new Error('the auth service must not be asked');
            },
          },
        ),
        suffix,
      ).rejects.toMatchObject({ code: 'invalid-login-id', message: LEARNER_SUFFIX_INVALID });
    }
    const learner = await createLearnerAccount({
      suffix: 'da42',
      password: LEARNER_PASSWORD,
      managerId: manager.id,
    });
    created.push(learner.id);
    expect(learner.loginId).toBe(`${manager.loginId}da42`);
  });

  it('gives a manager a two-character code without T', async () => {
    const manager = await createManagerAccount({ suffix: await fresh(), password: PASSWORD });
    created.push(manager.id);
    expect(manager.loginId).toMatch(/^[a-z][0-9]$/);
  });

  it('suggests two letters and two digits under the team, skipping a taken one', async () => {
    const manager = await createManagerAccount({ suffix: await fresh(), password: PASSWORD });
    created.push(manager.id);
    const prefix = await learnerPrefixOf(manager.id);
    const held = await createLearnerAccount({
      suffix: 'aa01',
      password: LEARNER_PASSWORD,
      managerId: manager.id,
    });
    created.push(held.id);
    expect(await suggestSuffix('learner', prefix, () => ['aa01', 'ba02'])).toBe('ba02');
    expect(await suggestSuffix('learner', prefix)).toMatch(/^[a-z]{2}[0-9]{2}$/);
  });

  it("reads the team's codes once the random batches find nothing free, as on a nearly full team", async () => {
    const manager = await createManagerAccount({ suffix: await fresh(), password: PASSWORD });
    const other = await createManagerAccount({ suffix: await fresh(), password: PASSWORD });
    created.push(manager.id, other.id);
    const prefix = await learnerPrefixOf(manager.id);
    // Another team's aa02 is not this team's.
    const elsewhere = await createLearnerAccount({
      suffix: 'aa02',
      password: LEARNER_PASSWORD,
      managerId: other.id,
    });
    created.push(elsewhere.id);
    for (const suffix of ['aa00', 'aa01']) {
      const held = await createLearnerAccount({
        suffix,
        password: LEARNER_PASSWORD,
        managerId: manager.id,
      });
      created.push(held.id);
    }
    // The batches offer only held codes; the full read skips both and takes the first left.
    expect(
      await suggestSuffix(
        'learner',
        prefix,
        () => ['aa00', 'aa01'],
        () => 0,
      ),
    ).toBe('aa02');
  });
});
