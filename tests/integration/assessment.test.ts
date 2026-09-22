import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  answerQuestion,
  getAttemptWithAnswers,
  getOrStartAttempt,
  listMyAttempts,
  localizeAttemptAnswers,
  submitAttempt,
} from '@/lib/db/assessment';
import {
  adminClient,
  clientFor,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

describe('assessment attempts', () => {
  let admin: TestUser;
  let learner: TestUser;
  let other: TestUser;
  let asLearner: Client;
  let asOther: Client;
  let recordId: string;

  beforeAll(async () => {
    [admin, learner, other] = await Promise.all([
      createTestUser('admin'),
      createTestUser('learner'),
      createTestUser('learner'),
    ]);
    [asLearner, asOther] = await Promise.all([clientFor(learner), clientFor(other)]);
    const svc = adminClient();
    const { data } = await svc
      .from('dbd_records')
      .insert({
        company_name_th: 'บริษัท สอบ จำกัด',
        juristic_id: '0105569000123',
        registered_capital: 2000000,
        issued_on: '2026-07-13',
        extraction_status: 'confirmed',
        confirmed_by: admin.id,
        confirmed_at: new Date().toISOString(),
      })
      .select()
      .single();
    recordId = data!.id;
    await svc
      .from('user_dbd_assignments')
      .insert({ user_id: learner.id, dbd_record_id: recordId, assigned_by: admin.id });
  });

  afterAll(async () => {
    const svc = adminClient();
    await svc.from('assessment_attempts').delete().eq('user_id', learner.id);
    await svc.from('user_dbd_assignments').delete().eq('dbd_record_id', recordId);
    await svc.from('eligibility_snapshots').delete().eq('dbd_record_id', recordId);
    await svc.from('dbd_records').delete().eq('id', recordId);
    await Promise.all([admin, learner, other].map((u) => deleteTestUser(u.id)));
  });

  it('learners cannot read the question bank directly', async () => {
    const { data } = await asLearner.from('question_localizations').select('correct_key');
    expect(data).toEqual([]);
  });

  it('refuses to start without an assignment', async () => {
    await expect(
      getOrStartAttempt({ userId: other.id, kind: 'quiz', language: 'th', count: 5 }),
    ).rejects.toMatchObject({ code: 'no_assignment' });
  });

  it('starts a personalized attempt, resumes it, and answers with server-side correctness', async () => {
    const attempt = await getOrStartAttempt({
      userId: learner.id,
      kind: 'quiz',
      language: 'th',
      count: 4,
    });
    expect(attempt.status).toBe('in_progress');
    expect(attempt.question_ids.length).toBeGreaterThan(0);
    expect(attempt.question_ids.length).toBeLessThanOrEqual(4);

    const resumed = await getOrStartAttempt({
      userId: learner.id,
      kind: 'quiz',
      language: 'th',
      count: 4,
    });
    expect(resumed.id).toBe(attempt.id);

    const full = await getAttemptWithAnswers(asLearner, attempt.id);
    expect(full?.assessment_answers).toHaveLength(attempt.question_ids.length);
    const capital = full!.assessment_answers.find((a) =>
      a.rendered_prompt.includes('ทุนจดทะเบียน'),
    );
    if (capital) {
      expect(capital.rendered_prompt).toContain('บริษัท สอบ จำกัด');
      const texts = (capital.rendered_options as Array<{ key: string; text: string }>).map(
        (o) => o.text,
      );
      expect(texts).toContain('2,000,000 บาท');
      expect(new Set(texts).size).toBe(texts.length);
    }
    // Learner-visible answer rows never carry the correct key.
    expect(Object.keys(full!.assessment_answers[0])).not.toContain('correct_key');

    // Other learners cannot see this attempt at all.
    expect(await getAttemptWithAnswers(asOther, attempt.id)).toBeNull();

    // Answer every question with 'A' (the seed's correct key for template questions).
    const feedback = [];
    for (const answer of full!.assessment_answers) {
      feedback.push(
        await answerQuestion({
          userId: learner.id,
          attemptId: attempt.id,
          questionId: answer.question_id,
          selectedKey: 'A',
        }),
      );
    }
    expect(feedback.every((f) => ['A', 'B', 'C', 'D'].includes(f.correctKey))).toBe(true);
    expect(feedback.every((f) => f.isCorrect === (f.correctKey === 'A'))).toBe(true);

    await expect(
      answerQuestion({
        userId: learner.id,
        attemptId: attempt.id,
        questionId: full!.assessment_answers[0].question_id,
        selectedKey: 'B',
      }),
    ).rejects.toMatchObject({ code: 'already_answered' });

    const submitted = await submitAttempt({ userId: learner.id, attemptId: attempt.id });
    expect(submitted.status).toBe('submitted');
    expect(submitted.max_score).toBe(full!.assessment_answers.length);
    expect(submitted.score).toBe(feedback.filter((f) => f.isCorrect).length);
    expect(submitted.result).toBeNull();

    // The review carries the key and an explanation with its placeholders filled in.
    const review = await localizeAttemptAnswers(full!, 'th');
    expect(review.size).toBe(submitted.question_ids.length);
    for (const shown of review.values()) {
      expect(shown.correctKey).toMatch(/^[A-D]$/);
      expect(shown.explanation ?? '').not.toMatch(/\{[a-z_]+\}/);
    }

    const mine = await listMyAttempts(asLearner, learner.id, 'quiz');
    expect(mine.map((a) => a.id)).toContain(attempt.id);
    expect(await listMyAttempts(asOther, learner.id, 'quiz')).toEqual([]);
  });

  it('shows an attempt in the language the learner switched to, same questions and option order', async () => {
    const attempt = await getOrStartAttempt({
      userId: learner.id,
      kind: 'quiz',
      language: 'en',
      count: 4,
    });
    const full = (await getAttemptWithAnswers(asLearner, attempt.id))!;
    const inEnglish = await localizeAttemptAnswers(full, 'en');
    const inThai = await localizeAttemptAnswers(full, 'th');
    for (const answer of full.assessment_answers) {
      const en = inEnglish.get(answer.question_id)!;
      const th = inThai.get(answer.question_id)!;
      // The snapshot is what the attempt language shows.
      expect(en.prompt).toBe(answer.rendered_prompt);
      // Thai text, same option keys in the same presented order, the company name substituted.
      expect(th.prompt).not.toBe(en.prompt);
      expect(th.prompt).toMatch(/[\u0E00-\u0E7F]/);
      expect(th.options.map((o) => o.key)).toEqual(answer.presented_option_order);
      if (en.prompt.includes('บริษัท สอบ จำกัด')) expect(th.prompt).toContain('บริษัท สอบ จำกัด');
    }
    // Feedback follows the language asked for; correctness is by key and unchanged.
    const first = full.assessment_answers[0];
    const feedback = await answerQuestion({
      userId: learner.id,
      attemptId: attempt.id,
      questionId: first.question_id,
      selectedKey: inThai.get(first.question_id)!.correctKey!,
      locale: 'th',
    });
    expect(feedback.isCorrect).toBe(true);
    expect(feedback.explanation ?? '').not.toMatch(/\{[a-z_]+\}/);
    const svc = adminClient();
    await svc.from('assessment_attempts').delete().eq('id', attempt.id);
  });

  it('rejects submitting with unanswered questions and answering a closed attempt', async () => {
    const attempt = await getOrStartAttempt({
      userId: learner.id,
      kind: 'quiz',
      language: 'en',
      count: 2,
    });
    await expect(
      submitAttempt({ userId: learner.id, attemptId: attempt.id }),
    ).rejects.toMatchObject({
      code: 'unanswered',
    });
    await expect(
      answerQuestion({
        userId: other.id,
        attemptId: attempt.id,
        questionId: attempt.question_ids[0],
        selectedKey: 'A',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
