import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, clientFor, deleteTeam, seedTeam, type Team } from './helpers';

const svc = adminClient();

/** D102: a booking is the learner's, their manager's and the admin's; writes use the service layer. */
describe('appointments under RLS', () => {
  let a: Team;
  let b: Team;
  let bookingId: string;
  let blockId: string;

  beforeAll(async () => {
    a = await seedTeam('นัดหมายเอ');
    b = await seedTeam('นัดหมายบี');
    const { data: booking, error } = await svc
      .from('appointments')
      .insert({
        user_id: a.learner.id,
        team_id: a.manager.id,
        dbd_record_id: a.recordId,
        starts_at: '2026-11-09T02:00:00Z',
        ends_at: '2026-11-09T03:00:00Z',
        status: 'booked',
      })
      .select('id')
      .single();
    if (error) throw error;
    bookingId = booking.id;
    const { data: block, error: blockError } = await svc
      .from('appointment_blocks')
      .insert({
        team_id: a.manager.id,
        starts_at: '2026-11-10T02:00:00Z',
        ends_at: '2026-11-10T09:00:00Z',
        reason: 'ประชุม',
        created_by: a.manager.id,
      })
      .select('id')
      .single();
    if (blockError) throw blockError;
    blockId = block.id;
  });

  afterAll(async () => {
    await svc.from('appointments').delete().eq('id', bookingId);
    await svc.from('appointment_blocks').delete().eq('id', blockId);
    await deleteTeam(a);
    await deleteTeam(b);
  });

  it('shows the learner their own booking and no block', async () => {
    const me = await clientFor(a.learner);
    const { data } = await me.from('appointments').select('id').eq('id', bookingId);
    expect(data).toHaveLength(1);
    const { data: blocks } = await me.from('appointment_blocks').select('id');
    expect(blocks).toEqual([]);
  });

  it('shows the manager their team and another team nothing', async () => {
    expect(
      (await a.asManager.from('appointments').select('id').eq('id', bookingId)).data,
    ).toHaveLength(1);
    expect(
      (await a.asManager.from('appointment_blocks').select('id').eq('id', blockId)).data,
    ).toHaveLength(1);
    expect((await b.asManager.from('appointments').select('id').eq('id', bookingId)).data).toEqual(
      [],
    );
    expect(
      (await b.asManager.from('appointment_blocks').select('id').eq('id', blockId)).data,
    ).toEqual([]);
  });

  it('refuses a learner and a manager who write directly', async () => {
    const me = await clientFor(a.learner);
    const { error } = await me.from('appointments').insert({
      user_id: a.learner.id,
      team_id: a.manager.id,
      dbd_record_id: a.recordId,
      starts_at: '2026-11-11T02:00:00Z',
      ends_at: '2026-11-11T03:00:00Z',
      status: 'booked',
    });
    expect(error?.code).toBe('42501');
    const { error: blockError } = await a.asManager.from('appointment_blocks').insert({
      team_id: a.manager.id,
      starts_at: '2026-11-11T02:00:00Z',
      ends_at: '2026-11-11T03:00:00Z',
      created_by: a.manager.id,
    });
    expect(blockError?.code).toBe('42501');
  });

  it('holds one booked date per learner and lets learners share a date', async () => {
    const sameLearner = await svc.from('appointments').insert({
      user_id: a.learner.id,
      team_id: a.manager.id,
      dbd_record_id: a.recordId,
      starts_at: '2026-11-12T05:00:00Z',
      ends_at: '2026-11-12T06:00:00Z',
      status: 'booked',
    });
    expect(sameLearner.error?.code).toBe('23505');

    const sameDate = await svc
      .from('appointments')
      .insert({
        user_id: a.manager.id,
        team_id: a.manager.id,
        dbd_record_id: a.recordId,
        starts_at: '2026-11-09T05:00:00Z',
        ends_at: '2026-11-09T06:00:00Z',
        status: 'booked',
      })
      .select('id')
      .single();
    expect(sameDate.error).toBeNull();

    const other = await svc
      .from('appointments')
      .insert({
        user_id: b.learner.id,
        team_id: b.manager.id,
        dbd_record_id: b.recordId,
        starts_at: '2026-11-09T02:00:00Z',
        ends_at: '2026-11-09T03:00:00Z',
        status: 'booked',
      })
      .select('id')
      .single();
    expect(other.error).toBeNull();
    await svc.from('appointments').delete().eq('id', sameDate.data!.id);
    await svc.from('appointments').delete().eq('id', other.data!.id);
  });
});
