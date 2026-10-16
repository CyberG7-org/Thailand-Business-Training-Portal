import { afterAll, describe, expect, it } from 'vitest';
import { adminClient, createTestManager, deleteTestUser } from './helpers';

const svc = adminClient();
const created: string[] = [];

async function passwordChangedAt(id: string): Promise<string | null> {
  const { data, error } = await svc
    .from('profiles')
    .select('password_changed_at')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data.password_changed_at;
}

describe('password-change timestamp', () => {
  afterAll(async () => {
    for (const id of created) await deleteTestUser(id);
  });

  it('records creation and password changes, but not unrelated account edits', async () => {
    const manager = await createTestManager();
    created.push(manager.id);
    const initial = await passwordChangedAt(manager.id);
    expect(initial).not.toBeNull();

    const { error: nameError } = await svc.auth.admin.updateUserById(manager.id, {
      user_metadata: { display_name: 'Renamed manager' },
    });
    expect(nameError).toBeNull();
    expect(await passwordChangedAt(manager.id)).toBe(initial);

    await new Promise((resolve) => setTimeout(resolve, 20));
    const { error: passwordError } = await svc.auth.admin.updateUserById(manager.id, {
      password: 'Next123!',
    });
    expect(passwordError).toBeNull();
    const changed = await passwordChangedAt(manager.id);
    expect(changed).not.toBeNull();
    expect(new Date(changed!).getTime()).toBeGreaterThan(new Date(initial!).getTime());
  });
});
