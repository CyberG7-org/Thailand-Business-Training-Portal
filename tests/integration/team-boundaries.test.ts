import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  anonClient,
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
const pdf = Buffer.from('%PDF-1.4\nboundary test\n');

/** The write side of the boundary: what a manager may put into the database, not only read out. */
describe('the team boundary holds on writes, deletes and buckets', () => {
  let a: Team;
  let b: Team;
  let admin: TestUser;
  let asAdmin: Client;

  beforeAll(async () => {
    a = await seedTeam('ดี');
    b = await seedTeam('อี');
    await confirmRecord(a.recordId, a.manager.id);
    await confirmRecord(b.recordId, b.manager.id);
    admin = await createTestUser('admin');
    asAdmin = await clientFor(admin);
  });

  afterAll(async () => {
    for (const team of [a, b]) await deleteTeam(team);
    await deleteTestUser(admin.id);
  });

  it('keeps the study-material and TTS buckets working for staff', async () => {
    const path = `boundary/${Date.now()}.pdf`;
    const byAdmin = await asAdmin.storage
      .from('study-materials')
      .upload(path, pdf, { contentType: 'application/pdf' });
    expect(byAdmin.error).toBeNull();
    const byManager = await a.asManager.storage
      .from('study-materials')
      .upload(`boundary/${Date.now()}-m.pdf`, pdf, { contentType: 'application/pdf' });
    expect(byManager.error).toBeNull();
    const byLearner = await (
      await clientFor(a.learner)
    ).storage
      .from('study-materials')
      .upload(`boundary/${Date.now()}-l.pdf`, pdf, { contentType: 'application/pdf' });
    expect(byLearner.error).not.toBeNull();

    const cached = await asAdmin.storage
      .from('tts-cache')
      .upload(`boundary/${Date.now()}.mp3`, Buffer.from('id3'), { contentType: 'audio/mpeg' });
    expect(cached.error).toBeNull();

    await svc.storage.from('study-materials').remove([path]);
  });

  it('refuses assigning another team record, or assigning anyone but a learner of the team', async () => {
    const { error: foreignRecord } = await a.asManager
      .from('user_dbd_assignments')
      .insert({ user_id: a.learner.id, dbd_record_id: b.recordId });
    expect(foreignRecord).not.toBeNull();

    const { error: self } = await a.asManager
      .from('user_dbd_assignments')
      .insert({ user_id: a.manager.id, dbd_record_id: b.recordId });
    expect(self).not.toBeNull();

    const { error: own } = await a.asManager
      .from('user_dbd_assignments')
      .insert({ user_id: a.learner.id, dbd_record_id: a.recordId });
    expect(own).toBeNull();
    await svc.from('user_dbd_assignments').delete().eq('user_id', a.learner.id);
  });

  it('refuses queueing a job that points at another team document', async () => {
    const { data: theirDoc } = await svc
      .from('dbd_documents')
      .select('id')
      .eq('record_id', b.recordId)
      .single();
    const { error: crossed } = await a.asManager
      .from('index_jobs')
      .insert({ record_id: a.recordId, document_id: theirDoc!.id, kind: 'transcript' });
    expect(crossed).not.toBeNull();

    const { data: myDoc } = await svc
      .from('dbd_documents')
      .select('id')
      .eq('record_id', a.recordId)
      .single();
    const { error: mine } = await a.asManager
      .from('index_jobs')
      .insert({ record_id: a.recordId, document_id: myDoc!.id, kind: 'transcript' });
    expect(mine).toBeNull();
    await svc.from('index_jobs').delete().eq('record_id', a.recordId);
  });

  it('refuses registering a document whose path points at another team', async () => {
    const { error: crossed } = await a.asManager.from('dbd_documents').insert({
      record_id: a.recordId,
      path: `${b.recordId}/stolen-${Date.now()}.pdf`,
      original_name: 'stolen.pdf',
      size_bytes: 10,
      position: 9,
    });
    expect(crossed).not.toBeNull();

    const { error: mine } = await a.asManager.from('dbd_documents').insert({
      record_id: a.recordId,
      path: `${a.recordId}/own-${Date.now()}.pdf`,
      original_name: 'own.pdf',
      size_bytes: 10,
      position: 9,
    });
    expect(mine).toBeNull();
  });

  it('shows a manager the recordings and name cards of their own team', async () => {
    const { data: session } = await svc
      .from('call_sessions')
      .insert({ user_id: a.learner.id, dbd_record_id: a.recordId, modality: 'fake' })
      .select()
      .single();
    const recordingPath = `${session!.id}/${Date.now()}.mp3`;
    await svc.storage
      .from('recordings')
      .upload(recordingPath, Buffer.from('id3'), { contentType: 'audio/mpeg' });
    const cardPath = `${a.learner.id}/${Date.now()}.pdf`;
    await svc.storage.from('name-cards').upload(cardPath, pdf, { contentType: 'application/pdf' });

    const recording = await a.asManager.storage.from('recordings').download(recordingPath);
    expect(recording.error).toBeNull();
    const card = await a.asManager.storage.from('name-cards').download(cardPath);
    expect(card.error).toBeNull();

    const theirs = await b.asManager.storage.from('recordings').download(recordingPath);
    expect(theirs.data).toBeNull();
    const theirCard = await b.asManager.storage.from('name-cards').download(cardPath);
    expect(theirCard.data).toBeNull();
  });

  it('refuses a manager deleting a recording or a name card', async () => {
    const { data: session } = await svc
      .from('call_sessions')
      .insert({ user_id: a.learner.id, dbd_record_id: a.recordId, modality: 'fake' })
      .select()
      .single();
    const recordingPath = `${session!.id}/${Date.now()}-del.mp3`;
    await svc.storage
      .from('recordings')
      .upload(recordingPath, Buffer.from('id3'), { contentType: 'audio/mpeg' });
    const cardPath = `${a.learner.id}/${Date.now()}-del.pdf`;
    await svc.storage.from('name-cards').upload(cardPath, pdf, { contentType: 'application/pdf' });

    await a.asManager.storage.from('recordings').remove([recordingPath]);
    await a.asManager.storage.from('name-cards').remove([cardPath]);

    const recording = await svc.storage.from('recordings').download(recordingPath);
    expect(recording.error).toBeNull();
    const card = await svc.storage.from('name-cards').download(cardPath);
    expect(card.error).toBeNull();
  });

  it('refuses a manager deleting one of their learners', async () => {
    const { data: gone } = await a.asManager
      .from('profiles')
      .delete()
      .eq('id', a.learner.id)
      .select();
    expect(gone ?? []).toEqual([]);
    const { data: still } = await svc.from('profiles').select('id').eq('id', a.learner.id);
    expect((still ?? []).map((p) => p.id)).toEqual([a.learner.id]);
  });

  it('refuses an anonymous caller the team helpers', async () => {
    const anon = anonClient();
    for (const fn of ['is_manager', 'is_staff', 'my_team'] as const) {
      const { error } = await anon.rpc(fn);
      expect(error, fn).not.toBeNull();
    }
    const { error } = await anon.rpc('in_my_team', { p_user: a.learner.id });
    expect(error).not.toBeNull();
  });

  it('refuses demoting a manager who still has learners', async () => {
    const { error } = await svc.from('profiles').update({ role: 'learner' }).eq('id', a.manager.id);
    expect(error).not.toBeNull();

    const { data: still } = await svc.from('profiles').select('role').eq('id', a.manager.id);
    expect((still ?? []).map((p) => p.role)).toEqual(['manager']);
  });
});
