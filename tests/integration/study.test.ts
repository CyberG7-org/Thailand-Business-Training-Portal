import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createStudyMaterial,
  getStudyMaterialByKey,
  getMyStudyProgress,
  listStudyMaterials,
  loadStarterCards,
  markCompleted,
  markViewed,
  pickLocalization,
  upsertLocalization,
} from '@/lib/db/study';
import { getOrCreateTtsAudioUrl } from '@/lib/db/tts';
import { ttsCachePath } from '@/lib/integrations/tts/cache-key';
import { FakeTts } from '@/lib/integrations/tts/fake';
import {
  adminClient,
  clientFor,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

describe('study material', () => {
  let admin: TestUser;
  let learner: TestUser;
  let other: TestUser;
  let asAdmin: Client;
  let asLearner: Client;
  let asOther: Client;
  let activeId: string;
  let inactiveId: string;
  const key = `it-study-${Date.now()}`;

  beforeAll(async () => {
    [admin, learner, other] = await Promise.all([
      createTestUser('admin'),
      createTestUser('learner'),
      createTestUser('learner'),
    ]);
    [asAdmin, asLearner, asOther] = await Promise.all([
      clientFor(admin),
      clientFor(learner),
      clientFor(other),
    ]);
    activeId = (
      await createStudyMaterial(
        asAdmin,
        { contentKey: key, type: 'card', sortOrder: 99, active: true },
        admin.id,
      )
    ).id;
    inactiveId = (
      await createStudyMaterial(
        asAdmin,
        { contentKey: `${key}-inactive`, type: 'card', sortOrder: 100, active: false },
        admin.id,
      )
    ).id;
    await upsertLocalization(asAdmin, activeId, {
      language: 'th',
      title: 'ทดสอบ',
      body: 'เนื้อหา',
      ttsEnabled: true,
    });
    await upsertLocalization(asAdmin, activeId, {
      language: 'en',
      title: 'Test',
      body: 'Body',
      ttsEnabled: true,
    });
  });

  afterAll(async () => {
    const svc = adminClient();
    await svc.from('study_materials').delete().in('id', [activeId, inactiveId]);
    await Promise.all([admin, learner, other].map((u) => deleteTestUser(u.id)));
  });

  it('learners see only active materials, with their localizations', async () => {
    const list = await listStudyMaterials(asLearner);
    const ids = list.map((m) => m.id);
    expect(ids).toContain(activeId);
    expect(ids).not.toContain(inactiveId);
    const mine = list.find((m) => m.id === activeId)!;
    expect(pickLocalization(mine, 'th')?.title).toBe('ทดสอบ');
    expect(pickLocalization(mine, 'zh')).toBeNull();
  });

  it('refreshes the five shipped cards and retires the three legacy samples', async () => {
    const svc = adminClient();
    const starterKey = `${key}-starter`;
    const material = await createStudyMaterial(
      asAdmin,
      { contentKey: starterKey, type: 'card', sortOrder: 999, active: false },
      admin.id,
    );
    await upsertLocalization(asAdmin, material.id, {
      language: 'th',
      title: 'เนื้อหาเดิม',
      body: 'เนื้อหาเดิม',
      ttsEnabled: true,
    });
    await svc
      .from('study_materials')
      .update({ active: true })
      .in('content_key', ['sample-dbd-certificate', 'sample-company-facts', 'sample-bank-visit']);

    try {
      const result = await loadStarterCards(
        asAdmin,
        [
          {
            contentKey: starterKey,
            sortOrder: 7,
            conceptGroup: 'identity',
            localizations: {
              th: { title: 'ข้อมูลใหม่', body: 'คำตอบใหม่' },
              en: { title: 'New facts', body: 'New answer' },
              zh: { title: '新资料', body: '新答案' },
            },
          },
        ],
        admin.id,
      );
      expect(result).toEqual({ created: [], skipped: [starterKey] });

      const refreshed = await getStudyMaterialByKey(asAdmin, starterKey);
      expect(refreshed).toMatchObject({ active: true, sort_order: 7 });
      expect(pickLocalization(refreshed!, 'th')).toMatchObject({
        title: 'ข้อมูลใหม่',
        body: 'คำตอบใหม่',
      });
      expect(pickLocalization(refreshed!, 'en')).toMatchObject({
        title: 'New facts',
        body: 'New answer',
      });

      const { data: legacy, error } = await svc
        .from('study_materials')
        .select('active')
        .in('content_key', ['sample-dbd-certificate', 'sample-company-facts', 'sample-bank-visit']);
      if (error) throw error;
      expect(legacy).toHaveLength(3);
      expect(legacy.every((row) => row.active === false)).toBe(true);
    } finally {
      await svc.from('study_materials').delete().eq('id', material.id);
    }
  });

  it('tts_enabled is only honoured on the Thai localization', async () => {
    const list = await listStudyMaterials(asAdmin);
    const mine = list.find((m) => m.id === activeId)!;
    expect(pickLocalization(mine, 'th')?.tts_enabled).toBe(true);
    expect(pickLocalization(mine, 'en')?.tts_enabled).toBe(false);
  });

  it('learners cannot write materials or localizations', async () => {
    const { error } = await asLearner
      .from('study_materials')
      .insert({ content_key: `${key}-hack`, type: 'card' });
    expect(error?.code).toBe('42501');
    const { data } = await asLearner
      .from('study_material_localizations')
      .update({ title: 'hacked' })
      .eq('material_id', activeId)
      .select();
    expect(data).toEqual([]);
  });

  it('records viewed then completed progress, visible only to the owner', async () => {
    await markViewed(asLearner, learner.id, activeId);
    await markViewed(asLearner, learner.id, activeId);
    let rows = await getMyStudyProgress(asLearner, learner.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].completed_at).toBeNull();

    await markCompleted(asLearner, learner.id, activeId);
    rows = await getMyStudyProgress(asLearner, learner.id);
    expect(rows[0].completed_at).not.toBeNull();

    expect(await getMyStudyProgress(asOther, learner.id)).toEqual([]);
    const { error } = await asOther
      .from('study_progress')
      .insert({ user_id: learner.id, material_id: activeId });
    expect(error?.code).toBe('42501');
  });

  it('caches synthesized audio in the tts-cache bucket and reuses it', async () => {
    const tts = new FakeTts();
    const text = `it-tts-${Date.now()}`;
    const first = await getOrCreateTtsAudioUrl(text, tts);
    const second = await getOrCreateTtsAudioUrl(text, tts);
    expect(first).toContain('tts-cache');
    expect(second).toContain('tts-cache');
    expect(tts.spoken).toEqual([text]);
    await adminClient()
      .storage.from('tts-cache')
      .remove([ttsCachePath(text, tts.voiceId)]);
  });
});
