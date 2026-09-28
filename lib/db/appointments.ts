import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPolicy } from '@/lib/config/policy';
import {
  bangkokDateOf,
  bangkokDateTime,
  calendar,
  type DaySlots,
  type Interval,
  type SlotConfig,
  type Window,
} from '@/lib/domain/appointments/slots';
import { stageStatuses, type StageInfo } from '@/lib/domain/progression';
import { addCalendarDays, type ISODate } from '@/lib/domain/thai-date';
import { createSupabaseAdminClient } from './admin';
import { getActiveAssignmentForUser } from './assignments';
import type { Database } from './database.types';
import { loadProgressionFacts } from './progression';

type Db = SupabaseClient<Database>;
export type AppointmentRow = Database['public']['Tables']['appointments']['Row'];
export type AppointmentBlockRow = Database['public']['Tables']['appointment_blocks']['Row'];

export const CALENDAR_DAYS = 7;
/** How far the picker reaches when access never expires. */
export const HORIZON_DAYS = 84;
const HOUR_MS = 3_600_000;

export type AppointmentErrorCode =
  | 'not_open'
  | 'already_booked'
  | 'slot_unavailable'
  | 'slot_taken'
  | 'not_found'
  | 'too_late'
  | 'forbidden';

export class AppointmentError extends Error {
  constructor(
    message: string,
    public readonly code: AppointmentErrorCode,
    public readonly gate?: StageInfo,
  ) {
    super(message);
    this.name = 'AppointmentError';
  }
}

export async function appointmentConfig(): Promise<SlotConfig> {
  const [hoursStart, hoursEnd, slotMinutes, noticeHours, holidays] = await Promise.all([
    getPolicy('appointment_hours_start'),
    getPolicy('appointment_hours_end'),
    getPolicy('appointment_slot_minutes'),
    getPolicy('appointment_notice_hours'),
    getPolicy('appointment_holidays'),
  ]);
  return { hoursStart, hoursEnd, slotMinutes, noticeHours, holidays };
}

/** The learner's calendar is their manager's; a learner without one books with the admin. */
export async function teamOf(userId: string): Promise<string | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from('profiles')
    .select('manager_id')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data.manager_id;
}

const toInterval = (r: { starts_at: string; ends_at: string }): Interval => ({
  startsAt: new Date(r.starts_at).toISOString(),
  endsAt: new Date(r.ends_at).toISOString(),
});

/** The team's slot states over a range: bookings and blocks read under the service role, states only. */
export async function calendarFor(args: {
  teamId: string | null;
  from: ISODate;
  days: number;
  window: Window;
  now?: Date;
}): Promise<DaySlots[]> {
  const admin = createSupabaseAdminClient();
  const cfg = await appointmentConfig();
  const rangeStart = bangkokDateTime(args.from, 0);
  const rangeEnd = bangkokDateTime(addCalendarDays(args.from, args.days), 0);
  const bookingsQuery = admin
    .from('appointments')
    .select('starts_at, ends_at')
    .eq('status', 'booked')
    .lt('starts_at', rangeEnd)
    .gt('ends_at', rangeStart);
  const blocksQuery = admin
    .from('appointment_blocks')
    .select('starts_at, ends_at')
    .lt('starts_at', rangeEnd)
    .gt('ends_at', rangeStart);
  const [bookings, blocks] = await Promise.all([
    args.teamId === null
      ? bookingsQuery.is('team_id', null)
      : bookingsQuery.eq('team_id', args.teamId),
    args.teamId === null ? blocksQuery.is('team_id', null) : blocksQuery.eq('team_id', args.teamId),
  ]);
  if (bookings.error) throw bookings.error;
  if (blocks.error) throw blocks.error;
  return calendar({
    from: args.from,
    days: args.days,
    cfg,
    window: args.window,
    bookings: (bookings.data ?? []).map(toInterval),
    blocks: (blocks.data ?? []).map(toInterval),
    now: args.now ?? new Date(),
  });
}

function windowOf(facts: { eligibility: Window | null; today: ISODate }): Window | null {
  if (!facts.eligibility) return null;
  return {
    availableFrom: facts.eligibility.availableFrom,
    expiresAt: facts.eligibility.expiresAt ?? addCalendarDays(facts.today, HORIZON_DAYS),
  };
}

/** The gate and, when open, the learner's week from `from` (clamped to the window and the horizon). */
export async function learnerCalendar(
  userId: string,
  from: ISODate,
  now: Date = new Date(),
): Promise<{ gate: StageInfo; days: DaySlots[]; window: Window | null }> {
  const admin = createSupabaseAdminClient();
  const facts = await loadProgressionFacts(admin, userId);
  const gate = stageStatuses(facts).appointment;
  const window = windowOf(facts);
  if (gate.status !== 'available' || !window) return { gate, days: [], window };
  const days = await calendarFor({
    teamId: await teamOf(userId),
    from,
    days: CALENDAR_DAYS,
    window,
    now,
  });
  return { gate, days, window };
}

export type MyAppointment = AppointmentRow & { managerName: string | null };

export async function myUpcomingAppointment(
  userId: string,
  now: Date = new Date(),
): Promise<MyAppointment | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('appointments')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'booked')
    .gte('starts_at', now.toISOString())
    .order('starts_at')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  let managerName: string | null = null;
  if (data.team_id) {
    const { data: manager } = await admin
      .from('profiles')
      .select('display_name, login_id')
      .eq('id', data.team_id)
      .maybeSingle();
    managerName = manager?.display_name ?? manager?.login_id ?? null;
  }
  return { ...data, managerName };
}

/**
 * Spec §5.2: server-side, re-validating readiness, the window, the slot and the team. The
 * unique index settles a tie; its violation is reported as slot_taken.
 */
export async function bookAppointment(
  userId: string,
  startsAt: string,
  now: Date = new Date(),
): Promise<AppointmentRow> {
  const admin = createSupabaseAdminClient();
  const facts = await loadProgressionFacts(admin, userId);
  const gate = stageStatuses(facts).appointment;
  if (gate.status === 'done') throw new AppointmentError('Already booked', 'already_booked');
  const window = windowOf(facts);
  if (gate.status !== 'available' || !window) {
    throw new AppointmentError('The appointment is not open', 'not_open', gate);
  }
  const at = new Date(startsAt);
  if (Number.isNaN(at.getTime())) throw new AppointmentError('Bad time', 'slot_unavailable');
  const iso = at.toISOString();
  const teamId = await teamOf(userId);
  const [day] = await calendarFor({ teamId, from: bangkokDateOf(iso), days: 1, window, now });
  const slot = day.slots.find((s) => s.startsAt === iso);
  if (!slot || slot.state !== 'free') {
    throw new AppointmentError('The slot is not free', 'slot_unavailable');
  }
  const assignment = await getActiveAssignmentForUser(admin, userId);
  if (!assignment) throw new AppointmentError('No assignment', 'not_open');
  const { data, error } = await admin
    .from('appointments')
    .insert({
      user_id: userId,
      team_id: teamId,
      dbd_record_id: assignment.dbd_record_id,
      starts_at: slot.startsAt,
      ends_at: slot.endsAt,
      status: 'booked',
    })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') throw new AppointmentError('The slot was just taken', 'slot_taken');
    throw error;
  }
  return data;
}

/** The learner until noticeHours before; a manager for their team any time; the admin any time. */
export async function cancelAppointment(
  actor: { id: string; role: 'learner' | 'manager' | 'admin' },
  appointmentId: string,
  now: Date = new Date(),
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data: row } = await admin
    .from('appointments')
    .select('*')
    .eq('id', appointmentId)
    .eq('status', 'booked')
    .maybeSingle();
  if (!row) throw new AppointmentError('No such booking', 'not_found');
  if (actor.role === 'learner') {
    if (row.user_id !== actor.id) throw new AppointmentError('No such booking', 'not_found');
    const { noticeHours } = await appointmentConfig();
    if (new Date(row.starts_at).getTime() - now.getTime() < noticeHours * HOUR_MS) {
      throw new AppointmentError('Inside the notice window', 'too_late');
    }
  } else if (actor.role === 'manager' && row.team_id !== actor.id) {
    throw new AppointmentError('Another team', 'forbidden');
  }
  const { error } = await admin
    .from('appointments')
    .update({ status: 'cancelled', cancelled_at: now.toISOString(), cancelled_by: actor.id })
    .eq('id', appointmentId);
  if (error) throw error;
}

export type StaffAppointmentRow = AppointmentRow & {
  profiles: { login_id: string; display_name: string | null };
  dbd_records: { company_name_th: string | null } | null;
};

/** Upcoming bookings through the caller's client: RLS narrows a manager to their team. */
export async function listAppointmentsForStaff(
  db: Db,
  args: { teamId?: string | null; from: ISODate },
): Promise<StaffAppointmentRow[]> {
  const base = db
    .from('appointments')
    .select(
      '*, profiles!appointments_user_id_fkey(login_id, display_name), dbd_records(company_name_th)',
    )
    .eq('status', 'booked')
    .gte('starts_at', bangkokDateTime(args.from, 0))
    .order('starts_at')
    .limit(500);
  const { data, error } = await (args.teamId === undefined
    ? base
    : args.teamId === null
      ? base.is('team_id', null)
      : base.eq('team_id', args.teamId));
  if (error) throw error;
  return data as unknown as StaffAppointmentRow[];
}

export async function listBlocks(
  db: Db,
  args: { teamId: string | null; from: ISODate },
): Promise<AppointmentBlockRow[]> {
  const base = db
    .from('appointment_blocks')
    .select('*')
    .gte('ends_at', bangkokDateTime(args.from, 0))
    .order('starts_at');
  const { data, error } = await (args.teamId === null
    ? base.is('team_id', null)
    : base.eq('team_id', args.teamId));
  if (error) throw error;
  return data;
}

function assertTeam(actor: { id: string; role: 'manager' | 'admin' }, teamId: string | null) {
  if (actor.role === 'manager' && teamId !== actor.id) {
    throw new AppointmentError('Another team', 'forbidden');
  }
}

/** A manager blocks hours they cannot take (spec §5.1); the admin can block any calendar. */
export async function addBlock(
  actor: { id: string; role: 'manager' | 'admin' },
  args: {
    teamId: string | null;
    date: ISODate;
    fromHour: number;
    toHour: number;
    reason: string | null;
  },
): Promise<AppointmentBlockRow> {
  assertTeam(actor, args.teamId);
  if (!(args.fromHour < args.toHour)) throw new AppointmentError('Bad hours', 'slot_unavailable');
  const { data, error } = await createSupabaseAdminClient()
    .from('appointment_blocks')
    .insert({
      team_id: args.teamId,
      starts_at: bangkokDateTime(args.date, args.fromHour),
      ends_at: bangkokDateTime(args.date, args.toHour),
      reason: args.reason,
      created_by: actor.id,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeBlock(
  actor: { id: string; role: 'manager' | 'admin' },
  blockId: string,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data: block } = await admin
    .from('appointment_blocks')
    .select('team_id')
    .eq('id', blockId)
    .maybeSingle();
  if (!block) throw new AppointmentError('No such block', 'not_found');
  assertTeam(actor, block.team_id);
  const { error } = await admin.from('appointment_blocks').delete().eq('id', blockId);
  if (error) throw error;
}
