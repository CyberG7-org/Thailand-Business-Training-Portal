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

  it('still shows an admin everything', async () => {
    const admin = await createTestUser('admin');
    const asAdmin = await clientFor(admin);
    const { data } = await asAdmin.from('dbd_records').select('id');
    const ids = (data ?? []).map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([a.recordId, b.recordId]));
    await deleteTestUser(admin.id);
  });
});
