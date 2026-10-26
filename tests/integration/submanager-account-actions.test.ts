import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  adminClient,
  anonClient,
  clientFor,
  createTestUser,
  createTestLearnerIn,
  deleteTestUser,
  INTERNAL_DOMAIN,
  type TestUser,
} from './helpers';
import {
  createSubmanagerAccount,
  resetSubmanagerPassword,
  setSubmanagerStatus,
} from '@/lib/db/provisioning';

const context = vi.hoisted(() => ({ actor: null as unknown, client: null as unknown }));
vi.mock('@/lib/auth/session', () => ({
  requireAdmin: async () => context.actor,
  requireStaff: async () => context.actor,
}));
vi.mock('@/lib/db/server', () => ({ createSupabaseServerClient: async () => context.client }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
import {
  resetManagerPasswordAction,
  setManagerStatusAction,
} from '@/app/[locale]/(admin)/admin/managers/actions';
import {
  resetPasswordAction,
  setStatusAction,
} from '@/app/[locale]/(admin)/admin/users/[id]/actions';

describe('Submanager targets cannot use legacy account mutation paths', () => {
  const ids: string[] = [];
  let owner: TestUser;
  let manager: TestUser;
  let submanager: { id: string; loginId: string };
  beforeAll(async () => {
    owner = await createTestUser('admin');
    manager = await createTestUser('manager');
    ids.push(owner.id, manager.id);
    submanager = await createSubmanagerAccount({
      managerId: manager.id,
      suffix: 'A7',
      password: 'Test123!',
    });
    ids.push(submanager.id);
    context.actor = { id: owner.id, role: 'admin', status: 'active' };
    context.client = await clientFor(owner);
  });
  afterAll(async () => {
    for (const id of ids.reverse()) await deleteTestUser(id);
  });
  const form = (status = 'disabled') => {
    const f = new FormData();
    for (const [key, value] of Object.entries({
      locale: 'en',
      id: submanager.id,
      userId: submanager.id,
      password: 'Other123',
      newPassword: 'Other123',
      status,
    }))
      f.set(key, value);
    return f;
  };
  const unchanged = async () => {
    const { data } = await adminClient()
      .from('profiles')
      .select('status, archived_at')
      .eq('id', submanager.id)
      .single();
    expect(data).toEqual({ status: 'active', archived_at: null });
    const { error } = await anonClient().auth.signInWithPassword({
      email: `${submanager.loginId}@${INTERNAL_DOMAIN}`,
      password: 'Test123!',
    });
    expect(error).toBeNull();
  };
  it('rejects Owner password resets through both Manager and generic account actions', async () => {
    const managerResult = await resetManagerPasswordAction(
      { ok: false, error: null, createdLoginId: null },
      form(),
    );
    expect(managerResult.ok).toBe(false);
    await expect(resetPasswordAction({ message: null, error: null }, form())).rejects.toThrow(
      'redirect:',
    );
    await unchanged();
  });
  it('rejects Owner suspension and reactivation through both legacy actions', async () => {
    for (const status of ['disabled', 'active']) {
      const managerResult = await setManagerStatusAction(
        { ok: false, error: null, createdLoginId: null },
        form(status),
      );
      expect(managerResult.ok).toBe(false);
      await expect(setStatusAction({ message: null, error: null }, form(status))).rejects.toThrow(
        'redirect:',
      );
    }
    await unchanged();
  });
  it('rejects Owner direct REST suspension, initial archive, reassignment and deletion', async () => {
    const client = await clientFor(owner);
    for (const patch of [
      { status: 'disabled' },
      { status: 'disabled', archived_at: new Date().toISOString() },
      { role: 'learner' },
      { manager_id: owner.id },
    ]) {
      expect(
        (await client.from('profiles').update(patch).eq('id', submanager.id)).error,
      ).not.toBeNull();
    }
    expect((await client.from('profiles').delete().eq('id', submanager.id)).error).not.toBeNull();
    await unchanged();
  });
  it('rejects even parent REST lifecycle edits while retaining self language/password metadata updates', async () => {
    const parent = await clientFor(manager);
    expect(
      (await parent.from('profiles').update({ status: 'disabled' }).eq('id', submanager.id)).error,
    ).not.toBeNull();
    const self = await clientFor({ ...submanager, role: 'submanager', password: 'Test123!' });
    expect((await self.rpc('set_my_preferred_language', { p_lang: 'en' })).error).toBeNull();
    expect((await self.auth.updateUser({ password: 'Self123!' })).error).toBeNull();
    const { data } = await adminClient()
      .from('profiles')
      .select('preferred_language, password_changed_at')
      .eq('id', submanager.id)
      .single();
    expect(data?.preferred_language).toBe('en');
    expect(data?.password_changed_at).toBeTruthy();
    await resetSubmanagerPassword(manager.id, submanager.id, 'Test123!');
    await setSubmanagerStatus(manager.id, submanager.id, 'disabled');
    await setSubmanagerStatus(manager.id, submanager.id, 'active');
    await unchanged();
  });
  it('rejects the owning Manager when using generic actions on a Submanager', async () => {
    context.actor = { id: manager.id, role: 'manager', status: 'active' };
    context.client = await clientFor(manager);
    try {
      await expect(resetPasswordAction({ message: null, error: null }, form())).rejects.toThrow(
        'redirect:',
      );
      await expect(setStatusAction({ message: null, error: null }, form())).rejects.toThrow(
        'redirect:',
      );
      await unchanged();
    } finally {
      context.actor = { id: owner.id, role: 'admin', status: 'active' };
      context.client = await clientFor(owner);
    }
  });
  it('preserves Owner Manager controls and Owner/parent learner controls', async () => {
    const learner = await createTestLearnerIn(manager);
    ids.push(learner.id);
    const managerForm = form();
    managerForm.set('id', manager.id);
    expect(
      (
        await resetManagerPasswordAction(
          { ok: false, error: null, createdLoginId: null },
          managerForm,
        )
      ).ok,
    ).toBe(true);
    expect(
      (await setManagerStatusAction({ ok: false, error: null, createdLoginId: null }, managerForm))
        .ok,
    ).toBe(true);
    managerForm.set('status', 'active');
    expect(
      (await setManagerStatusAction({ ok: false, error: null, createdLoginId: null }, managerForm))
        .ok,
    ).toBe(true);
    const learnerForm = form();
    learnerForm.set('userId', learner.id);
    expect((await resetPasswordAction({ message: null, error: null }, learnerForm)).message).toBe(
      'password-updated',
    );
    expect((await setStatusAction({ message: null, error: null }, learnerForm)).message).toBe(
      'status-updated',
    );
    context.actor = { id: manager.id, role: 'manager', status: 'active' };
    context.client = await clientFor({ ...manager, password: 'Other123' });
    learnerForm.set('status', 'active');
    expect((await setStatusAction({ message: null, error: null }, learnerForm)).message).toBe(
      'status-updated',
    );
    learnerForm.set('password', 'Final123');
    expect((await resetPasswordAction({ message: null, error: null }, learnerForm)).message).toBe(
      'password-updated',
    );
    await clientFor({ ...learner, password: 'Final123' });
  });
});
