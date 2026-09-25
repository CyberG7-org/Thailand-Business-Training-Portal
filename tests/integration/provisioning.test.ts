import { afterAll, describe, expect, it } from 'vitest';
import {
  ProvisioningError,
  createLearnerAccount,
  createManagerAccount,
} from '@/lib/db/provisioning';
import { adminClient, deleteTestUser } from './helpers';

const svc = adminClient();
const PASSWORD = 'Test-Password-123!';

describe('provisioning allocates the code', () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created.reverse()) await deleteTestUser(id);
  });

  it('gives managers t01, t02 … and never asks for a login id', async () => {
    const first = await createManagerAccount({ password: PASSWORD, displayName: 'หนึ่ง' });
    const second = await createManagerAccount({ password: PASSWORD, displayName: 'สอง' });
    created.push(first.id, second.id);
    expect(first.loginId).toMatch(/^t\d{2,}$/);
    expect(second.loginId).not.toBe(first.loginId);

    const { data } = await svc
      .from('profiles')
      .select('role, manager_id')
      .eq('id', first.id)
      .single();
    expect(data!.role).toBe('manager');
    expect(data!.manager_id).toBeNull();
  });

  it('gives a learner their manager code plus a number, and puts them in that team', async () => {
    const manager = await createManagerAccount({ password: PASSWORD, displayName: 'ทีม' });
    created.push(manager.id);
    const one = await createLearnerAccount({ password: PASSWORD, managerId: manager.id });
    const two = await createLearnerAccount({ password: PASSWORD, managerId: manager.id });
    created.push(one.id, two.id);

    expect(one.loginId).toBe(`${manager.loginId}-01`);
    expect(two.loginId).toBe(`${manager.loginId}-02`);
    const { data } = await svc
      .from('profiles')
      .select('role, manager_id')
      .eq('id', one.id)
      .single();
    expect(data!.role).toBe('learner');
    expect(data!.manager_id).toBe(manager.id);
  });

  it('never hands two concurrent creations the same code', async () => {
    const manager = await createManagerAccount({ password: PASSWORD });
    created.push(manager.id);
    const learners = await Promise.all(
      Array.from({ length: 5 }, () =>
        createLearnerAccount({ password: PASSWORD, managerId: manager.id }),
      ),
    );
    created.push(...learners.map((l) => l.id));
    expect(new Set(learners.map((l) => l.loginId)).size).toBe(5);
  });

  it('refuses a learner under a suspended manager, and burns no code doing it', async () => {
    const manager = await createManagerAccount({ password: PASSWORD });
    created.push(manager.id);
    await svc.from('profiles').update({ status: 'disabled' }).eq('id', manager.id);

    await expect(
      createLearnerAccount({ password: PASSWORD, managerId: manager.id }),
    ).rejects.toBeInstanceOf(ProvisioningError);

    // The team's counter is untouched, so re-enabling the manager still starts at 01.
    await svc.from('profiles').update({ status: 'active' }).eq('id', manager.id);
    const first = await createLearnerAccount({ password: PASSWORD, managerId: manager.id });
    created.push(first.id);
    expect(first.loginId).toBe(`${manager.loginId}-01`);
  });

  it('leaves no account behind when the team cannot be set', async () => {
    const manager = await createManagerAccount({ password: PASSWORD });
    created.push(manager.id);
    // A parent that vanishes between the check and the write is the real shape of this failure.
    const gone = crypto.randomUUID();
    const before = await svc
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'learner');

    await expect(
      createLearnerAccount({ password: PASSWORD, managerId: gone }),
    ).rejects.toBeInstanceOf(ProvisioningError);

    const after = await svc
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'learner');
    expect(after.count).toBe(before.count);
  });

  it('refuses a learner whose parent is not a manager', async () => {
    const manager = await createManagerAccount({ password: PASSWORD });
    const learner = await createLearnerAccount({ password: PASSWORD, managerId: manager.id });
    created.push(manager.id, learner.id);
    await expect(
      createLearnerAccount({ password: PASSWORD, managerId: learner.id }),
    ).rejects.toBeInstanceOf(ProvisioningError);
  });
});

/**
 * A code is spent only by an account that exists. The first manager on staging came out as T02
 * because a too-short password was rejected after the counter had already moved.
 */
describe('provisioning spends a code only on an account that exists', () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created.reverse()) await deleteTestUser(id);
  });

  async function nextManagerNumber(): Promise<number> {
    const { data } = await svc
      .from('login_id_counters')
      .select('next_value')
      .eq('scope', 'manager')
      .maybeSingle();
    return data?.next_value ?? 1;
  }
  const code = (n: number) => `t${n < 10 ? `0${n}` : n}`;

  it('rejects a short password before taking a team code', async () => {
    const before = await nextManagerNumber();
    await expect(createManagerAccount({ password: 'short' })).rejects.toMatchObject({
      code: 'invalid',
    });
    expect(await nextManagerNumber()).toBe(before);
  });

  it('rejects a short learner password without numbering the learner', async () => {
    const manager = await createManagerAccount({ password: PASSWORD });
    created.push(manager.id);
    await expect(
      createLearnerAccount({ password: 'short', managerId: manager.id }),
    ).rejects.toMatchObject({ code: 'invalid' });
    const first = await createLearnerAccount({ password: PASSWORD, managerId: manager.id });
    created.push(first.id);
    expect(first.loginId).toBe(`${manager.loginId}-01`);
  });

  it('hands the code back when the auth service refuses the account', async () => {
    const before = await nextManagerNumber();
    await expect(
      createManagerAccount(
        { password: PASSWORD },
        {
          createAccount: async () => {
            throw new ProvisioningError('auth unavailable', 'unknown');
          },
        },
      ),
    ).rejects.toMatchObject({ code: 'unknown' });
    expect(await nextManagerNumber()).toBe(before);
    const next = await createManagerAccount({ password: PASSWORD });
    created.push(next.id);
    expect(next.loginId).toBe(code(before));
  });

  it('keeps the number when the refusal is that the code is already taken', async () => {
    const before = await nextManagerNumber();
    await expect(
      createManagerAccount(
        { password: PASSWORD },
        {
          createAccount: async () => {
            throw new ProvisioningError('Login ID already exists', 'duplicate');
          },
        },
      ),
    ).rejects.toMatchObject({ code: 'duplicate' });
    // Handing it back would issue the same taken code on every retry.
    expect(await nextManagerNumber()).toBe(before + 1);
  });
});
