import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AppointmentError,
  bookAppointmentForManager,
  cancelAppointment,
  listAppointmentsForStaff,
  myUpcomingAppointment,
} from '@/lib/db/appointments';
import { bangkokDateOf } from '@/lib/domain/appointments/slots';
import { addCalendarDays, todayInBangkok } from '@/lib/domain/thai-date';
import {
  adminClient,
  confirmRecord,
  createTestLearnerIn,
  deleteTeam,
  deleteTestUser,
  seedTeam,
  type Team,
  type TestUser,
} from './helpers';

const svc = adminClient();

async function assign(userId: string, recordId: string) {
  const { error } = await svc
    .from('user_dbd_assignments')
    .insert({ user_id: userId, dbd_record_id: recordId });
  if (error) throw error;
}

async function passExam(userId: string, recordId: string, attemptNo = 1) {
  const { error } = await svc.from('assessment_attempts').insert({
    user_id: userId,
    dbd_record_id: recordId,
    kind: 'exam',
    language: 'th',
    attempt_no: attemptNo,
    status: 'submitted',
    question_ids: [],
    shuffle_seed: `manager-booking-${attemptNo}`,
    passing_mark_snapshot: 80,
    score: 1,
    max_score: 1,
    result: 'pass',
    submitted_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function passInterview(userId: string, recordId: string) {
  const { error } = await svc.from('interview_sessions').insert({
    user_id: userId,
    dbd_record_id: recordId,
    status: 'completed',
    verdict: 'ready',
    plan: { items: [], cursor: 0 },
    provider: 'fake',
  });
  if (error) throw error;
}

async function bookedCount(userId: string): Promise<number> {
  const { count, error } = await svc
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'booked');
  if (error) throw error;
  return count ?? 0;
}

describe('manager-booked date-only appointments (D102)', () => {
  let team: Team;
  let otherTeam: Team;
  let examOnly: TestUser;
  let interviewOnly: TestUser;
  const today = todayInBangkok();
  const firstDate = addCalendarDays(today, 10);
  const replacementDate = addCalendarDays(today, 18);

  beforeAll(async () => {
    team = await seedTeam('ผู้จัดการจองวัน');
    otherTeam = await seedTeam('ทีมอื่น');
    await confirmRecord(team.recordId, team.manager.id);
    await confirmRecord(otherTeam.recordId, otherTeam.manager.id);
    await assign(team.learner.id, team.recordId);
    await passExam(team.learner.id, team.recordId);
    await passInterview(team.learner.id, team.recordId);

    examOnly = await createTestLearnerIn(team.manager, { displayName: 'ผ่านแบบทดสอบเท่านั้น' });
    await assign(examOnly.id, team.recordId);
    await passExam(examOnly.id, team.recordId);

    interviewOnly = await createTestLearnerIn(team.manager, {
      displayName: 'ผ่านสัมภาษณ์เท่านั้น',
    });
    await assign(interviewOnly.id, team.recordId);
    await passInterview(interviewOnly.id, team.recordId);
  });

  afterAll(async () => {
    const ids = [team.learner.id, examOnly.id, interviewOnly.id];
    await svc.from('appointments').delete().in('user_id', ids);
    await svc.from('assessment_attempts').delete().in('user_id', ids);
    await svc.from('interview_sessions').delete().in('user_id', ids);
    await svc.from('user_dbd_assignments').delete().in('user_id', [examOnly.id, interviewOnly.id]);
    await deleteTestUser(examOnly.id);
    await deleteTestUser(interviewOnly.id);
    await deleteTeam(otherTeam);
    await deleteTeam(team);
  });

  it('requires the owning manager and both readiness gates', async () => {
    await expect(
      bookAppointmentForManager(otherTeam.manager.id, team.learner.id, firstDate),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      bookAppointmentForManager(team.manager.id, examOnly.id, firstDate),
    ).rejects.toMatchObject({ code: 'not_open' });
    await expect(
      bookAppointmentForManager(team.manager.id, interviewOnly.id, firstDate),
    ).rejects.toMatchObject({ code: 'not_open' });
    await expect(
      bookAppointmentForManager(team.manager.id, team.learner.id, addCalendarDays(today, -1)),
    ).rejects.toMatchObject({ code: 'slot_unavailable' });
  });

  it('books a date and replaces the same row when the manager chooses another', async () => {
    const first = await bookAppointmentForManager(team.manager.id, team.learner.id, firstDate);
    expect(first.team_id).toBe(team.manager.id);
    expect(bangkokDateOf(first.starts_at)).toBe(firstDate);

    const replaced = await bookAppointmentForManager(
      team.manager.id,
      team.learner.id,
      replacementDate,
    );
    expect(replaced.id).toBe(first.id);
    expect(bangkokDateOf(replaced.starts_at)).toBe(replacementDate);
    expect(await bookedCount(team.learner.id)).toBe(1);
    expect((await myUpcomingAppointment(team.learner.id))?.id).toBe(first.id);
  });

  it('keeps one booked row when two first-date requests race', async () => {
    const held = await myUpcomingAppointment(team.learner.id);
    await cancelAppointment({ id: team.manager.id, role: 'manager' }, held!.id);
    const dates = [addCalendarDays(today, 20), addCalendarDays(today, 21)] as const;
    const results = await Promise.allSettled(
      dates.map((date) => bookAppointmentForManager(team.manager.id, team.learner.id, date)),
    );
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(await bookedCount(team.learner.id)).toBe(1);
    expect(dates).toContain(
      bangkokDateOf((await myUpcomingAppointment(team.learner.id))!.starts_at),
    );
  });

  it('is visible to the learner and the owning manager and can be cancelled by that manager', async () => {
    const mine = await myUpcomingAppointment(team.learner.id);
    expect(mine?.managerName).toBe('ผู้จัดการจองวัน');
    const rows = await listAppointmentsForStaff(team.asManager, {
      teamId: team.manager.id,
      from: today,
    });
    expect(rows.some((row) => row.id === mine?.id)).toBe(true);
    await cancelAppointment({ id: team.manager.id, role: 'manager' }, mine!.id);
    expect(await myUpcomingAppointment(team.learner.id)).toBeNull();
  });

  it('still rejects cancellation by a manager from another team', async () => {
    const booking = await bookAppointmentForManager(team.manager.id, team.learner.id, firstDate);
    await expect(
      cancelAppointment({ id: otherTeam.manager.id, role: 'manager' }, booking.id),
    ).rejects.toBeInstanceOf(AppointmentError);
  });

  it('keeps a date-only appointment visible for the whole selected day', async () => {
    const evening = new Date(`${today}T18:00:00+07:00`);
    const booking = await bookAppointmentForManager(
      team.manager.id,
      team.learner.id,
      today,
      evening,
    );
    expect((await myUpcomingAppointment(team.learner.id, evening))?.id).toBe(booking.id);
  });
});
