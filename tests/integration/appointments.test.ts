import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { THAI_BANK_HOLIDAYS_2026 } from '@/lib/config/policy-defaults';
import {
  AppointmentError,
  addBlock,
  bookAppointment,
  cancelAppointment,
  learnerCalendar,
  myUpcomingAppointment,
  removeBlock,
} from '@/lib/db/appointments';
import { loadProgressionFacts } from '@/lib/db/progression';
import { bangkokDateTime } from '@/lib/domain/appointments/slots';
import { addCalendarDays, todayInBangkok } from '@/lib/domain/thai-date';
import {
  adminClient,
  confirmRecord,
  createTestLearnerIn,
  createTestUser,
  deleteTeam,
  deleteTestUser,
  seedTeam,
  type Team,
  type TestUser,
} from './helpers';

const svc = adminClient();

/** The first day on or after `date` that is not a seeded bank holiday. */
function nextOpenDay(date: string): string {
  let d = date;
  while (THAI_BANK_HOLIDAYS_2026.includes(d)) d = addCalendarDays(d, 1);
  return d;
}

/** A ready learner whose window opened long ago: the issue date a year back. */
async function makeReady(userId: string, recordId: string) {
  await svc.from('user_dbd_assignments').insert({ user_id: userId, dbd_record_id: recordId });
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

async function upcomingCount(userId: string): Promise<number> {
  const { count } = await svc
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'booked')
    .gte('starts_at', new Date().toISOString());
  return count ?? 0;
}

describe('booking the bank appointment', () => {
  let team: Team;
  let second: TestUser;
  // An open day two weeks out; 09:00 Bangkok.
  const day = nextOpenDay(addCalendarDays(todayInBangkok(), 14));
  const slot = bangkokDateTime(day, 9);

  beforeAll(async () => {
    team = await seedTeam('จองนัด');
    await confirmRecord(team.recordId, team.manager.id);
    // The issue date drives the eligibility snapshot through the record trigger.
    await svc.from('dbd_records').update({ issued_on: '2025-09-01' }).eq('id', team.recordId);
    await makeReady(team.learner.id, team.recordId);
    second = await createTestLearnerIn(team.manager, { displayName: 'จองนัด สอง' });
    await makeReady(second.id, team.recordId);
  });

  afterAll(async () => {
    await svc.from('appointments').delete().in('user_id', [team.learner.id, second.id]);
    await svc.from('appointment_blocks').delete().eq('team_id', team.manager.id);
    await svc.from('interview_sessions').delete().in('user_id', [team.learner.id, second.id]);
    await deleteTestUser(second.id);
    await deleteTeam(team);
  });

  it('shows the week with free slots once the learner is ready and the window is open', async () => {
    const { gate, days } = await learnerCalendar(team.learner.id, day);
    expect(gate.status).toBe('available');
    expect(days).toHaveLength(7);
    expect(days[0].slots.filter((s) => s.state === 'free').length).toBeGreaterThan(0);
  });

  it('books one free slot, makes the step done, and refuses a second booking', async () => {
    const booking = await bookAppointment(team.learner.id, slot);
    expect(booking.team_id).toBe(team.manager.id);
    expect(booking.status).toBe('booked');
    const mine = await myUpcomingAppointment(team.learner.id);
    expect(mine?.id).toBe(booking.id);
    expect(mine?.managerName).toBe('จองนัด');
    const facts = await loadProgressionFacts(svc, team.learner.id);
    expect(facts.appointmentBooked).toBe(true);
    await expect(bookAppointment(team.learner.id, bangkokDateTime(day, 10))).rejects.toMatchObject({
      code: 'already_booked',
    });
  });

  it('lets exactly one of two learners take the same slot at the same instant', async () => {
    const held = await myUpcomingAppointment(team.learner.id);
    await cancelAppointment({ id: team.manager.id, role: 'manager' }, held!.id);
    const results = await Promise.allSettled([
      bookAppointment(team.learner.id, slot),
      bookAppointment(second.id, slot),
    ]);
    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect((lost[0].reason as AppointmentError).code).toBe('slot_taken');
    // The other learner sees the slot as taken, and nothing about who took it.
    const loser = results[0].status === 'fulfilled' ? second.id : team.learner.id;
    const { days } = await learnerCalendar(loser, day);
    expect(days[0].slots.find((s) => s.startsAt === slot)?.state).toBe('booked');
    // Trying again after the race reads the slot as booked, and gets the same answer.
    await expect(bookAppointment(loser, slot)).rejects.toMatchObject({ code: 'slot_taken' });
  });

  it('lets the learner cancel outside the notice window, which frees the slot', async () => {
    const holder =
      (await myUpcomingAppointment(team.learner.id)) ?? (await myUpcomingAppointment(second.id));
    await cancelAppointment({ id: holder!.user_id, role: 'learner' }, holder!.id);
    expect(await myUpcomingAppointment(holder!.user_id)).toBeNull();
    const { days } = await learnerCalendar(team.learner.id, day);
    expect(days[0].slots.find((s) => s.startsAt === slot)?.state).toBe('free');
  });

  it('holds a learner to one upcoming booking even when two requests race', async () => {
    // Spec §5.2: one upcoming appointment at a time — also when two tabs click together.
    const other = nextOpenDay(addCalendarDays(day, 7));
    const results = await Promise.allSettled([
      bookAppointment(team.learner.id, bangkokDateTime(other, 9)),
      bookAppointment(team.learner.id, bangkokDateTime(other, 10)),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(lost).toHaveLength(1);
    expect((lost[0].reason as AppointmentError).code).toBe('already_booked');
    expect(await upcomingCount(team.learner.id)).toBe(1);
    const mine = await myUpcomingAppointment(team.learner.id);
    await cancelAppointment({ id: team.manager.id, role: 'manager' }, mine!.id);
  });

  it('refuses a learner cancelling inside the notice window, but not the manager', async () => {
    const soon = bangkokDateTime(nextOpenDay(addCalendarDays(todayInBangkok(), 2)), 9);
    const booking = await bookAppointment(team.learner.id, soon);
    // A clock 23 hours before the slot.
    const late = new Date(new Date(soon).getTime() - 23 * 3_600_000);
    await expect(
      cancelAppointment({ id: team.learner.id, role: 'learner' }, booking.id, late),
    ).rejects.toMatchObject({ code: 'too_late' });
    await cancelAppointment({ id: team.manager.id, role: 'manager' }, booking.id, late);
    expect(await myUpcomingAppointment(team.learner.id)).toBeNull();
  });

  it('refuses a slot the manager blocked, a holiday and a time outside the hours', async () => {
    const block = await addBlock(
      { id: team.manager.id, role: 'manager' },
      { teamId: team.manager.id, date: day, fromHour: 9, toHour: 12, reason: 'ประชุม' },
    );
    await expect(bookAppointment(team.learner.id, bangkokDateTime(day, 10))).rejects.toMatchObject({
      code: 'slot_unavailable',
    });
    await removeBlock({ id: team.manager.id, role: 'manager' }, block.id);
    await expect(
      bookAppointment(team.learner.id, bangkokDateTime('2026-12-10', 9)),
    ).rejects.toMatchObject({ code: 'slot_unavailable' });
    await expect(bookAppointment(team.learner.id, bangkokDateTime(day, 7))).rejects.toMatchObject({
      code: 'slot_unavailable',
    });
  });

  it('refuses a learner who is not ready', async () => {
    const other = await seedTeam('ยังไม่พร้อม');
    try {
      await confirmRecord(other.recordId, other.manager.id);
      await svc.from('dbd_records').update({ issued_on: '2025-09-01' }).eq('id', other.recordId);
      await svc
        .from('user_dbd_assignments')
        .insert({ user_id: other.learner.id, dbd_record_id: other.recordId });
      await expect(bookAppointment(other.learner.id, slot)).rejects.toMatchObject({
        code: 'not_open',
      });
    } finally {
      await deleteTeam(other);
    }
  });

  it('books a learner without a manager on the admin calendar', async () => {
    // Review Focus 5: no manager → team_id null, and the team's calendar is untouched.
    const solo = await createTestUser('learner', { displayName: 'ไม่มีผู้จัดการ' });
    const later = nextOpenDay(addCalendarDays(day, 14));
    try {
      await makeReady(solo.id, team.recordId);
      const booking = await bookAppointment(solo.id, bangkokDateTime(later, 9));
      expect(booking.team_id).toBeNull();
      expect((await myUpcomingAppointment(solo.id))?.managerName).toBeNull();
      const { days } = await learnerCalendar(team.learner.id, later);
      expect(days[0].slots[0].state).toBe('free');
    } finally {
      await svc.from('appointments').delete().eq('user_id', solo.id);
      await svc.from('interview_sessions').delete().eq('user_id', solo.id);
      await deleteTestUser(solo.id);
    }
  });
});
