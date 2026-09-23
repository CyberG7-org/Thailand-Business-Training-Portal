import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  clientFor,
  confirmRecord,
  createTestUser,
  deleteTeam,
  deleteTestUser,
  seedTeam,
  type Client,
  type Team,
  type TestUser,
} from './helpers';

const svc = adminClient();

describe('one team cannot see another', () => {
  let a: Team;
  let b: Team;

  beforeAll(async () => {
    a = await seedTeam('เอ');
    b = await seedTeam('บี');
  });

  afterAll(async () => {
    for (const team of [a, b]) await deleteTeam(team);
  });

  it('shows a manager their own learner and nobody else', async () => {
    const { data, error } = await a.asManager.from('profiles').select('id, manager_id');
    expect(error).toBeNull();
    const ids = (data ?? []).map((p) => p.id);
    expect(ids).toContain(a.learner.id);
    expect(ids).not.toContain(b.learner.id);
    expect(ids).not.toContain(b.manager.id);
  });

  it('shows a manager their own records and documents only', async () => {
    const { data: records, error: recordsError } = await a.asManager
      .from('dbd_records')
      .select('id');
    expect(recordsError).toBeNull();
    expect((records ?? []).map((r) => r.id)).toEqual([a.recordId]);
    const { data: docs, error: docsError } = await a.asManager
      .from('dbd_documents')
      .select('record_id');
    expect(docsError).toBeNull();
    expect((docs ?? []).map((d) => d.record_id)).toEqual([a.recordId]);
  });

  it('refuses a document file belonging to another team', async () => {
    const mine = await a.asManager.storage.from('dbd-documents').download(a.documentPath);
    expect(mine.error).toBeNull();
    const theirs = await a.asManager.storage.from('dbd-documents').download(b.documentPath);
    expect(theirs.data).toBeNull();
  });

  it('refuses writing a record into another team, or moving a learner out of one', async () => {
    const { error: inserted } = await a.asManager
      .from('dbd_records')
      .insert({ company_name_th: 'บริษัท แอบ จำกัด', team_id: b.manager.id });
    expect(inserted).not.toBeNull();
    const { data: moved, error: movedError } = await a.asManager
      .from('dbd_records')
      .update({ team_id: a.manager.id })
      .eq('id', b.recordId)
      .select();
    expect(movedError).toBeNull();
    expect(moved ?? []).toEqual([]);

    const { data: poached, error: poachedError } = await a.asManager
      .from('profiles')
      .update({ manager_id: a.manager.id })
      .eq('id', b.learner.id)
      .select();
    expect(poachedError).toBeNull();
    expect(poached ?? []).toEqual([]);
    const { error: pushedAway } = await a.asManager
      .from('profiles')
      .update({ manager_id: b.manager.id })
      .eq('id', a.learner.id)
      .select();
    expect(pushedAway).not.toBeNull();
  });

  it('keeps a record the admin owns out of every manager view', async () => {
    const { data: mine } = await svc
      .from('dbd_records')
      .insert({ company_name_th: 'บริษัท ของแอดมิน จำกัด' })
      .select()
      .single();
    const { data: seenByA, error: seenError } = await a.asManager.from('dbd_records').select('id');
    expect(seenError).toBeNull();
    expect((seenByA ?? []).map((r) => r.id)).not.toContain(mine!.id);
    await svc.from('dbd_records').delete().eq('id', mine!.id);
  });

  it('lets a learner keep working while their manager is suspended', async () => {
    await svc.from('profiles').update({ status: 'disabled' }).eq('id', a.manager.id);
    const asLearner = await clientFor(a.learner);
    const { data, error } = await asLearner.from('profiles').select('id').eq('id', a.learner.id);
    expect(error).toBeNull();
    expect((data ?? []).map((p) => p.id)).toEqual([a.learner.id]);
    const { data: hidden, error: hiddenError } = await a.asManager.from('dbd_records').select('id');
    expect(hiddenError).toBeNull();
    expect(hidden ?? []).toEqual([]);
    await svc.from('profiles').update({ status: 'active' }).eq('id', a.manager.id);
  });

  it('hides another team transcripts, chunks, sweeps and jobs', async () => {
    const { data: doc } = await svc
      .from('dbd_documents')
      .select('id')
      .eq('record_id', b.recordId)
      .single();
    await svc
      .from('dbd_pages')
      .insert({ document_id: doc!.id, page: 1, text: 'ความลับ', model: 'fake' });
    await svc.from('dbd_chunks').insert({
      id: `${doc!.id}#1#0`,
      record_id: b.recordId,
      document_id: doc!.id,
      page: 1,
      chunk_index: 0,
      chunk_text: 'ความลับ',
      char_count: 7,
    });
    await svc
      .from('dbd_sweeps')
      .insert({ document_id: doc!.id, first_page: 1, last_page: 1, result: {} });
    await svc
      .from('index_jobs')
      .insert({ record_id: b.recordId, document_id: doc!.id, kind: 'index' });

    for (const table of ['dbd_pages', 'dbd_chunks', 'dbd_sweeps', 'index_jobs'] as const) {
      const { data, error } = await a.asManager.from(table).select('*');
      expect(error, table).toBeNull();
      expect(data ?? [], table).toEqual([]);
    }
    const { data: mine } = await b.asManager.from('dbd_chunks').select('record_id');
    expect((mine ?? []).map((c) => c.record_id)).toEqual([b.recordId]);
  });

  it('hides another team learner activity', async () => {
    await confirmRecord(b.recordId, b.manager.id);
    const { data: assignment } = await svc
      .from('user_dbd_assignments')
      .insert({ user_id: b.learner.id, dbd_record_id: b.recordId })
      .select()
      .single();
    expect(assignment).not.toBeNull();
    const { data: attempt } = await svc
      .from('assessment_attempts')
      .insert({
        user_id: b.learner.id,
        dbd_record_id: b.recordId,
        kind: 'quiz',
        language: 'th',
        attempt_no: 1,
        question_ids: [],
        shuffle_seed: 'seed',
      })
      .select()
      .single();
    expect(attempt).not.toBeNull();

    const { data: assignmentsSeen, error: assignmentsError } = await a.asManager
      .from('user_dbd_assignments')
      .select('user_id');
    expect(assignmentsError).toBeNull();
    expect((assignmentsSeen ?? []).map((r) => r.user_id)).not.toContain(b.learner.id);
    const { data: attemptsSeen, error: attemptsError } = await a.asManager
      .from('assessment_attempts')
      .select('user_id');
    expect(attemptsError).toBeNull();
    expect((attemptsSeen ?? []).map((r) => r.user_id)).not.toContain(b.learner.id);

    const { data: mine } = await b.asManager.from('assessment_attempts').select('user_id');
    expect((mine ?? []).map((r) => r.user_id)).toEqual([b.learner.id]);
  });

  it('still shows an admin everything', async () => {
    const admin = await createTestUser('admin');
    const asAdmin = await clientFor(admin);
    const { data } = await asAdmin.from('dbd_records').select('id');
    const ids = (data ?? []).map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([a.recordId, b.recordId]));
    await deleteTestUser(admin.id);
  });
});

describe('the shared library and the admin-only corners', () => {
  let team: Team;
  let admin: TestUser;
  let asAdmin: Client;

  beforeAll(async () => {
    team = await seedTeam('ซี');
    admin = await createTestUser('admin');
    asAdmin = await clientFor(admin);
  });

  afterAll(async () => {
    await deleteTeam(team);
    await deleteTestUser(admin.id);
  });

  it('lets a manager author and approve in the shared question bank', async () => {
    const { data, error } = await team.asManager
      .from('questions')
      .insert({ question_key: `mgr-${Date.now()}`, kind: 'generic', approval_status: 'draft' })
      .select()
      .single();
    expect(error).toBeNull();
    // Approval needs th, en and zh (spec §4.3), so the manager writes all three first.
    const { error: localized } = await team.asManager.from('question_localizations').insert(
      (['th', 'en', 'zh'] as const).map((language) => ({
        question_id: data!.id,
        language,
        prompt: `prompt ${language}`,
        options: [
          { key: 'A', text: 'A' },
          { key: 'B', text: 'B' },
        ],
        correct_key: 'A',
      })),
    );
    expect(localized).toBeNull();
    const { error: approved } = await team.asManager
      .from('questions')
      .update({ approval_status: 'approved' })
      .eq('id', data!.id);
    expect(approved).toBeNull();
    await svc.from('questions').delete().eq('id', data!.id);
  });

  it('lets a manager author a study card', async () => {
    const { data, error } = await team.asManager
      .from('study_materials')
      .insert({ content_key: `mgr-${Date.now()}`, type: 'card' })
      .select()
      .single();
    expect(error).toBeNull();
    await svc.from('study_materials').delete().eq('id', data!.id);
  });

  it('keeps policy settings, notifications and webhooks for the admin alone', async () => {
    const { data: policy, error: policyError } = await team.asManager
      .from('policy_config')
      .select('key');
    expect(policyError).toBeNull();
    expect(policy ?? []).toEqual([]);
    const { data: notifications, error: notificationsError } = await team.asManager
      .from('notifications')
      .select('id');
    expect(notificationsError).toBeNull();
    expect(notifications ?? []).toEqual([]);
    const { data: adminPolicy } = await asAdmin.from('policy_config').select('key');
    expect((adminPolicy ?? []).length).toBeGreaterThan(0);
  });

  it('shows a manager only their own team actions in the audit log', async () => {
    await svc.from('audit_logs').insert([
      { actor_id: team.manager.id, action: 'test.mine', entity_type: 'test', entity_id: 'x' },
      { actor_id: admin.id, action: 'test.theirs', entity_type: 'test', entity_id: 'y' },
    ]);
    const { data, error } = await team.asManager
      .from('audit_logs')
      .select('action')
      .like('action', 'test.%');
    expect(error).toBeNull();
    expect((data ?? []).map((r) => r.action)).toEqual(['test.mine']);
    await svc.from('audit_logs').delete().like('action', 'test.%');
  });
});
