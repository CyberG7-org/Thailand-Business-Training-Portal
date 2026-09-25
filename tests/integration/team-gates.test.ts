import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getCallSession } from '@/lib/db/calls';
import { askRecordDocuments } from '@/lib/db/dbd-index';
import { FakeVectorStore } from '@/lib/integrations/vector/fake';
import { adminClient, confirmRecord, deleteTeam, seedTeam, type Team } from './helpers';

const svc = adminClient();

/**
 * Three staff paths end in a service-role call: the vector store, a signed upload URL, and a
 * signed recording URL. Each is reached only through a read the caller's own client makes under
 * RLS, and these tests prove another team's id never gets past that read.
 */
describe('the service-role paths are gated by an RLS read', () => {
  let a: Team;
  let b: Team;

  beforeAll(async () => {
    a = await seedTeam('เกต');
    b = await seedTeam('เกตสอง');
    await confirmRecord(a.recordId, a.manager.id);
    await confirmRecord(b.recordId, b.manager.id);
  });

  afterAll(async () => {
    for (const team of [a, b]) await deleteTeam(team);
  });

  it('never asks the vector store about another team record', async () => {
    let searches = 0;
    const store = new FakeVectorStore(async () => {
      searches += 1;
      return [];
    });
    const { data: doc } = await svc
      .from('dbd_documents')
      .select('id')
      .eq('record_id', b.recordId)
      .single();
    await svc.from('dbd_documents').update({ index_status: 'ready' }).eq('id', doc!.id);

    const theirs = await askRecordDocuments(a.asManager, store, {
      recordId: b.recordId,
      question: 'บริษัทนี้ทำอะไร',
    });
    expect(theirs.error).toBe('not_indexed');
    expect(theirs.passages).toEqual([]);
    expect(searches).toBe(0);

    // The same question about their own indexed record does reach the store.
    const { data: own } = await svc
      .from('dbd_documents')
      .select('id')
      .eq('record_id', a.recordId)
      .single();
    await svc.from('dbd_documents').update({ index_status: 'ready' }).eq('id', own!.id);
    const mine = await askRecordDocuments(a.asManager, store, {
      recordId: a.recordId,
      question: 'บริษัทนี้ทำอะไร',
    });
    expect(mine.error).toBeNull();
    expect(searches).toBe(1);
  });

  it('refuses a signed upload URL under another team record', async () => {
    const theirs = await a.asManager.storage
      .from('dbd-documents')
      .createSignedUploadUrl(`${b.recordId}/${Date.now()}-stolen.pdf`);
    expect(theirs.error).not.toBeNull();

    const mine = await a.asManager.storage
      .from('dbd-documents')
      .createSignedUploadUrl(`${a.recordId}/${Date.now()}-own.pdf`);
    expect(mine.error).toBeNull();
  });

  it('hides another team call session before any recording could be signed', async () => {
    const { data: session } = await svc
      .from('call_sessions')
      .insert({
        user_id: b.learner.id,
        dbd_record_id: b.recordId,
        modality: 'fake',
        recording_path: `${crypto.randomUUID()}/${Date.now()}.mp3`,
      })
      .select()
      .single();

    expect(await getCallSession(a.asManager, session!.id)).toBeNull();
    const own = await getCallSession(b.asManager, session!.id);
    expect(own?.id).toBe(session!.id);
  });
});
