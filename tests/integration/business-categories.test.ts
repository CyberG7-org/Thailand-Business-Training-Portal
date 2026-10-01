import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  clientFor,
  createTestManager,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers';

const svc = adminClient();

/** Spec §5.3 (D73): an Owner-controlled dictionary; staff read it, only the Owner edits it. */
describe('business categories', () => {
  let owner: TestUser;
  let manager: TestUser;
  let learner: TestUser;
  const key = `test_${Date.now()}`;

  beforeAll(async () => {
    owner = await createTestUser('admin');
    manager = await createTestManager();
    learner = await createTestUser('learner');
  });
  afterAll(async () => {
    await svc.from('business_categories').delete().eq('key', key);
    for (const u of [learner, manager, owner]) await deleteTestUser(u.id);
  });

  it('ships a draft dictionary', async () => {
    const { count } = await svc
      .from('business_categories')
      .select('*', { count: 'exact', head: true })
      .eq('active', true);
    expect(count).toBeGreaterThanOrEqual(20);
  });

  it('lets a manager read but never write', async () => {
    const asManager = await clientFor(manager);
    const { data } = await asManager.from('business_categories').select('key').limit(1);
    expect(data).toHaveLength(1);
    const insert = await asManager
      .from('business_categories')
      .insert({ key, label_th: 'ทดสอบ', label_en: 'Test', label_zh: '测试' });
    expect(insert.error?.code).toBe('42501');
    const update = await asManager
      .from('business_categories')
      .update({ label_en: 'Changed' })
      .eq('key', 'clothing_fashion')
      .select('key');
    expect(update.data ?? []).toEqual([]);
  });

  it('shows a learner nothing', async () => {
    const { data } = await (await clientFor(learner)).from('business_categories').select('key');
    expect(data).toEqual([]);
  });

  it('lets the Owner add and retire a category, audited as the Owner', async () => {
    const asOwner = await clientFor(owner);
    const insert = await asOwner
      .from('business_categories')
      .insert({ key, label_th: 'ทดสอบ', label_en: 'Test', label_zh: '测试', sort_order: 999 });
    expect(insert.error).toBeNull();
    const retire = await asOwner
      .from('business_categories')
      .update({ active: false })
      .eq('key', key)
      .select('active');
    expect(retire.data).toEqual([{ active: false }]);
    const { data: audit } = await svc
      .from('audit_logs')
      .select('actor_id, action')
      .eq('entity_id', key)
      .order('created_at');
    expect(audit?.map((a) => a.action)).toEqual([
      'business_categories.insert',
      'business_categories.update',
    ]);
    expect(audit?.every((a) => a.actor_id === owner.id)).toBe(true);
  });
});
