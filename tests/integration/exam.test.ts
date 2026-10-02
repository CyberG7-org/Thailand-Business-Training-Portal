import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { answerQuestion, getAttemptWithAnswers } from '@/lib/db/assessment';
import { examPassedFor, finalizeExam, startExam } from '@/lib/db/exam';
import { processDueNotifications, requeueNotification } from '@/lib/db/notifications';
import { FakeNotifier } from '@/lib/integrations/notify/fake';
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

describe('exam + notifications', () => {
  let admin: TestUser;
  let team: Team;
  let learner: TestUser;
  let asLearner: Client;
  let asAdmin: Client;
  let attemptId: string;
  let removeBank: () => Promise<void>;
  const svc = adminClient();

  beforeAll(async () => {
    admin = await createTestUser('admin');
    removeBank = await seedApprovedBank(admin.id);
    team = await seedQuizTeam('สอบจริง');
    learner = team.learner;
    [asLearner, asAdmin] = await Promise.all([clientFor(learner), clientFor(admin)]);
    await svc.from('policy_config').upsert([
      { key: 'telegram_admin_chat_ids', value: ['123456'] },
      { key: 'email_admin_recipients', value: ['ops@example.com'] },
    ]);
  });

  afterAll(async () => {
    await svc.from('notifications').delete().like('idempotency_key', `exam_result:${attemptId}:%`);
    await svc.from('assessment_attempts').delete().eq('user_id', learner.id);
    await svc.from('policy_config').upsert([
      { key: 'telegram_admin_chat_ids', value: [] },
      { key: 'email_admin_recipients', value: [] },
    ]);
    await deleteTeam(team);
    await removeBank();
    await deleteTestUser(admin.id);
  });

  it('starts a quiz with its rule frozen, answers it, finalizes atomically with notifications', async () => {
    const attempt = await startExam(learner.id, 'en');
    attemptId = attempt.id;
    expect(attempt.kind).toBe('exam');
    expect(attempt.rule_snapshot).toMatchObject({ passScore: 27, retestScore: 23 });

    const full = await getAttemptWithAnswers(asLearner, attempt.id);
    for (const a of full!.assessment_answers) {
      await answerQuestion({
        userId: learner.id,
        attemptId: attempt.id,
        questionId: a.question_id,
        selectedKey: 'A',
      });
    }
    // Before finalization the learner-visible rows expose no score or result.
    const mid = await getAttemptWithAnswers(asLearner, attempt.id);
    expect(mid?.score).toBeNull();
    expect(mid?.result).toBeNull();

    const done = await finalizeExam(learner.id, attempt.id);
    expect(done.status).toBe('submitted');
    expect(['pass', 'retest', 'fail']).toContain(done.result);
    expect(done.max_score).toBe(full!.assessment_answers.length);

    // Idempotent: finalizing again is a no-op and creates no duplicate rows.
    const again = await finalizeExam(learner.id, attempt.id);
    expect(again.submitted_at).toBe(done.submitted_at);
    const { data: rows } = await asAdmin
      .from('notifications')
      .select('channel, status, idempotency_key')
      .like('idempotency_key', `exam_result:${attempt.id}:%`);
    expect(rows?.map((r) => r.channel).sort()).toEqual(['email', 'telegram']);
    expect(rows?.every((r) => r.status === 'pending')).toBe(true);

    // Learners cannot see the queue.
    const { data: hidden } = await asLearner.from('notifications').select('id');
    expect(hidden).toEqual([]);

    const { submitted, passed } = await examPassedFor(learner.id);
    expect(submitted).toBe(1);
    expect(passed).toBe(done.result === 'pass');
  });

  it('drains the queue: sends through notifiers, retries failures with backoff, and admins can requeue', async () => {
    const telegram = new FakeNotifier('telegram');
    const email = new FakeNotifier('email', new Error('smtp down'));
    const summary = await processDueNotifications((c) => (c === 'telegram' ? telegram : email), 50);
    expect(summary.sent).toBeGreaterThanOrEqual(1);
    expect(summary.retried).toBeGreaterThanOrEqual(1);
    expect(telegram.sent[0]?.destination).toBe('123456');
    expect(telegram.sent[0]?.subject).toMatch(/^\[Business Knowledge Quiz (PASS|RETEST|FAIL)\]/);

    const { data: rows } = await asAdmin
      .from('notifications')
      .select('id, channel, status, attempts, last_error, next_attempt_at')
      .like('idempotency_key', `exam_result:${attemptId}:%`);
    const tg = rows!.find((r) => r.channel === 'telegram')!;
    const em = rows!.find((r) => r.channel === 'email')!;
    expect(tg.status).toBe('sent');
    expect(em.status).toBe('pending');
    expect(em.attempts).toBe(1);
    expect(em.last_error).toBe('smtp down');
    expect(new Date(em.next_attempt_at).getTime()).toBeGreaterThan(Date.now());

    // Leased rows are not re-claimed before their next_attempt_at.
    const second = await processDueNotifications(() => telegram, 50);
    expect(second.claimed).toBe(0);

    await requeueNotification(asAdmin, em.id);
    const third = await processDueNotifications(() => new FakeNotifier('email'), 50);
    expect(third.sent).toBe(1);
  });
});
