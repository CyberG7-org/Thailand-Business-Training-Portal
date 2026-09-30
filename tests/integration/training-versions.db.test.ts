import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  anonClient,
  clientFor,
  confirmRecord,
  deleteTeam,
  seedTeam,
  type Team,
} from './helpers';

const svc = adminClient();

const SHEET = {
  facts: { company_name_th: 'บริษัท รุ่น จำกัด', juristic_id: '0105568233704' },
  extras: {},
  provenance: {},
  coverage: { mcq: { ready: 2, total: 29 }, interview: { ready: 2, total: 12 }, missingFacts: [] },
  company_complete: false,
  facts_hash: 'h1',
  source_updated_at: new Date().toISOString(),
};

async function insertVersion(recordId: string, patch: Record<string, unknown>) {
  return svc
    .from('company_training_versions')
    .insert({ ...SHEET, dbd_record_id: recordId, ...patch } as never)
    .select('id, version_no, status')
    .single();
}

/** The version table's own rules (spec §5.6, D75): frozen once active, one active per record. */
describe('company_training_versions', () => {
  let team: Team;
  let other: Team;
  let v1: string;
  beforeAll(async () => {
    [team, other] = await Promise.all([seedTeam('รุ่น'), seedTeam('ทีมอื่น')]);
    await confirmRecord(team.recordId, team.manager.id);
  });
  afterAll(async () => {
    await svc.from('user_dbd_assignments').delete().eq('dbd_record_id', team.recordId);
    await svc.from('company_training_versions').delete().eq('dbd_record_id', team.recordId);
    await Promise.all([deleteTeam(team), deleteTeam(other)]);
  });

  it('activates a draft, and then keeps its sheet frozen', async () => {
    const { data, error } = await insertVersion(team.recordId, { version_no: 1 });
    if (error) throw error;
    v1 = data.id;
    const activate = await svc
      .from('company_training_versions')
      .update({ status: 'active', activated_at: new Date().toISOString() })
      .eq('id', v1);
    expect(activate.error).toBeNull();
    const edit = await svc
      .from('company_training_versions')
      .update({ facts_hash: 'h2' } as never)
      .eq('id', v1);
    expect(edit.error?.code).toBe('23514');
    const back = await svc
      .from('company_training_versions')
      .update({ status: 'draft' })
      .eq('id', v1);
    expect(back.error?.code).toBe('23514');
  });

  it('allows one active version per record, and no way back from superseded', async () => {
    const second = await insertVersion(team.recordId, {
      version_no: 2,
      status: 'active',
      activated_at: new Date().toISOString(),
    });
    expect(second.error?.code).toBe('23505');
    const supersede = await svc
      .from('company_training_versions')
      .update({ status: 'superseded', superseded_at: new Date().toISOString() })
      .eq('id', v1);
    expect(supersede.error).toBeNull();
    const revive = await svc
      .from('company_training_versions')
      .update({ status: 'active' })
      .eq('id', v1);
    expect(revive.error?.code).toBe('23514');
  });

  it('refuses an active version without an activation time', async () => {
    const { error } = await insertVersion(team.recordId, { version_no: 3, status: 'active' });
    expect(error?.code).toBe('23514');
  });

  it('pins an assignment only to a version of its own record', async () => {
    const { data: v2, error } = await insertVersion(team.recordId, {
      version_no: 4,
      status: 'active',
      activated_at: new Date().toISOString(),
      company_complete: true,
    });
    if (error) throw error;
    const { data: a, error: aError } = await svc
      .from('user_dbd_assignments')
      .insert({
        user_id: team.learner.id,
        dbd_record_id: team.recordId,
        training_version_id: v2.id,
      })
      .select('id')
      .single();
    if (aError) throw aError;
    const { data: foreign } = await insertVersion(other.recordId, { version_no: 1 });
    const wrong = await svc
      .from('user_dbd_assignments')
      .update({ training_version_id: foreign!.id })
      .eq('id', a.id);
    expect(wrong.error?.code).toBe('23514');
    // A confirmed role is a snapshot with a date, or nothing.
    const half = await svc
      .from('user_dbd_assignments')
      .update({ role_snapshot: { holder_name: 'x' } as never })
      .eq('id', a.id);
    expect(half.error?.code).toBe('23514');
  });

  it('is read by the Owner, the owning manager and the pinned learner; written by nobody signed in', async () => {
    const mine = await team.asManager
      .from('company_training_versions')
      .select('id')
      .eq('dbd_record_id', team.recordId);
    expect(mine.data!.length).toBeGreaterThan(0);
    const theirs = await other.asManager
      .from('company_training_versions')
      .select('id')
      .eq('dbd_record_id', team.recordId);
    expect(theirs.data).toEqual([]);
    const asLearner = await clientFor(team.learner);
    const pinned = await asLearner.from('company_training_versions').select('version_no');
    expect(pinned.data).toEqual([{ version_no: 4 }]);
    const unpinnedLearner = await (
      await clientFor(other.learner)
    )
      .from('company_training_versions')
      .select('id');
    expect(unpinnedLearner.data).toEqual([]);
    expect((await anonClient().from('company_training_versions').select('id')).data).toEqual([]);
    const write = await team.asManager
      .from('company_training_versions')
      .insert({ ...SHEET, dbd_record_id: team.recordId, version_no: 9 } as never);
    expect(write.error?.code).toBe('42501');
  });
});
