import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { answerQuestion, getAttemptWithAnswers } from '@/lib/db/assessment';
import { examPassedFor, finalizeExam, startExam } from '@/lib/db/exam';
import { processDueNotifications, requeueNotification } from '@/lib/db/notifications';
import { FakeNotifier } from '@/lib/integrations/notify/fake';
import {
  adminClient,
  clientFor,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

describe('exam + notifications', () => {
  let admin: TestUser;
  let learner: TestUser;
  let asLearner: Client;
  let asAdmin: Client;
  let recordId: string;
  let attemptId: string;
  const svc = adminClient();

  beforeAll(async () => {
    [admin, learner] = await Promise.all([createTestUser('admin'), createTestUser('learner')]);
    [asLearner, asAdmin] = await Promise.all([clientFor(learner), clientFor(admin)]);
    const { data } = await svc
      .from('dbd_records')
      .insert({
        company_name_th: 'บริษัท สอบจริง จำกัด',
        juristic_id: '0105569000123',
        registered_capital: 1000000,
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
    await svc.from('policy_config').upsert([
      { key: 'telegram_admin_chat_ids', value: ['123456'] },
      { key: 'email_admin_recipients', value: ['ops@example.com'] },
    ]);
  });

  afterAll(async () => {
    await svc.from('notifications').delete().like('idempotency_key', `exam_result:${attemptId}:%`);
    await svc.from('assessment_attempts').delete().eq('user_id', learner.id);
    await svc.from('user_dbd_assignments').delete().eq('dbd_record_id', recordId);
    await svc.from('eligibility_snapshots').delete().eq('dbd_record_id', recordId);
    await svc.from('dbd_records').delete().eq('id', recordId);
    await svc.from('policy_config').upsert([
      { key: 'telegram_admin_chat_ids', value: [] },
      { key: 'email_admin_recipients', value: [] },
    ]);
    await Promise.all([admin, learner].map((u) => deleteTestUser(u.id)));
  });

  it('starts an exam with the passing mark snapshotted, answers without revealing, finalizes atomically with notifications', async () => {
    const attempt = await startExam(learner.id, 'en');
    attemptId = attempt.id;
    expect(attempt.kind).toBe('exam');
    expect(Number(attempt.passing_mark_snapshot)).toBe(70);

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
    expect(['pass', 'fail']).toContain(done.result);
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
    expect(telegram.sent[0]?.subject).toMatch(/^\[Exam (PASS|FAIL)\]/);

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
