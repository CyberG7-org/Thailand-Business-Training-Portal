import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  InterviewError,
  endInterview,
  startOrResumeInterview,
  submitLearnerMessage,
} from '@/lib/db/interviews';
import { loadProgressionFacts } from '@/lib/db/progression';
import {
  adminClient,
  clientFor,
  confirmRecord,
  deleteTeam,
  seedTeam,
  type Team,
  versionRecord,
} from './helpers';

const svc = adminClient();

/** Answers every question the fake officer asks until the session closes. */
async function answerAll(userId: string, sessionId: string, answer: (concept: string) => string) {
  for (let i = 0; i < 40; i++) {
    const { data: session } = await svc
      .from('interview_sessions')
      .select('plan, status')
      .eq('id', sessionId)
      .single();
    if (session!.status !== 'in_progress') return;
    const plan = session!.plan as { items: { concept: string }[]; cursor: number };
    const concept = plan.items[plan.cursor]?.concept ?? 'end';
    const { closed } = await submitLearnerMessage(userId, sessionId, answer(concept));
    if (closed) return;
  }
}

const FALLBACK = 'บริษัทดำเนินการตามปกติ มีลูกค้าในประเทศ';

describe('the readiness interview', () => {
  let team: Team;
  let expected: Record<string, string>;

  beforeAll(async () => {
    team = await seedTeam('สัมภาษณ์');
    await confirmRecord(team.recordId, team.manager.id);
    const { data: record } = await svc
      .from('dbd_records')
      .select('company_name_th, juristic_id')
      .eq('id', team.recordId)
      .single();
    await svc
      .from('user_dbd_assignments')
      .insert({ user_id: team.learner.id, dbd_record_id: team.recordId });
    await versionRecord(team.recordId);
    await svc.from('assessment_attempts').insert({
      user_id: team.learner.id,
      kind: 'exam',
      language: 'th',
      attempt_no: 1,
      status: 'submitted',
      question_ids: [],
      shuffle_seed: 'seed',
      passing_mark_snapshot: 80,
      score: 1,
      max_score: 1,
      result: 'pass',
      submitted_at: new Date().toISOString(),
    });
    expected = {
      company_name: record!.company_name_th!,
      juristic_id: record!.juristic_id!,
      business_activity: 'ทดสอบระบบ สินค้าทดสอบ',
    };
  });

  afterAll(async () => {
    await svc.from('interview_sessions').delete().eq('user_id', team.learner.id);
    await deleteTeam(team);
  });

  it('opens with the officer’s greeting and resumes the same session', async () => {
    const first = await startOrResumeInterview(team.learner.id);
    expect(first.session.status).toBe('in_progress');
    expect(first.turns).toHaveLength(1);
    expect(first.turns[0].role).toBe('officer');
    const again = await startOrResumeInterview(team.learner.id);
    expect(again.session.id).toBe(first.session.id);
  });

  it('ends not ready when the learner evades, and the reasons name the concepts', async () => {
    const { session } = await startOrResumeInterview(team.learner.id);
    await answerAll(team.learner.id, session.id, () => 'ไม่ทราบ');
    const { data } = await svc
      .from('interview_sessions')
      .select('status, verdict, summary')
      .eq('id', session.id)
      .single();
    expect(data!.status).toBe('completed');
    expect(data!.verdict).toBe('not_ready');
    const summary = data!.summary as {
      reasons: { concept: string; verdict: string }[];
      narrative: string;
    };
    expect(
      summary.reasons.some((r) => r.concept === 'company_name' && r.verdict === 'evasive'),
    ).toBe(true);
    expect(summary.narrative.length).toBeGreaterThan(0);
    const facts = await loadProgressionFacts(await clientFor(team.learner), team.learner.id);
    expect(facts.interviewSessions).toBe(1);
    expect(facts.interviewReady).toBe(false);
  });

  it('ends ready when the answers match the record, and readiness is one-way', async () => {
    const { session } = await startOrResumeInterview(team.learner.id);
    await answerAll(team.learner.id, session.id, (c) => expected[c] ?? FALLBACK);
    const { data } = await svc
      .from('interview_sessions')
      .select('verdict')
      .eq('id', session.id)
      .single();
    expect(data!.verdict).toBe('ready');
    const facts = await loadProgressionFacts(await clientFor(team.learner), team.learner.id);
    expect(facts.interviewReady).toBe(true);
    // Another, worse session does not take it away.
    const { session: practice } = await startOrResumeInterview(team.learner.id);
    await answerAll(team.learner.id, practice.id, () => 'ไม่ทราบ');
    const after = await loadProgressionFacts(await clientFor(team.learner), team.learner.id);
    expect(after.interviewReady).toBe(true);
    expect(after.interviewSessions).toBe(3);
  });

  it('lets the probing phase correct a wrong answer, and the last word wins', async () => {
    const { session } = await startOrResumeInterview(team.learner.id);
    let juristicAsked = 0;
    await answerAll(team.learner.id, session.id, (c) => {
      if (c === 'juristic_id') return ++juristicAsked <= 2 ? '1111111111119' : expected.juristic_id;
      return expected[c] ?? FALLBACK;
    });
    const { data } = await svc
      .from('interview_sessions')
      .select('verdict, summary, plan')
      .eq('id', session.id)
      .single();
    // Wrong twice in the facts phase, asked a third time in the probing phase, right at last.
    expect(juristicAsked).toBe(3);
    const plan = data!.plan as { items: { phase: string }[] };
    expect(plan.items.some((i) => i.phase === 'probing')).toBe(true);
    expect(data!.verdict).toBe('ready');
    const summary = data!.summary as { reasons: { concept: string; verdict: string }[] };
    expect(summary.reasons.find((r) => r.concept === 'juristic_id')?.verdict).toBe('correct');
  });

  it('abandons an idle session and starts a fresh one', async () => {
    const { session } = await startOrResumeInterview(team.learner.id);
    await svc
      .from('interview_sessions')
      .update({ last_turn_at: new Date(Date.now() - 31 * 60_000).toISOString() })
      .eq('id', session.id);
    const fresh = await startOrResumeInterview(team.learner.id);
    expect(fresh.session.id).not.toBe(session.id);
    const { data } = await svc
      .from('interview_sessions')
      .select('status, verdict')
      .eq('id', session.id)
      .single();
    expect(data).toEqual({ status: 'abandoned', verdict: null });
    await endInterview(team.learner.id, fresh.session.id);
  });

  it('refuses another learner’s session, a closed session and an oversized message', async () => {
    const { session } = await startOrResumeInterview(team.learner.id);
    await expect(submitLearnerMessage(team.manager.id, session.id, 'x')).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(
      submitLearnerMessage(team.learner.id, session.id, 'ก'.repeat(1001)),
    ).rejects.toMatchObject({ code: 'too_long' });
    await endInterview(team.learner.id, session.id);
    await expect(submitLearnerMessage(team.learner.id, session.id, 'สวัสดี')).rejects.toMatchObject(
      { code: 'closed' },
    );
    const { data } = await svc
      .from('interview_sessions')
      .select('verdict, summary')
      .eq('id', session.id)
      .single();
    expect(data!.verdict).toBe('not_ready');
  });

  it('is closed to a learner who has not passed the exam', async () => {
    const other = await seedTeam('ยังไม่สอบ');
    try {
      await confirmRecord(other.recordId, other.manager.id);
      await svc
        .from('user_dbd_assignments')
        .insert({ user_id: other.learner.id, dbd_record_id: other.recordId });
      await versionRecord(other.recordId);
      await expect(startOrResumeInterview(other.learner.id)).rejects.toBeInstanceOf(InterviewError);
    } finally {
      await deleteTeam(other);
    }
  });
});
