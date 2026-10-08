import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AssessmentError,
  answerQuestion,
  getAttemptWithAnswers,
  localizeAttemptAnswers,
  type AttemptRow,
} from '@/lib/db/assessment';
import { examPassedFor, finalizeExam, startExam } from '@/lib/db/exam';
import { listVariants, setVariantStatus } from '@/lib/db/mcq-bank';
import { validateRecord } from '@/lib/db/validation';
import { MCQ_CONCEPTS } from '@/lib/domain/concepts/registry';
import {
  adminClient,
  clientFor,
  createTestUser,
  deleteTeam,
  deleteTestUser,
  seedApprovedBank,
  seedQuizTeam,
  type Client,
  type Team,
  type TestUser,
} from './helpers';

const svc = adminClient();
const NON_CRITICAL = MCQ_CONCEPTS.filter((c) => !c.critical).map((c) => c.key);

describe('the Business Knowledge Quiz attempt (D100)', () => {
  let team: Team;
  let owner: TestUser;
  let asLearner: Client;
  let removeBank: () => Promise<void>;

  beforeAll(async () => {
    owner = await createTestUser('admin');
    removeBank = await seedApprovedBank(owner.id);
    team = await seedQuizTeam('แบบทดสอบสามสิบข้อ');
    asLearner = await clientFor(team.learner);
  });

  afterAll(async () => {
    await svc.from('assessment_attempts').delete().eq('user_id', team.learner.id);
    await svc.from('notifications').delete().like('idempotency_key', 'exam_result:%');
    await deleteTeam(team);
    await removeBank();
    await deleteTestUser(owner.id);
  });

  /** Answers every question: right, except on the concepts named. Returns the feedback given. */
  async function answerAll(attempt: AttemptRow, wrong: readonly string[] = []) {
    const full = (await getAttemptWithAnswers(asLearner, attempt.id))!;
    const { data: keys } = await svc
      .from('assessment_answer_keys')
      .select('answer_id, correct_key')
      .in(
        'answer_id',
        full.assessment_answers.map((a) => a.id),
      );
    const correct = new Map(keys!.map((k) => [k.answer_id, k.correct_key]));
    const feedback = [];
    for (const a of full.assessment_answers) {
      if (a.selected_key !== null) continue;
      const right = correct.get(a.id)!;
      const selectedKey = wrong.includes(a.concept_key!) ? (right === 'A' ? 'B' : 'A') : right;
      feedback.push({
        conceptKey: a.concept_key!,
        ...(await answerQuestion({
          userId: team.learner.id,
          attemptId: attempt.id,
          questionId: a.question_id,
          selectedKey,
        })),
      });
    }
    return feedback;
  }

  it('asks one question for each of the 30 concepts and keeps the key on the server', async () => {
    const attempt = await startExam(team.learner.id, 'th');
    expect(attempt).toMatchObject({ kind: 'exam', status: 'in_progress', attempt_no: 1 });
    expect(attempt.rule_snapshot).toEqual({ version: 2, passScore: 27 });
    // Starting again resumes the same attempt.
    expect((await startExam(team.learner.id, 'th')).id).toBe(attempt.id);

    const full = (await getAttemptWithAnswers(asLearner, attempt.id))!;
    expect(full.assessment_answers).toHaveLength(30);
    expect(full.assessment_answers.map((a) => a.concept_key).sort()).toEqual(
      MCQ_CONCEPTS.map((c) => c.key).sort(),
    );
    for (const a of full.assessment_answers) {
      const options = a.rendered_options as unknown as { key: string; text: string }[];
      expect(options.map((o) => o.key)).toEqual(['A', 'B', 'C', 'D']);
      expect(new Set(options.map((o) => o.text)).size).toBe(4);
      expect(a.presented_option_order).toEqual(['A', 'B', 'C', 'D']);
      expect(a.rendered_prompt).not.toContain('{');
    }
    // The company's own facts are in the questions.
    const capital = full.assessment_answers.find((a) => a.concept_key === 'registered_capital')!;
    expect(JSON.stringify(capital.rendered_options)).toContain('2,000,000 บาท');

    // The learner can read their answer rows, and nothing of the key.
    const { data: hidden } = await asLearner.from('assessment_answer_keys').select('answer_id');
    expect(hidden ?? []).toEqual([]);
    // The correct option is not always in the same place.
    const { data: keys } = await svc
      .from('assessment_answer_keys')
      .select('correct_key')
      .in(
        'answer_id',
        full.assessment_answers.map((a) => a.id),
      );
    expect(new Set(keys!.map((k) => k.correct_key)).size).toBeGreaterThan(1);
  });

  it('marks each answer at once, refuses a second answer, and passes on 30 of 30', async () => {
    const attempt = await startExam(team.learner.id, 'th');
    const full = (await getAttemptWithAnswers(asLearner, attempt.id))!;
    const first = full.assessment_answers[0];
    const { data: key } = await svc
      .from('assessment_answer_keys')
      .select('correct_key')
      .eq('answer_id', first.id)
      .single();
    const given = await answerQuestion({
      userId: team.learner.id,
      attemptId: attempt.id,
      questionId: first.question_id,
      selectedKey: key!.correct_key,
      locale: 'en',
    });
    expect(given).toMatchObject({ isCorrect: true, correctKey: key!.correct_key });
    // The explanation comes in the language asked for.
    expect(given.explanation).toMatch(/[a-z]{4}/);
    await expect(
      answerQuestion({
        userId: team.learner.id,
        attemptId: attempt.id,
        questionId: first.question_id,
        selectedKey: key!.correct_key === 'A' ? 'B' : 'A',
      }),
    ).rejects.toMatchObject({ code: 'already_answered' });

    // The open attempt in another language: the same questions, the same positions.
    const zh = await localizeAttemptAnswers(
      (await getAttemptWithAnswers(asLearner, attempt.id))!,
      'zh',
    );
    const capital = full.assessment_answers.find((a) => a.concept_key === 'registered_capital')!;
    const th = capital.rendered_options as unknown as { key: string; text: string }[];
    const position = th.findIndex((o) => o.text === '2,000,000 บาท');
    expect(zh.get(capital.question_id)?.options[position].text).toBe('2,000,000 泰铢');
    expect(zh.get(capital.question_id)?.correctKey).toBe(th[position].key);

    await expect(finalizeExam(team.learner.id, attempt.id)).rejects.toMatchObject({
      code: 'unanswered',
    });
    await answerAll(attempt);
    const done = await finalizeExam(team.learner.id, attempt.id);
    expect(done).toMatchObject({ status: 'submitted', result: 'pass', score: 30, max_score: 30 });
    expect(await examPassedFor(team.learner.id)).toEqual({ submitted: 1, passed: true });
  });

  it('passes with 29 right even when a formerly critical concept is wrong', async () => {
    const attempt = await startExam(team.learner.id, 'th');
    expect(attempt.attempt_no).toBe(2);
    const feedback = await answerAll(attempt, ['registered_capital']);
    const wrong = feedback.find((f) => f.conceptKey === 'registered_capital')!;
    expect(wrong.isCorrect).toBe(false);
    expect(wrong.explanation).toContain('2,000,000 บาท');
    const done = await finalizeExam(team.learner.id, attempt.id);
    expect(done).toMatchObject({ result: 'pass', score: 29, max_score: 30 });

    const { data: note } = await svc
      .from('notifications')
      .select('payload')
      .like('idempotency_key', `exam_result:${attempt.id}:%`);
    for (const row of note ?? []) {
      expect(row.payload).toMatchObject({ result: 'pass', pass_score: 27, critical_wrong: 0 });
    }
  });

  it('does not pass on 25 right, and prefers questions not asked before', async () => {
    const attempt = await startExam(team.learner.id, 'th');
    // Three attempts now: the two variants of this concept have both been asked, in turn.
    const { data: asked } = await svc
      .from('assessment_attempts')
      .select('attempt_no, question_ids')
      .eq('user_id', team.learner.id)
      .order('attempt_no');
    const variants = await listVariants(svc);
    const keyOf = (ids: string[]) =>
      variants.find((v) => v.conceptKey === 'shareholder_count' && ids.includes(v.id))?.key;
    expect(asked!.map((a) => keyOf(a.question_ids))).toEqual([
      'mcq-v2-shareholder-count-1',
      'mcq-v2-shareholder-count-2',
      'mcq-v2-shareholder-count-3',
    ]);

    await answerAll(attempt, NON_CRITICAL.slice(0, 5));
    const done = await finalizeExam(team.learner.id, attempt.id);
    expect(done).toMatchObject({ result: 'fail', score: 25, max_score: 30 });
    // Any pass counts (the default rule): the first attempt's pass stands.
    expect((await examPassedFor(team.learner.id)).passed).toBe(true);
  });

  it('does not start when the bank cannot ask a concept, and tells the record’s staff', async () => {
    const otp = (await listVariants(svc)).filter((v) => v.conceptKey === 'otp_control');
    for (const variant of otp) await setVariantStatus(svc, variant.id, 'draft');
    const open = () =>
      svc
        .from('training_fact_exceptions')
        .select('kind, field, blocks, status')
        .eq('dbd_record_id', team.recordId)
        .eq('kind', 'render_failure')
        .eq('status', 'open');
    try {
      const refused = await startExam(team.learner.id, 'th').catch((e) => e);
      expect(refused).toBeInstanceOf(AssessmentError);
      expect(refused.code).toBe('not_ready');
      // Asked twice, reported once.
      await startExam(team.learner.id, 'th').catch(() => null);
      expect((await open()).data).toEqual([
        { kind: 'render_failure', field: 'otp_control', blocks: 'none', status: 'open' },
      ]);
      // A validation run leaves the report open: no validator raised it.
      await validateRecord(svc, team.recordId, null);
      expect((await open()).data).toHaveLength(1);
      const { count } = await svc
        .from('assessment_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', team.learner.id)
        .eq('status', 'in_progress');
      expect(count).toBe(0);
    } finally {
      for (const variant of otp) await setVariantStatus(svc, variant.id, 'approved');
    }
    // With the question back the quiz starts, and the report closes itself.
    const fourth = await startExam(team.learner.id, 'th');
    expect(fourth.attempt_no).toBe(4);
    expect((await open()).data).toEqual([]);

    // After all three variants have appeared, the rotation stays even instead of sticking to
    // the first key forever: 1, 2, 3, then 1, 2.
    await answerAll(fourth);
    await finalizeExam(team.learner.id, fourth.id);
    const fifth = await startExam(team.learner.id, 'th');
    expect(fifth.attempt_no).toBe(5);
    const { data: attempts } = await svc
      .from('assessment_attempts')
      .select('attempt_no, question_ids')
      .eq('user_id', team.learner.id)
      .eq('kind', 'exam')
      .order('attempt_no');
    const variants = await listVariants(svc);
    const keyOf = (ids: string[]) =>
      variants.find(
        (variant) => variant.conceptKey === 'shareholder_count' && ids.includes(variant.id),
      )?.key;
    expect(attempts!.map((attempt) => keyOf(attempt.question_ids))).toEqual([
      'mcq-v2-shareholder-count-1',
      'mcq-v2-shareholder-count-2',
      'mcq-v2-shareholder-count-3',
      'mcq-v2-shareholder-count-1',
      'mcq-v2-shareholder-count-2',
    ]);
  });
});
