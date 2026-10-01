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

const ROW = {
  kind: 'low_confidence',
  field: 'registered_capital',
  blocks: 'acceptance',
  detail: { confidence: 0.6, signature: 'registered_capital:0.6' },
};

/** The exception queue's own rules (spec §5.5, §6): one open row per problem, resolutions are explicit. */
describe('training_fact_exceptions', () => {
  let team: Team;
  let other: Team;
  let rowId: string;
  beforeAll(async () => {
    [team, other] = await Promise.all([seedTeam('ข้อยกเว้น'), seedTeam('ทีมอื่นข้อยกเว้น')]);
    await confirmRecord(team.recordId, team.manager.id);
  });
  afterAll(async () => {
    await svc.from('training_fact_exceptions').delete().eq('dbd_record_id', team.recordId);
    await Promise.all([deleteTeam(team), deleteTeam(other)]);
  });

  it('holds one open row per record, kind and field', async () => {
    const { data, error } = await svc
      .from('training_fact_exceptions')
      .insert({ ...ROW, dbd_record_id: team.recordId } as never)
      .select('id')
      .single();
    if (error) throw error;
    rowId = data.id;
    const dup = await svc
      .from('training_fact_exceptions')
      .insert({ ...ROW, dbd_record_id: team.recordId } as never);
    expect(dup.error?.code).toBe('23505');
    const badKind = await svc
      .from('training_fact_exceptions')
      .insert({ ...ROW, kind: 'typo', field: 'x', dbd_record_id: team.recordId } as never);
    expect(badKind.error?.code).toBe('23514');
  });

  it('is resolved only with a resolution and a time', async () => {
    const half = await svc
      .from('training_fact_exceptions')
      .update({ status: 'resolved' })
      .eq('id', rowId);
    expect(half.error?.code).toBe('23514');
    const full = await svc
      .from('training_fact_exceptions')
      .update({
        status: 'resolved',
        resolution: 'confirmed',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', rowId);
    expect(full.error).toBeNull();
    // A resolved row no longer holds the slot: the same problem may open again.
    const again = await svc
      .from('training_fact_exceptions')
      .insert({ ...ROW, dbd_record_id: team.recordId } as never)
      .select('id')
      .single();
    expect(again.error).toBeNull();
  });

  it('is read and resolved by the Owner and the owning manager, never by learners or anonymous', async () => {
    const mine = await team.asManager
      .from('training_fact_exceptions')
      .select('id')
      .eq('dbd_record_id', team.recordId);
    expect(mine.data!.length).toBe(2);
    const theirs = await other.asManager
      .from('training_fact_exceptions')
      .select('id')
      .eq('dbd_record_id', team.recordId);
    expect(theirs.data).toEqual([]);
    const learner = await (
      await clientFor(team.learner)
    )
      .from('training_fact_exceptions')
      .select('id');
    expect(learner.data).toEqual([]);
    expect((await anonClient().from('training_fact_exceptions').select('id')).data).toEqual([]);
    const insert = await team.asManager
      .from('training_fact_exceptions')
      .insert({ ...ROW, field: 'other', dbd_record_id: team.recordId } as never);
    expect(insert.error?.code).toBe('42501');
    const resolve = await team.asManager
      .from('training_fact_exceptions')
      .update({
        status: 'resolved',
        resolution: 'dismissed',
        note: 'ไม่เกี่ยว',
        resolved_by: team.manager.id,
        resolved_at: new Date().toISOString(),
      })
      .eq('dbd_record_id', team.recordId)
      .eq('status', 'open')
      .select('id');
    expect(resolve.error).toBeNull();
    expect(resolve.data).toHaveLength(1);
  });

  it('seeds the two thresholds', async () => {
    const { data } = await svc
      .from('policy_config')
      .select('key, value')
      .in('key', ['training_auto_accept_confidence_percent', 'training_review_confidence_percent'])
      .order('key');
    expect(data).toEqual([
      { key: 'training_auto_accept_confidence_percent', value: 95 },
      { key: 'training_review_confidence_percent', value: 75 },
    ]);
  });
});
