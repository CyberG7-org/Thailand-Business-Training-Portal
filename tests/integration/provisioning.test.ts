import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  ProvisioningError,
  createAccount,
  setAccountPassword,
  setAccountStatus,
} from '@/lib/db/provisioning';
import { adminClient, clientFor, deleteTestUser, type TestUser } from './helpers';

const created: string[] = [];
const unique = () => `prov-${randomUUID().slice(0, 8)}`;

afterAll(async () => {
  await Promise.all(created.map((id) => deleteTestUser(id)));
});

describe('createAccount', () => {
  it('creates an auth user and a profile with a lower-cased login id', async () => {
    const loginId = unique().toUpperCase();
    const { id } = await createAccount({
      loginId,
      password: 'Strong-Pass-123',
      displayName: 'Test Learner',
    });
    created.push(id);
    const { data } = await adminClient().from('profiles').select('*').eq('id', id).single();
    expect(data).toMatchObject({
      login_id: loginId.toLowerCase(),
      role: 'learner',
      display_name: 'Test Learner',
      preferred_language: 'th',
      status: 'active',
    });
  });

  it('creates admins with role admin', async () => {
    const { id } = await createAccount({
      loginId: unique(),
      password: 'Strong-Pass-123',
      role: 'admin',
    });
    created.push(id);
    const { data } = await adminClient().from('profiles').select('role').eq('id', id).single();
    expect(data?.role).toBe('admin');
  });

  it('rejects a duplicate login id with code "duplicate"', async () => {
    const loginId = unique();
    const { id } = await createAccount({ loginId, password: 'Strong-Pass-123' });
    created.push(id);
    await expect(createAccount({ loginId, password: 'Strong-Pass-123' })).rejects.toMatchObject({
      code: 'duplicate',
    });
  });

  it('rejects an invalid login id or a short password with code "invalid"', async () => {
    await expect(
      createAccount({ loginId: 'a b', password: 'Strong-Pass-123' }),
    ).rejects.toBeInstanceOf(ProvisioningError);
    await expect(createAccount({ loginId: unique(), password: 'short' })).rejects.toMatchObject({
      code: 'invalid',
    });
  });
});

describe('setAccountPassword / setAccountStatus', () => {
  it('changes the password and disabling blocks sign-in until re-enabled', async () => {
    const loginId = unique();
    const { id } = await createAccount({ loginId, password: 'Strong-Pass-123' });
    created.push(id);
    const user: TestUser = { id, loginId, password: 'Strong-Pass-123', role: 'learner' };

    await setAccountPassword(id, 'Another-Pass-456');
    await expect(clientFor(user)).rejects.toBeTruthy();
    await expect(clientFor({ ...user, password: 'Another-Pass-456' })).resolves.toBeTruthy();

    await setAccountStatus(id, 'disabled');
    await expect(clientFor({ ...user, password: 'Another-Pass-456' })).rejects.toBeTruthy();
    const { data: disabled } = await adminClient()
      .from('profiles')
      .select('status')
      .eq('id', id)
      .single();
    expect(disabled?.status).toBe('disabled');

    await setAccountStatus(id, 'active');
    await expect(clientFor({ ...user, password: 'Another-Pass-456' })).resolves.toBeTruthy();
  });
});
