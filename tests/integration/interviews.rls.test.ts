import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, clientFor, deleteTeam, seedTeam, type Team } from './helpers';

const svc = adminClient();

/** Spec §7: a session and its turns are the learner's, their manager's and the admin's — nobody else's. */
describe('interview sessions under RLS', () => {
  let a: Team;
  let b: Team;
  let sessionId: string;

  beforeAll(async () => {
    a = await seedTeam('สัมภาษณ์เอ');
    b = await seedTeam('สัมภาษณ์บี');
    const { data, error } = await svc
      .from('interview_sessions')
      .insert({
        user_id: a.learner.id,
        dbd_record_id: a.recordId,
        status: 'completed',
        verdict: 'ready',
        plan: { items: [], cursor: 0 },
        provider: 'fake',
      })
      .select('id')
      .single();
    if (error) throw error;
    sessionId = data.id;
    const { error: turnError } = await svc.from('interview_turns').insert([
      { session_id: sessionId, seq: 1, role: 'officer', content: 'สวัสดีค่ะ' },
      { session_id: sessionId, seq: 2, role: 'learner', content: 'สวัสดีครับ' },
    ]);
    if (turnError) throw turnError;
  });

  afterAll(async () => {
    await svc.from('interview_sessions').delete().eq('id', sessionId);
    await deleteTeam(a);
    await deleteTeam(b);
  });

  it('shows the learner their own session and its turns', async () => {
    const me = await clientFor(a.learner);
    const { data } = await me.from('interview_sessions').select('id').eq('id', sessionId);
    expect(data).toHaveLength(1);
    const { data: turns } = await me
      .from('interview_turns')
      .select('seq')
      .eq('session_id', sessionId);
    expect(turns).toHaveLength(2);
  });

  it('shows the manager their team, and another team nothing', async () => {
    const { data: mine } = await a.asManager
      .from('interview_sessions')
      .select('id')
      .eq('id', sessionId);
    expect(mine).toHaveLength(1);
    const { data: theirs } = await b.asManager
      .from('interview_sessions')
      .select('id')
      .eq('id', sessionId);
    expect(theirs).toEqual([]);
    const { data: turns } = await b.asManager
      .from('interview_turns')
      .select('seq')
      .eq('session_id', sessionId);
    expect(turns).toEqual([]);
  });

  it('refuses a learner who tries to write a session or a turn', async () => {
    const me = await clientFor(a.learner);
    const { error } = await me.from('interview_sessions').insert({
      user_id: a.learner.id,
      dbd_record_id: a.recordId,
      status: 'in_progress',
      plan: {},
      provider: 'fake',
    });
    expect(error?.code).toBe('42501');
    const { error: turnError } = await me
      .from('interview_turns')
      .insert({ session_id: sessionId, seq: 3, role: 'learner', content: 'x' });
    expect(turnError?.code).toBe('42501');
  });

  it('carried the exam-pass policy over under its new key', async () => {
    const { data } = await svc
      .from('policy_config')
      .select('key')
      .in('key', [
        'require_exam_pass_for_bank_call',
        'require_exam_pass_for_interview',
        'call_max_sessions',
      ]);
    const keys = (data ?? []).map((r) => r.key);
    expect(keys).toContain('require_exam_pass_for_interview');
    expect(keys).not.toContain('require_exam_pass_for_bank_call');
    expect(keys).not.toContain('call_max_sessions');
  });
});
