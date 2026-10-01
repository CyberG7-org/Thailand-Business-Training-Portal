import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  getLearnerHeader,
  listExamAttempts,
  listInterviewSessions,
  loadLearnerRecords,
} from '@/lib/db/learner-record';
import { adminClient, confirmRecord, deleteTeam, seedTeam, type Team } from './helpers';

const svc = adminClient();

async function examAttempt(userId: string, recordId: string, no: number, result: 'pass' | 'fail') {
  const { error } = await svc.from('assessment_attempts').insert({
    user_id: userId,
    dbd_record_id: recordId,
    kind: 'exam',
    language: 'th',
    attempt_no: no,
    status: 'submitted',
    question_ids: [],
    shuffle_seed: `seed-${no}`,
    passing_mark_snapshot: 80,
    score: result === 'pass' ? 18 : 10,
    max_score: 20,
    result,
    started_at: `2026-10-0${no}T02:00:00Z`,
    submitted_at: `2026-10-0${no}T03:00:00Z`,
  });
  if (error) throw error;
}

async function interviewSession(
  userId: string,
  recordId: string,
  startedAt: string,
  status: string,
  verdict: 'ready' | 'not_ready' | null,
) {
  const { error } = await svc.from('interview_sessions').insert({
    user_id: userId,
    dbd_record_id: recordId,
    status,
    verdict,
    plan: { items: [], cursor: 0 },
    provider: 'fake',
    started_at: startedAt,
  });
  if (error) throw error;
}

/**
 * D82: the Learner Record reads through the caller's own client, so a manager sees their team's
 * learners, results and histories, and another team's learner is simply not there.
 */
describe('Learner Record', () => {
  let team: Team;
  let other: Team;
  beforeAll(async () => {
    team = await seedTeam('บันทึกผู้เรียน');
    other = await seedTeam('ทีมอื่นบันทึก');
    await confirmRecord(team.recordId, team.manager.id);
    await svc.from('dbd_records').update({ issued_on: '2026-04-09' }).eq('id', team.recordId);
    await svc
      .from('user_dbd_assignments')
      .insert({ user_id: team.learner.id, dbd_record_id: team.recordId });
    await examAttempt(team.learner.id, team.recordId, 1, 'fail');
    await examAttempt(team.learner.id, team.recordId, 2, 'pass');
    await interviewSession(
      team.learner.id,
      team.recordId,
      '2026-10-05T02:00:00Z',
      'completed',
      'not_ready',
    );
    await interviewSession(
      team.learner.id,
      team.recordId,
      '2026-10-06T02:00:00Z',
      'completed',
      'ready',
    );
    await interviewSession(
      team.learner.id,
      team.recordId,
      '2026-10-07T02:00:00Z',
      'abandoned',
      null,
    );
  });
  afterAll(async () => {
    for (const t of [team, other]) {
      await svc.from('interview_sessions').delete().eq('user_id', t.learner.id);
      await svc.from('assessment_attempts').delete().eq('user_id', t.learner.id);
      await svc.from('user_dbd_assignments').delete().eq('user_id', t.learner.id);
      await deleteTeam(t);
    }
  });

  it('gives the manager a row per learner of their team, with company, date and results', async () => {
    const rows = await loadLearnerRecords(team.asManager);
    expect(rows.map((r) => r.id)).toEqual([team.learner.id]);
    expect(rows[0]).toMatchObject({
      loginId: team.learner.loginId,
      company: { id: team.recordId, issuedOn: '2026-04-09' },
      mcq: 'pass',
      mcqAttempts: 2,
      chatbot: 'pass',
      chatbotSessions: 3,
      appointmentAt: null,
    });
  });

  it('shows another team nothing of this learner', async () => {
    const rows = await loadLearnerRecords(other.asManager);
    expect(rows.map((r) => r.id)).toEqual([other.learner.id]);
    expect(await getLearnerHeader(other.asManager, team.learner.id)).toBeNull();
    expect(await listExamAttempts(other.asManager, team.learner.id)).toEqual([]);
    expect(await listInterviewSessions(other.asManager, team.learner.id)).toEqual([]);
  });

  it('lists the MCQ attempts newest first with their scores', async () => {
    const attempts = await listExamAttempts(team.asManager, team.learner.id);
    expect(attempts.map((a) => [a.attemptNo, a.result, a.score, a.maxScore])).toEqual([
      [2, 'pass', 18, 20],
      [1, 'fail', 10, 20],
    ]);
  });

  it('numbers the Chatbot sessions by when they started, newest first', async () => {
    const sessions = await listInterviewSessions(team.asManager, team.learner.id);
    expect(sessions.map((s) => [s.attemptNo, s.status, s.verdict])).toEqual([
      [3, 'abandoned', null],
      [2, 'completed', 'ready'],
      [1, 'completed', 'not_ready'],
    ]);
  });

  it('names the learner and their company for the history pages, and never a staff account', async () => {
    expect(await getLearnerHeader(team.asManager, team.learner.id)).toMatchObject({
      loginId: team.learner.loginId,
      companyNameTh: 'บริษัท บันทึกผู้เรียน จำกัด',
    });
    expect(await getLearnerHeader(svc, team.manager.id)).toBeNull();
  });
});

/**
 * A history longer than the API's row limit (max_rows = 1000) is read in full: cut off, it would
 * lose the newest sessions and misnumber the rest.
 */
describe('a history longer than one page', () => {
  let team: Team;
  beforeAll(async () => {
    team = await seedTeam('ประวัติยาว');
    await confirmRecord(team.recordId, team.manager.id);
    await svc
      .from('user_dbd_assignments')
      .insert({ user_id: team.learner.id, dbd_record_id: team.recordId });
    const start = Date.parse('2026-01-01T00:00:00Z');
    const { error } = await svc.from('interview_sessions').insert(
      Array.from({ length: 1005 }, (_, i) => ({
        user_id: team.learner.id,
        dbd_record_id: team.recordId,
        status: 'abandoned',
        verdict: null,
        plan: { items: [], cursor: 0 },
        provider: 'fake',
        started_at: new Date(start + i * 60_000).toISOString(),
      })),
    );
    if (error) throw error;
  });
  afterAll(async () => {
    await svc.from('interview_sessions').delete().eq('user_id', team.learner.id);
    await svc.from('user_dbd_assignments').delete().eq('user_id', team.learner.id);
    await deleteTeam(team);
  });

  it('lists every session, the newest first and numbered 1005', async () => {
    const sessions = await listInterviewSessions(team.asManager, team.learner.id);
    expect(sessions).toHaveLength(1005);
    expect(sessions[0].attemptNo).toBe(1005);
    expect(sessions[0].startedAt).toMatch(/^2026-01-01T16:44/);
    expect(sessions.at(-1)!.attemptNo).toBe(1);
  });
});
