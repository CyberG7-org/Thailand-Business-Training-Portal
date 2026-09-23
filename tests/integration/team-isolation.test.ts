import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  clientFor,
  createTestLearnerIn,
  createTestManager,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

const svc = adminClient();
const fixture = readFileSync('tests/fixtures/three-pages.pdf');

export type Team = {
  manager: TestUser;
  learner: TestUser;
  asManager: Client;
  recordId: string;
  documentPath: string;
};

/** A manager, one learner of theirs, and one company record with a document. */
async function seedTeam(label: string): Promise<Team> {
  const manager = await createTestManager({ displayName: label });
  const learner = await createTestLearnerIn(manager, { displayName: `${label} learner` });
  const { data: record, error } = await svc
    .from('dbd_records')
    .insert({
      company_name_th: `บริษัท ${label} จำกัด`,
      team_id: manager.id,
      created_by: manager.id,
    })
    .select()
    .single();
  if (error) throw error;
  const documentPath = `${record.id}/${Date.now()}-1.pdf`;
  await svc.storage
    .from('dbd-documents')
    .upload(documentPath, fixture, { contentType: 'application/pdf' });
  const { error: docError } = await svc.from('dbd_documents').insert({
    record_id: record.id,
    path: documentPath,
    original_name: 'pack.pdf',
    size_bytes: fixture.byteLength,
    position: 1,
    page_count: 3,
    index_status: 'ready',
  });
  if (docError) throw docError;
  return {
    manager,
    learner,
    asManager: await clientFor(manager),
    recordId: record.id,
    documentPath,
  };
}

describe('one team cannot see another', () => {
  let a: Team;
  let b: Team;

  beforeAll(async () => {
    a = await seedTeam('เอ');
    b = await seedTeam('บี');
  });

  afterAll(async () => {
    for (const team of [a, b]) {
      await svc.storage.from('dbd-documents').remove([team.documentPath]);
      await svc.from('dbd_records').delete().eq('id', team.recordId);
      await deleteTestUser(team.learner.id);
      await deleteTestUser(team.manager.id);
    }
  });

  it('shows a manager their own learner and nobody else', async () => {
    const { data } = await a.asManager.from('profiles').select('id, manager_id');
    const ids = (data ?? []).map((p) => p.id);
    expect(ids).toContain(a.learner.id);
    expect(ids).not.toContain(b.learner.id);
    expect(ids).not.toContain(b.manager.id);
  });

  it('shows a manager their own records and documents only', async () => {
    const { data: records } = await a.asManager.from('dbd_records').select('id');
    expect((records ?? []).map((r) => r.id)).toEqual([a.recordId]);
    const { data: docs } = await a.asManager.from('dbd_documents').select('record_id');
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
    const { data: moved } = await a.asManager
      .from('dbd_records')
      .update({ team_id: a.manager.id })
      .eq('id', b.recordId)
      .select();
    expect(moved ?? []).toEqual([]);

    const { data: poached } = await a.asManager
      .from('profiles')
      .update({ manager_id: a.manager.id })
      .eq('id', b.learner.id)
      .select();
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
    const { data: seenByA } = await a.asManager.from('dbd_records').select('id');
    expect((seenByA ?? []).map((r) => r.id)).not.toContain(mine!.id);
    await svc.from('dbd_records').delete().eq('id', mine!.id);
  });

  it('lets a learner keep working while their manager is suspended', async () => {
    await svc.from('profiles').update({ status: 'disabled' }).eq('id', a.manager.id);
    const asLearner = await clientFor(a.learner);
    const { data, error } = await asLearner.from('profiles').select('id').eq('id', a.learner.id);
    expect(error).toBeNull();
    expect((data ?? []).map((p) => p.id)).toEqual([a.learner.id]);
    const { data: hidden } = await a.asManager.from('dbd_records').select('id');
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
      const { data } = await a.asManager.from(table).select('*');
      expect(data ?? []).toEqual([]);
    }
    const { data: mine } = await b.asManager.from('dbd_chunks').select('record_id');
    expect((mine ?? []).map((c) => c.record_id)).toEqual([b.recordId]);
  });

  it('hides another team learner activity', async () => {
    // A learner can only be assigned to a confirmed record, and confirming one needs its
    // core fields (dbd_confirmed_requires_core_fields).
    const { error: confirmError } = await svc
      .from('dbd_records')
      .update({
        extraction_status: 'confirmed',
        juristic_id: String(Date.now()).padStart(13, '0').slice(-13),
        confirmed_by: b.manager.id,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', b.recordId);
    expect(confirmError).toBeNull();
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

    const { data: assignmentsSeen } = await a.asManager
      .from('user_dbd_assignments')
      .select('user_id');
    expect((assignmentsSeen ?? []).map((r) => r.user_id)).not.toContain(b.learner.id);
    const { data: attemptsSeen } = await a.asManager.from('assessment_attempts').select('user_id');
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
