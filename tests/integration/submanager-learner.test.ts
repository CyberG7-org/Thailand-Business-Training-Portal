import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  adminClient,
  clientFor,
  confirmRecord,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers';

const state = vi.hoisted(() => ({ client: null as unknown, followups: [] as unknown[] }));
vi.mock('react', () => ({ cache: (fn: unknown) => fn }));
vi.mock('@/lib/db/server', () => ({ createSupabaseServerClient: async () => state.client }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/server', () => ({ after: (fn: unknown) => state.followups.push(fn) }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
import { createUserAction } from '@/app/[locale]/(admin)/admin/users/actions';
import {
  checkLoginIdAction,
  suggestLoginIdAction,
} from '@/app/[locale]/(admin)/admin/login-id-actions';

describe('Submanager learner creation boundary', () => {
  const svc = adminClient();
  let manager: TestUser, sub: TestUser, other: TestUser;
  const records: string[] = [];
  const users: string[] = [];
  const initial = { ok: false, error: null, createdLoginId: null, company: null };
  beforeAll(async () => {
    expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname).toMatch(
      /^(127\.0\.0\.1|localhost)$/,
    );
    manager = await createTestUser('manager');
    other = await createTestUser('manager');
    sub = await createTestUser('submanager', { managerId: manager.id });
    state.client = await clientFor(sub);
  });
  afterAll(async () => {
    for (const id of records) await svc.from('dbd_records').delete().eq('id', id);
    for (const id of [...users, sub.id, other.id, manager.id]) await deleteTestUser(id);
  });
  async function record(creator = sub.id, team = manager.id, confirmed = true) {
    const { data, error } = await svc
      .from('dbd_records')
      .insert({
        company_name_th: 'Test company',
        team_id: team,
        created_by: creator,
        directors: [{ name_th: 'Director' }],
      })
      .select('id')
      .single();
    if (error) throw error;
    records.push(data.id);
    if (confirmed) await confirmRecord(data.id, team);
    return data.id;
  }
  function form(id: string, suffix: string) {
    const f = new FormData();
    Object.entries({
      locale: 'en',
      dbdRecordId: id,
      loginSuffix: suffix,
      password: 'Learn123',
      managerId: other.id,
    }).forEach(([k, v]) => f.set(k, v));
    return f;
  }
  it.each(['other creator', 'other team', 'unconfirmed', 'taken'] as const)(
    'rejects %s before any auth/profile is created',
    async (kind) => {
      const id = await record(
        kind === 'other creator' ? manager.id : sub.id,
        kind === 'other team' ? other.id : manager.id,
        kind !== 'unconfirmed',
      );
      if (kind === 'taken') {
        const learner = await createTestUser('learner', { managerId: manager.id });
        users.push(learner.id);
        const { error } = await svc
          .from('user_dbd_assignments')
          .insert({ user_id: learner.id, dbd_record_id: id });
        if (error) throw error;
      }
      const before = (await svc.auth.admin.listUsers({ perPage: 1000 })).data.users
        .map((u) => u.id)
        .sort();
      const profilesBefore = await svc
        .from('profiles')
        .select('id', { count: 'exact', head: true });
      expect(profilesBefore.error).toBeNull();
      const result = await createUserAction(initial, form(id, 'ab12'));
      expect(result).toMatchObject({ ok: false, error: 'not-allowed', createdLoginId: null });
      expect(
        (await svc.auth.admin.listUsers({ perPage: 1000 })).data.users.map((u) => u.id).sort(),
      ).toEqual(before);
      const profilesAfter = await svc.from('profiles').select('id', { count: 'exact', head: true });
      expect(profilesAfter.error).toBeNull();
      expect(profilesAfter.count).toBe(profilesBefore.count);
      console.info(
        JSON.stringify({
          suite: 'submanager-learner',
          case: kind,
          phase: 'assert',
          authUnchanged: true,
        }),
      );
    },
  );
  it('creates under the authoritative parent, assigns, audits and schedules both follow-ups', async () => {
    const id = await record();
    const result = await createUserAction(initial, form(id, 'ac12'));
    expect(result.ok).toBe(true);
    const { data } = await svc
      .from('profiles')
      .select('id, manager_id')
      .eq('login_id', result.createdLoginId!)
      .single();
    if (data) users.push(data.id);
    expect(data?.manager_id).toBe(manager.id);
    expect(
      (
        await svc
          .from('user_dbd_assignments')
          .select('dbd_record_id')
          .eq('user_id', data!.id)
          .single()
      ).data?.dbd_record_id,
    ).toBe(id);
    expect(
      (await svc.from('audit_logs').select('actor_id').eq('entity_id', data!.id).single()).data
        ?.actor_id,
    ).toBe(sub.id);
    expect(state.followups).toHaveLength(2);
  });
  it('checks and suggests learner codes only under the real parent despite a spoofed manager', async () => {
    expect(
      await checkLoginIdAction({
        locale: 'en',
        kind: 'learner',
        managerId: other.id,
        suffix: 'ac12',
      }),
    ).toEqual({ state: 'taken' });
    expect(
      (await suggestLoginIdAction({ locale: 'en', kind: 'learner', managerId: other.id })).suffix,
    ).toMatch(/^[a-z0-9]{4}$/i);
  });
  it('rejects assignment when the parent is suspended', async () => {
    const id = await record();
    await svc.from('profiles').update({ status: 'disabled' }).eq('id', manager.id);
    try {
      await expect(createUserAction(initial, form(id, 'ad12'))).rejects.toThrow('reason=disabled');
    } finally {
      await svc.from('profiles').update({ status: 'active' }).eq('id', manager.id);
    }
  });
});
