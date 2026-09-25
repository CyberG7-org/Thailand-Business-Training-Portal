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

  it('refuses a learner whose parent is not a manager', async () => {
    const manager = await createManagerAccount({ password: PASSWORD });
    const learner = await createLearnerAccount({ password: PASSWORD, managerId: manager.id });
    created.push(manager.id, learner.id);
    await expect(
      createLearnerAccount({ password: PASSWORD, managerId: learner.id }),
    ).rejects.toBeInstanceOf(ProvisioningError);
  });
});
