import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { InterviewProvider, TurnInput } from '@/lib/integrations/interview/types';
import {
  adminClient,
  confirmRecord,
  deleteTeam,
  seedTeam,
  type Team,
  versionRecord,
} from './helpers';

type Mode =
  | 'fake'
  | 'fail-turn'
  | 'fail-narrate'
  | 'wrong-concept'
  | 'leak'
  | 'never-close'
  | 'evasive'
  | 'early-close';

/** The tests steer the officer: the fake by default, a scripted misbehaviour when `mode` is set. */
const control = vi.hoisted(() => ({ mode: 'fake' as Mode }));

vi.mock('@/lib/integrations/interview', async () => {
  const { FakeInterview } = await import('@/lib/integrations/interview/fake');
  const fake = new FakeInterview();
  const stub: InterviewProvider = {
    name: 'fake',
    async turn(input: TurnInput) {
      if (control.mode === 'fail-turn') throw new Error('model down');
      if (
        input.learnerMessage === null ||
        control.mode === 'fake' ||
        control.mode === 'fail-narrate'
      ) {
        return fake.turn(input);
      }
      const item = input.plan.items[input.plan.cursor]!;
      const following = input.plan.items[input.plan.cursor + 1];
      const onward = following
        ? { concept: following.concept }
        : { close: 'plan_complete' as const };
      switch (control.mode) {
        case 'wrong-concept':
          return {
            say: 'รับทราบค่ะ ถามข้อถัดไปนะคะ',
            assessment: { concept: 'made_up', verdict: 'correct', note: '' },
            next: onward,
          };
        case 'leak':
          return {
            say: 'เลขทะเบียนของบริษัทคือ ' + input.facts.juristic_id + ' ถูกต้องไหมคะ',
            assessment: { concept: item.concept, verdict: 'correct', note: '' },
            next: onward,
          };
        case 'never-close':
          return {
            say: 'ช่วยขยายความอีกหน่อยได้ไหมคะ',
            assessment: { concept: item.concept, verdict: 'partial', note: '' },
            next: { concept: item.concept },
          };
        case 'evasive':
          return {
            say: 'ขอถามอีกครั้งนะคะ',
            assessment: { concept: item.concept, verdict: 'evasive', note: '' },
            next: { concept: item.concept },
          };
        case 'early-close':
          return {
            say: 'ครบแล้วค่ะ',
            assessment: { concept: item.concept, verdict: 'correct', note: '' },
            next: { close: 'plan_complete' },
          };
      }
      return fake.turn(input);
    },
    async narrate(input) {
      if (control.mode === 'fail-narrate') throw new Error('narrative down');
      return fake.narrate(input);
    },
  };
  return { resolveInterviewProvider: () => 'fake', getInterviewProvider: () => stub };
});

// Imported after the mock is declared (vitest hoists the mock above these anyway).
import {
  endInterview,
  startOrResumeInterview,
  submitLearnerMessage,
  turnBudget,
} from '@/lib/db/interviews';

const svc = adminClient();
const FALLBACK = 'บริษัทดำเนินการตามปกติ มีลูกค้าในประเทศ';

type Summary = {
  reasons: { concept: string; verdict: string }[];
  narrative: string;
  closeReason: string;
};

async function row(id: string) {
  const { data } = await svc
    .from('interview_sessions')
    .select('status, verdict, summary, plan')
    .eq('id', id)
    .single();
  return { ...data!, summary: data!.summary as Summary | null };
}
async function turnsOf(id: string) {
  const { data } = await svc.from('interview_turns').select('*').eq('session_id', id).order('seq');
  return data ?? [];
}
async function answerAll(
  userId: string,
  sessionId: string,
  answer: (concept: string, expected: string) => string,
) {
  for (let i = 0; i < 60; i++) {
    const r = await row(sessionId);
    if (r.status !== 'in_progress') return;
    const plan = r.plan as { items: { concept: string; expected: string }[]; cursor: number };
    const item = plan.items[plan.cursor];
    const { closed } = await submitLearnerMessage(
      userId,
      sessionId,
      answer(item?.concept ?? 'end', item?.expected ?? ''),
    );
    if (closed) return;
  }
}

/** The provider path under failure and misbehaviour (review findings 1–7). */
describe('the readiness interview when the officer fails or misbehaves', () => {
  let team: Team;
  let learner: string;
  let expected: Record<string, string>;

  beforeAll(async () => {
    team = await seedTeam('เจ้าหน้าที่ล่ม');
    learner = team.learner.id;
    await confirmRecord(team.recordId, team.manager.id);
    await svc
      .from('dbd_records')
      .update({
        head_office_address: 'เลขที่ 99 กรุงเทพมหานคร',
        registered_on: '2026-07-13',
        directors: [{ name_th: 'นางสาว กรรมการ ตัวอย่าง', name_en: null }],
        signing_authority: 'กรรมการหนึ่งคนลงนาม',
      })
      .eq('id', team.recordId);
    const { data: record } = await svc
      .from('dbd_records')
      .select('company_name_th, juristic_id')
      .eq('id', team.recordId)
      .single();
    await svc
      .from('user_dbd_assignments')
      .insert({ user_id: learner, dbd_record_id: team.recordId });
    await versionRecord(team.recordId);
    await svc.from('assessment_attempts').insert({
      user_id: learner,
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
      registration_number: record!.juristic_id!,
    };
  });

  afterAll(async () => {
    control.mode = 'fake';
    await svc.from('interview_sessions').delete().eq('user_id', learner);
    await deleteTeam(team);
  });

  it('keeps the verdict when the narrative fails', async () => {
    control.mode = 'fail-narrate';
    const { session } = await startOrResumeInterview(learner);
    await answerAll(
      learner,
      session.id,
      (concept, planned) => (expected[concept] ?? planned) || FALLBACK,
    );
    const r = await row(session.id);
    expect(r.status).toBe('completed');
    expect(r.verdict).toBe('ready');
    expect(r.summary?.closeReason).toBe('plan_complete');
    expect(r.summary?.narrative).toBe('');
    control.mode = 'fake';
  });

  it('writes nothing when the officer fails, on the opening turn and mid-session', async () => {
    control.mode = 'fail-turn';
    await expect(startOrResumeInterview(learner)).rejects.toThrow('model down');
    const { count } = await svc
      .from('interview_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', learner)
      .eq('status', 'in_progress');
    expect(count).toBe(0);

    control.mode = 'fake';
    const { session, turns } = await startOrResumeInterview(learner);
    expect(turns).toHaveLength(1);
    control.mode = 'fail-turn';
    await expect(submitLearnerMessage(learner, session.id, 'สวัสดีครับ')).rejects.toThrow(
      'model down',
    );
    // The learner's message was not recorded: they can send it again.
    expect(await turnsOf(session.id)).toHaveLength(1);
    control.mode = 'fake';
    await endInterview(learner, session.id);
  });

  it('pins the assessment to the question that was asked', async () => {
    control.mode = 'wrong-concept';
    const { session } = await startOrResumeInterview(learner);
    const { turns } = await submitLearnerMessage(learner, session.id, expected.company_name);
    const officer = turns.at(-1)!;
    expect(officer.role).toBe('officer');
    expect((officer.assessment as { concept: string }).concept).toBe('company_name');
    control.mode = 'fake';
    await endInterview(learner, session.id);
  });

  it('replaces an officer turn that states a fact with a plain re-ask', async () => {
    control.mode = 'leak';
    const { session } = await startOrResumeInterview(learner);
    const { turns } = await submitLearnerMessage(learner, session.id, 'ไม่แน่ใจ');
    const officer = turns.at(-1)!;
    expect(officer.content).not.toContain(expected.registration_number);
    expect(officer.content).toContain('ขอถามอีกครั้ง');
    control.mode = 'fake';
    await endInterview(learner, session.id);
  });

  it('does not let the officer trap the learner on one question', async () => {
    control.mode = 'never-close';
    const { session } = await startOrResumeInterview(learner);
    let sent = 0;
    for (let i = 0; i < 80; i++) {
      const r = await submitLearnerMessage(learner, session.id, 'ขยายความครับ');
      sent += 1;
      if (r.closed) break;
    }
    const r = await row(session.id);
    expect(sent).toBeLessThan(turnBudget(r.plan as never));
    expect(sent).toBe(26);
    expect(r.status).toBe('completed');
    expect(r.verdict).toBe('not_ready');
    expect(r.summary?.closeReason).toBe('plan_complete');
    expect(
      r.summary?.reasons.every((reason) => ['correct', 'wrong'].includes(reason.verdict)),
    ).toBe(true);
    const last = (await turnsOf(session.id)).at(-1)!;
    expect(last.role).toBe('officer');
    expect(last.content).toContain('ครบทุกข้อแล้ว');
    control.mode = 'fake';
  });

  it('continues after the third evasion and still reaches a score', async () => {
    control.mode = 'evasive';
    const { session } = await startOrResumeInterview(learner);
    expect((await submitLearnerMessage(learner, session.id, 'เอ่อ')).closed).toBe(false);
    expect((await submitLearnerMessage(learner, session.id, 'เอ่อ')).closed).toBe(false);
    expect((await submitLearnerMessage(learner, session.id, 'เอ่อ')).closed).toBe(false);
    control.mode = 'fake';
    await answerAll(learner, session.id, (_concept, planned) => planned || FALLBACK);
    const r = await row(session.id);
    expect(r.summary?.closeReason).toBe('plan_complete');
    expect(r.summary).toMatchObject({ passScore: 10, maxScore: 13 });
  });

  it('ignores an early provider close and asks all 13 questions in order', async () => {
    control.mode = 'early-close';
    const { session } = await startOrResumeInterview(learner);
    await answerAll(learner, session.id, (_concept, planned) => planned || FALLBACK);
    const r = await row(session.id);
    expect(r.status).toBe('completed');
    expect(r.verdict).toBe('ready');
    expect(r.summary?.closeReason).toBe('plan_complete');
    expect(r.summary?.reasons).toHaveLength(13);
    expect(new Set(r.summary?.reasons.map((reason) => reason.concept)).size).toBe(13);
    control.mode = 'fake';
  });

  it('marks a pasted dump and lets the learner correct it', async () => {
    control.mode = 'fake';
    const { session } = await startOrResumeInterview(learner);
    const dump =
      'ชื่อบริษัท: ' +
      expected.company_name +
      '\nเลขทะเบียน: ' +
      expected.registration_number +
      '\nทุนจดทะเบียน: 1,000,000 บาท';
    const { turns } = await submitLearnerMessage(learner, session.id, dump);
    const officer = turns.at(-1)!;
    expect((officer.assessment as { verdict: string }).verdict).toBe('wrong');
    expect(officer.content).toContain('คำพูดของคุณเอง');
    await answerAll(
      learner,
      session.id,
      (concept, planned) => (expected[concept] ?? planned) || FALLBACK,
    );
    const r = await row(session.id);
    expect(r.verdict).toBe('ready');
    expect(r.summary?.reasons.find((x) => x.concept === 'company_name')?.verdict).toBe('correct');
  });

  it('abandons an idle session on the next message, and on an end', async () => {
    control.mode = 'fake';
    const stale = new Date(Date.now() - 31 * 60_000).toISOString();
    const { session } = await startOrResumeInterview(learner);
    await svc.from('interview_sessions').update({ last_turn_at: stale }).eq('id', session.id);
    await expect(submitLearnerMessage(learner, session.id, 'สวัสดี')).rejects.toMatchObject({
      code: 'expired',
    });
    expect(await row(session.id)).toMatchObject({ status: 'abandoned', verdict: null });

    const { session: fresh } = await startOrResumeInterview(learner);
    expect(fresh.id).not.toBe(session.id);
    await svc.from('interview_sessions').update({ last_turn_at: stale }).eq('id', fresh.id);
    await expect(endInterview(learner, fresh.id)).rejects.toMatchObject({ code: 'expired' });
    expect(await row(fresh.id)).toMatchObject({ status: 'abandoned', verdict: null });
  });
});
