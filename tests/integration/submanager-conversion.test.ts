import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  clientFor,
  confirmRecord,
  deleteTeam,
  seedTeam,
  type Client,
  type Team,
} from './helpers';

const svc = adminClient();
const privateTables = [
  'user_dbd_assignments',
  'dbd_records',
  'assessment_attempts',
  'assessment_answers',
  'interview_sessions',
  'interview_turns',
] as const;

describe('a learner converted to Submanager', () => {
  let team: Team;
  let client: Client;
  let attemptId: string;
  let interviewId: string;
  let questionId: string;

  beforeAll(async () => {
    team = await seedTeam('converted-submanager');
    await confirmRecord(team.recordId, team.manager.id);
    expect(
      (
        await svc
          .from('user_dbd_assignments')
          .insert({
            user_id: team.learner.id,
            dbd_record_id: team.recordId,
            assigned_by: team.manager.id,
          })
      ).error,
    ).toBeNull();
    const question = await svc
      .from('questions')
      .insert({ question_key: `conversion-${team.learner.id}`, kind: 'generic' })
      .select('id')
      .single();
    expect(question.error).toBeNull();
    questionId = question.data!.id;
    const attempt = await svc
      .from('assessment_attempts')
      .insert({
        user_id: team.learner.id,
        dbd_record_id: team.recordId,
        kind: 'exam',
        language: 'th',
        attempt_no: 1,
        question_ids: [questionId],
        shuffle_seed: 'conversion',
      })
      .select('id')
      .single();
    expect(attempt.error).toBeNull();
    attemptId = attempt.data!.id;
    expect(
      (
        await svc
          .from('assessment_answers')
          .insert({
            attempt_id: attemptId,
            question_id: questionId,
            position: 1,
            presented_option_order: ['A'],
            rendered_options: [{ key: 'A', text: 'private' }],
            rendered_prompt: 'private prompt',
          })
      ).error,
    ).toBeNull();
    const interview = await svc
      .from('interview_sessions')
      .insert({
        user_id: team.learner.id,
        dbd_record_id: team.recordId,
        status: 'in_progress',
        plan: {},
        provider: 'fake',
      })
      .select('id')
      .single();
    expect(interview.error).toBeNull();
    interviewId = interview.data!.id;
    expect(
      (
        await svc
          .from('interview_turns')
          .insert({ session_id: interviewId, seq: 1, role: 'learner', content: 'private answer' })
      ).error,
    ).toBeNull();
    client = await clientFor(team.learner);
    // Prove each fixture is genuinely readable before conversion. Keep this original JWT.
    for (const table of privateTables) {
      const result = await client.from(table).select('id');
      expect(result.error).toBeNull();
      expect(result.data?.length, table).toBe(1);
    }
    expect(
      (
        await svc.auth.admin.updateUserById(team.learner.id, {
          app_metadata: { role: 'submanager', manager_id: team.manager.id },
        })
      ).error,
    ).toBeNull();
  });

  afterAll(async () => {
    if (attemptId) await svc.from('assessment_attempts').delete().eq('id', attemptId);
    if (interviewId) await svc.from('interview_sessions').delete().eq('id', interviewId);
    if (questionId) await svc.from('questions').delete().eq('id', questionId);
    if (team) {
      await svc.from('user_dbd_assignments').delete().eq('user_id', team.learner.id);
      await deleteTeam(team);
    }
  });

  it.each(['active', 'disabled'])(
    'cannot read retained private rows with an %s parent',
    async (status) => {
      expect(
        (await svc.from('profiles').update({ status }).eq('id', team.manager.id)).error,
      ).toBeNull();
      for (const table of privateTables) {
        const result = await client.from(table).select('*');
        expect.soft(result.error, table).toBeNull();
        expect.soft(result.data, table).toEqual([]);
      }
      expect((await client.from('profiles').select('id')).data).toEqual([{ id: team.learner.id }]);
    },
  );
});
