# P16b — Appointments — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once a learner is _ready_ and the 45-day window is open, they book one slot on their team's calendar for the real bank visit; nobody else in the team can take that time; the manager sees and manages the bookings; the calendar is open every day except Thai public holidays.

**Architecture:** A pure slot engine (`lib/domain/appointments/slots.ts`) turns a day range, the policy (hours, slot length, notice, holidays), the learner's window, the team's bookings and blocks into slot states; `lib/db/appointments.ts` owns booking, cancellation and blocks under the service role after the checks, with RLS reads for learners and staff; the database's partial unique index settles two learners clicking together; progression's `appointmentBooked` fact becomes real; the learner gets a week picker at `/appointment`, staff a day list with blocks at `/admin/appointments`, and the dashboard shows the booked card.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (RLS, definer predicates from P15), next-intl th/en/zh, Tailwind v4 tokens, Vitest, Playwright. Times are Asia/Bangkok, a fixed UTC+7 with no daylight saving, stored as `timestamptz`.

**Spec:** `docs/superpowers/specs/2026-09-28-bank-readiness-interview-and-appointments-design.md` §3, §5, §7, §8, §9, §11 (the interview parts are P16a, merged as `3ee2a7b`).

## Global Constraints

- One calendar per team: `team_id` is the manager's profile id; learners with no manager (admin-owned records) book on the admin's calendar, `team_id` null (spec §5.1).
- Open every day except Thai public holidays (`appointment_holidays`, ISO dates, seeded with the 2026 Bank of Thailand list, the owner verifies it, the admin maintains it each December); weekends are ordinary days.
- A slot holds one learner: the partial unique index on `(coalesce(team_id, '00000000-0000-0000-0000-000000000000'), starts_at) where status = 'booked'` is the arbiter; the loser is told the slot has just been taken (spec §5.2).
- A learner holds one upcoming appointment at a time; reschedule = cancel + book; the learner cancels until `appointment_notice_hours` before, the manager any time; a cancellation returns the step to `available`.
- Booking is server-side and re-validates readiness, the eligibility window, the slot and the team (spec §5.2). Writes go through the service role after those checks; learners and staff read through RLS.
- The learner's picker never shows who holds a slot: only its state.
- Keep every existing `data-testid`; new strings in th, en and zh; tokens only in learner screens; `LearnerShell` for learner pages.
- Never leave a `next dev` running while Playwright runs; `pnpm db:reset` before the full gate.

## Review Focus

1. Two learners of one team booking the same slot in the same instant: exactly one row, the other told `slot_taken`, no 500 (Task 4 pins it with `Promise.allSettled`).
2. A holiday added after a booking exists does not cancel the booking; the manager decides (Task 2's engine marks the day, Task 4 leaves the row alone).
3. The notice window: a slot 23 hours away is not bookable and a booking 23 hours away cannot be cancelled by the learner, but the manager can (Tasks 2, 4).
4. The window's end: with `expires_at` set, the day after it offers no slots; with it null, the picker runs to its horizon (Task 2).
5. A learner whose manager is null books on the admin calendar and the admin's page shows it under "admin calendar"; a manager never sees another team's booking (Tasks 3, 4, 7).

---

### Task 1: Policy keys and the holiday list

**Files:**
- Modify: `lib/config/policy-defaults.ts`, `lib/config/policy-schema.ts`, `messages/th.json`, `messages/en.json`, `messages/zh.json` (`admin.settings.keys.*`)
- Modify: `tests/unit/config/policy-schema.test.ts`

**Interfaces:**
- Produces: policy keys `appointment_holidays: string[]` (ISO dates, default `THAI_BANK_HOLIDAYS_2026`), `appointment_hours_start: number` (9), `appointment_hours_end: number` (16), `appointment_slot_minutes: number` (60), `appointment_notice_hours: number` (24); exported `THAI_BANK_HOLIDAYS_2026`.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/config/policy-schema.test.ts`, inside the existing `describe`:

```ts
  it('parses the appointment keys: a date list, hours and minutes in range', () => {
    expect(parsePolicyInput('appointment_holidays', '2026-10-13\n2026-12-07\n')).toEqual({
      ok: true,
      value: ['2026-10-13', '2026-12-07'],
    });
    expect(parsePolicyInput('appointment_holidays', '13/10/2026')).toMatchObject({ ok: false });
    expect(parsePolicyInput('appointment_hours_start', '9')).toEqual({ ok: true, value: 9 });
    expect(parsePolicyInput('appointment_hours_end', '25')).toMatchObject({ ok: false });
    expect(parsePolicyInput('appointment_slot_minutes', '60')).toEqual({ ok: true, value: 60 });
    expect(parsePolicyInput('appointment_notice_hours', '24')).toEqual({ ok: true, value: 24 });
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run tests/unit/config/policy-schema.test.ts`
Expected: FAIL — `appointment_holidays` is not a policy key.

- [ ] **Step 3: Add the keys**

`lib/config/policy-defaults.ts` — after `study_completion_tracking`:

```ts
  // Appointments (P16b, spec §5.1): Bangkok hours, one learner per slot, the Thai bank holidays.
  appointment_hours_start: 9 as number,
  appointment_hours_end: 16 as number,
  appointment_slot_minutes: 60 as number,
  appointment_notice_hours: 24 as number,
  appointment_holidays: THAI_BANK_HOLIDAYS_2026 as string[],
```

and above `POLICY_DEFAULTS`:

```ts
/**
 * The Bank of Thailand's 2026 public holidays as ISO dates, substitution days included. The
 * lunar dates (Makha Bucha, Visakha Bucha, Asanha Bucha) and any special holiday the cabinet
 * adds are the owner's to verify against the published list; the admin edits the key in
 * Settings and adds next year's list each December (spec §5.1).
 */
export const THAI_BANK_HOLIDAYS_2026 = [
  '2026-01-01', // New Year's Day
  '2026-03-03', // Makha Bucha Day
  '2026-04-06', // Chakri Memorial Day
  '2026-04-13', // Songkran
  '2026-04-14', // Songkran
  '2026-04-15', // Songkran
  '2026-05-01', // National Labour Day
  '2026-05-04', // Coronation Day
  '2026-06-01', // Substitution for Visakha Bucha Day (Sunday 31 May)
  '2026-06-03', // H.M. Queen Suthida's Birthday
  '2026-07-28', // H.M. King Vajiralongkorn's Birthday
  '2026-07-29', // Asanha Bucha Day
  '2026-08-12', // H.M. Queen Sirikit The Queen Mother's Birthday
  '2026-10-13', // H.M. King Bhumibol Adulyadej Memorial Day
  '2026-10-23', // Chulalongkorn Day
  '2026-12-07', // Substitution for H.M. King Bhumibol Adulyadej's Birthday (Saturday 5 December)
  '2026-12-10', // Constitution Day
  '2026-12-31', // New Year's Eve
];
```

`lib/config/policy-schema.ts` — after `study_completion_tracking`:

```ts
  appointment_hours_start: {
    control: { kind: 'number', min: 0, max: 23, nullable: false },
    schema: intRange(0, 23),
  },
  appointment_hours_end: {
    control: { kind: 'number', min: 1, max: 24, nullable: false },
    schema: intRange(1, 24),
  },
  appointment_slot_minutes: {
    control: { kind: 'number', min: 15, max: 240, nullable: false },
    schema: intRange(15, 240),
  },
  appointment_notice_hours: {
    control: { kind: 'number', min: 0, max: 168, nullable: false },
    schema: intRange(0, 168),
  },
  appointment_holidays: { control: { kind: 'list' }, schema: isoDateList },
```

with, next to `stringList`:

```ts
const isoDateList = z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(100);
```

Settings labels, in each catalog under `admin.settings.keys` (same `{label, help}` shape):

| key | th | en | zh |
| --- | --- | --- | --- |
| appointment_hours_start | เวลาเริ่มนัดหมาย (ชั่วโมง) / ชั่วโมงแรกของวันที่เปิดจอง เวลาไทย เช่น 9 | Appointment hours start / First bookable hour of the day, Bangkok time, e.g. 9 | 预约开始时间（小时） / 每天可预约的第一个小时，曼谷时间，例如 9 |
| appointment_hours_end | เวลาสิ้นสุดนัดหมาย (ชั่วโมง) / ชั่วโมงที่ปิดจอง เวลาไทย เช่น 16 (ช่วงสุดท้ายจบก่อนเวลานี้) | Appointment hours end / The hour bookings stop, Bangkok time, e.g. 16 (the last slot ends by then) | 预约结束时间（小时） / 停止预约的小时，曼谷时间，例如 16（最后一个时段在此之前结束） |
| appointment_slot_minutes | ความยาวช่วงนัดหมาย (นาที) / ความยาวของแต่ละช่วง เช่น 60 | Slot length (minutes) / How long each slot lasts, e.g. 60 | 时段长度（分钟） / 每个时段的时长，例如 60 |
| appointment_notice_hours | แจ้งล่วงหน้า (ชั่วโมง) / จองและยกเลิกได้ถึงกี่ชั่วโมงก่อนเวลานัด | Notice (hours) / How many hours before a slot a learner may still book or cancel | 提前通知（小时） / 学员最迟可在时段前多少小时预约或取消 |
| appointment_holidays | วันหยุดธนาคาร / วันหยุดตามประกาศธนาคารแห่งประเทศไทย บรรทัดละหนึ่งวัน รูปแบบ ปี-เดือน-วัน (ค.ศ.) รวมวันหยุดชดเชย ต้องเพิ่มของปีถัดไปทุกเดือนธันวาคม | Bank holidays / The Bank of Thailand's public holidays, one ISO date (YYYY-MM-DD) per line, substitution days included; add next year's list each December | 银行假日 / 泰国央行公布的公共假日，每行一个 ISO 日期（YYYY-MM-DD），含补假；每年 12 月补充下一年的列表 |

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/unit/config/policy-schema.test.ts tests/unit/messages.test.ts`
Expected: PASS. The Settings page lists the five new keys automatically (`listPolicies` iterates `POLICY_FIELD_KEYS`).

- [ ] **Step 5: Commit**

```bash
git add lib/config/policy-defaults.ts lib/config/policy-schema.ts messages tests/unit/config/policy-schema.test.ts
git commit -m "feat(appointments): the calendar policy keys and the 2026 bank holidays"
```

---

### Task 2: The slot engine

**Files:**
- Create: `lib/domain/appointments/slots.ts`
- Create: `tests/unit/domain/appointments/slots.test.ts`

**Interfaces:**
- Produces (pure):

```ts
export type SlotConfig = {
  hoursStart: number;      // Bangkok hour the day opens, e.g. 9
  hoursEnd: number;        // Bangkok hour it closes, e.g. 16 (the last slot ends by then)
  slotMinutes: number;     // 60
  noticeHours: number;     // 24
  holidays: readonly ISODate[];
};
export type Interval = { startsAt: string; endsAt: string };   // ISO timestamps
export type SlotState = 'free' | 'booked' | 'blocked' | 'holiday' | 'past' | 'outside_window';
export type Slot = Interval & { state: SlotState };
export type DaySlots = { date: ISODate; holiday: boolean; slots: Slot[] };
export type Window = { availableFrom: ISODate; expiresAt: ISODate | null };
export function bangkokDateTime(date: ISODate, hour: number, minute?: number): string; // that Bangkok wall time as an ISO UTC string
export function bangkokDateOf(timestamp: string | Date): ISODate;
export function overlaps(a: Interval, b: Interval): boolean;
export function daySlots(date: ISODate, cfg: SlotConfig): Interval[];
export function calendar(args: { from: ISODate; days: number; cfg: SlotConfig; window: Window; bookings: Interval[]; blocks: Interval[]; now: Date }): DaySlots[];
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  bangkokDateOf,
  bangkokDateTime,
  calendar,
  daySlots,
  type SlotConfig,
} from '@/lib/domain/appointments/slots';

const cfg: SlotConfig = {
  hoursStart: 9,
  hoursEnd: 16,
  slotMinutes: 60,
  noticeHours: 24,
  holidays: ['2026-10-13', '2026-10-23'],
};
const window = { availableFrom: '2026-10-01', expiresAt: null };
// A Thursday, 08:00 Bangkok.
const now = new Date('2026-10-08T01:00:00Z');

describe('bangkok time', () => {
  it('turns a Bangkok wall time into UTC and back', () => {
    expect(bangkokDateTime('2026-10-13', 9)).toBe('2026-10-13T02:00:00.000Z');
    expect(bangkokDateOf('2026-10-13T02:00:00.000Z')).toBe('2026-10-13');
    // 23:30 Bangkok is still the same date, though it is the next day's morning in UTC terms.
    expect(bangkokDateOf('2026-10-12T16:30:00.000Z')).toBe('2026-10-12');
  });
});

describe('daySlots', () => {
  it('cuts the hours into slots that end by the closing hour', () => {
    const slots = daySlots('2026-10-14', cfg);
    expect(slots).toHaveLength(7);
    expect(slots[0]).toEqual({
      startsAt: '2026-10-14T02:00:00.000Z',
      endsAt: '2026-10-14T03:00:00.000Z',
    });
    expect(slots[6].endsAt).toBe('2026-10-14T09:00:00.000Z');
    expect(daySlots('2026-10-14', { ...cfg, slotMinutes: 90 })).toHaveLength(4);
  });
});

describe('calendar', () => {
  it('opens weekends and closes holidays', () => {
    const days = calendar({ from: '2026-10-10', days: 4, cfg, window, bookings: [], blocks: [], now });
    expect(days.map((d) => d.date)).toEqual(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']);
    expect(days[0].slots.every((s) => s.state === 'free')).toBe(true); // Saturday
    expect(days[1].slots.every((s) => s.state === 'free')).toBe(true); // Sunday
    expect(days[3].holiday).toBe(true);
    expect(days[3].slots.every((s) => s.state === 'holiday')).toBe(true);
  });

  it('respects the notice hours, not merely the past', () => {
    // now = Thursday 08:00 Bangkok, 24 h notice: today's slots and Friday 09:00 (25 h away) differ.
    const [today, friday] = calendar({ from: '2026-10-08', days: 2, cfg, window, bookings: [], blocks: [], now });
    expect(today.slots.every((s) => s.state === 'past')).toBe(true);
    expect(friday.slots[0].state).toBe('free');
    const tight = calendar({ from: '2026-10-08', days: 1, cfg: { ...cfg, noticeHours: 0 }, window, bookings: [], blocks: [], now });
    expect(tight[0].slots[0].state).toBe('free'); // 09:00 today, one hour ahead
  });

  it('keeps the learner inside the eligibility window', () => {
    const days = calendar({
      from: '2026-10-30',
      days: 3,
      cfg,
      window: { availableFrom: '2026-10-31', expiresAt: '2026-10-31' },
      bookings: [],
      blocks: [],
      now,
    });
    expect(days[0].slots.every((s) => s.state === 'outside_window')).toBe(true);
    expect(days[1].slots.every((s) => s.state === 'free')).toBe(true);
    expect(days[2].slots.every((s) => s.state === 'outside_window')).toBe(true);
  });

  it('marks booked and blocked slots by overlap', () => {
    const [day] = calendar({
      from: '2026-10-14',
      days: 1,
      cfg,
      window,
      bookings: [{ startsAt: bangkokDateTime('2026-10-14', 10), endsAt: bangkokDateTime('2026-10-14', 11) }],
      blocks: [{ startsAt: bangkokDateTime('2026-10-14', 13, 30), endsAt: bangkokDateTime('2026-10-14', 15) }],
      now,
    });
    expect(day.slots.map((s) => s.state)).toEqual([
      'free', 'booked', 'free', 'free', 'blocked', 'blocked', 'free',
    ]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run tests/unit/domain/appointments`
Expected: FAIL — `Cannot find package '@/lib/domain/appointments/slots'`.

- [ ] **Step 3: Implement**

```ts
import { addCalendarDays, type ISODate } from '@/lib/domain/thai-date';

/** Bangkok is UTC+7 all year, so wall time converts with a fixed offset (spec §5.1). */
const OFFSET = '+07:00';
const HOUR_MS = 3_600_000;

export type SlotConfig = {
  hoursStart: number;
  hoursEnd: number;
  slotMinutes: number;
  noticeHours: number;
  holidays: readonly ISODate[];
};
export type Interval = { startsAt: string; endsAt: string };
export type SlotState = 'free' | 'booked' | 'blocked' | 'holiday' | 'past' | 'outside_window';
export type Slot = Interval & { state: SlotState };
export type DaySlots = { date: ISODate; holiday: boolean; slots: Slot[] };
export type Window = { availableFrom: ISODate; expiresAt: ISODate | null };

const pad = (n: number) => String(n).padStart(2, '0');

/** That Bangkok wall time as an ISO UTC string. */
export function bangkokDateTime(date: ISODate, hour: number, minute = 0): string {
  return new Date(`${date}T${pad(hour)}:${pad(minute)}:00${OFFSET}`).toISOString();
}

/** The Bangkok calendar date a timestamp falls on. */
export function bangkokDateOf(timestamp: string | Date): ISODate {
  const shifted = new Date(new Date(timestamp).getTime() + 7 * HOUR_MS);
  return shifted.toISOString().slice(0, 10);
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

/** The day's grid: slots of slotMinutes from the opening hour, the last one ending by closing. */
export function daySlots(date: ISODate, cfg: SlotConfig): Interval[] {
  const out: Interval[] = [];
  const close = new Date(bangkokDateTime(date, cfg.hoursEnd)).getTime();
  let start = new Date(bangkokDateTime(date, cfg.hoursStart)).getTime();
  while (start + cfg.slotMinutes * 60_000 <= close) {
    const end = start + cfg.slotMinutes * 60_000;
    out.push({ startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() });
    start = end;
  }
  return out;
}

/**
 * Spec §5.1: a free slot is on a day that is not a public holiday, inside the hours, not blocked,
 * not booked, at least noticeHours away, on or after available_from and, when set, on or before
 * expires_at. Weekends are open days like any other.
 */
export function calendar(args: {
  from: ISODate;
  days: number;
  cfg: SlotConfig;
  window: Window;
  bookings: Interval[];
  blocks: Interval[];
  now: Date;
}): DaySlots[] {
  const { cfg, window, bookings, blocks } = args;
  const earliest = args.now.getTime() + cfg.noticeHours * HOUR_MS;
  const out: DaySlots[] = [];
  for (let i = 0; i < args.days; i++) {
    const date = addCalendarDays(args.from, i);
    const holiday = cfg.holidays.includes(date);
    const outside = date < window.availableFrom || (window.expiresAt !== null && date > window.expiresAt);
    const slots = daySlots(date, cfg).map((slot): Slot => {
      if (holiday) return { ...slot, state: 'holiday' };
      if (outside) return { ...slot, state: 'outside_window' };
      if (new Date(slot.startsAt).getTime() < earliest) return { ...slot, state: 'past' };
      if (bookings.some((b) => overlaps(slot, b))) return { ...slot, state: 'booked' };
      if (blocks.some((b) => overlaps(slot, b))) return { ...slot, state: 'blocked' };
      return { ...slot, state: 'free' };
    });
    out.push({ date, holiday, slots });
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/unit/domain/appointments`
Expected: PASS 6/6.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/appointments tests/unit/domain/appointments
git commit -m "feat(appointments): the slot engine — hours, holidays, notice, window, bookings and blocks"
```

---

### Task 3: Migration — appointments and blocks under RLS

**Files:**
- Create: `supabase/migrations/20260928020000_appointments.sql`
- Modify: `lib/db/database.types.ts` (regenerated)
- Create: `tests/integration/appointments.rls.test.ts`

**Interfaces:**
- Produces: tables `public.appointments`, `public.appointment_blocks` as spec §7, the one-per-slot index, reads by RLS (learner own; manager `team_id = auth.uid()`; admin all; blocks staff only), writes service-role only.

- [ ] **Step 1: Write the failing RLS test**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, clientFor, deleteTeam, seedTeam, type Team } from './helpers';

const svc = adminClient();

/** Spec §7: a booking is the learner's, their manager's and the admin's; blocks are the staff's. */
describe('appointments under RLS', () => {
  let a: Team;
  let b: Team;
  let bookingId: string;
  let blockId: string;

  beforeAll(async () => {
    a = await seedTeam('นัดหมายเอ');
    b = await seedTeam('นัดหมายบี');
    const { data: booking, error } = await svc
      .from('appointments')
      .insert({
        user_id: a.learner.id,
        team_id: a.manager.id,
        dbd_record_id: a.recordId,
        starts_at: '2026-11-09T02:00:00Z',
        ends_at: '2026-11-09T03:00:00Z',
        status: 'booked',
      })
      .select('id')
      .single();
    if (error) throw error;
    bookingId = booking.id;
    const { data: block, error: blockError } = await svc
      .from('appointment_blocks')
      .insert({
        team_id: a.manager.id,
        starts_at: '2026-11-10T02:00:00Z',
        ends_at: '2026-11-10T09:00:00Z',
        reason: 'ประชุม',
        created_by: a.manager.id,
      })
      .select('id')
      .single();
    if (blockError) throw blockError;
    blockId = block.id;
  });

  afterAll(async () => {
    await svc.from('appointments').delete().eq('id', bookingId);
    await svc.from('appointment_blocks').delete().eq('id', blockId);
    await deleteTeam(a);
    await deleteTeam(b);
  });

  it('shows the learner their own booking and no block', async () => {
    const me = await clientFor(a.learner);
    const { data } = await me.from('appointments').select('id').eq('id', bookingId);
    expect(data).toHaveLength(1);
    const { data: blocks } = await me.from('appointment_blocks').select('id');
    expect(blocks).toEqual([]);
  });

  it('shows the manager their team and another team nothing', async () => {
    expect((await a.asManager.from('appointments').select('id').eq('id', bookingId)).data).toHaveLength(1);
    expect((await a.asManager.from('appointment_blocks').select('id').eq('id', blockId)).data).toHaveLength(1);
    expect((await b.asManager.from('appointments').select('id').eq('id', bookingId)).data).toEqual([]);
    expect((await b.asManager.from('appointment_blocks').select('id').eq('id', blockId)).data).toEqual([]);
  });

  it('refuses a learner and a manager who write directly', async () => {
    const me = await clientFor(a.learner);
    const { error } = await me.from('appointments').insert({
      user_id: a.learner.id,
      team_id: a.manager.id,
      dbd_record_id: a.recordId,
      starts_at: '2026-11-11T02:00:00Z',
      ends_at: '2026-11-11T03:00:00Z',
      status: 'booked',
    });
    expect(error?.code).toBe('42501');
    const { error: blockError } = await a.asManager.from('appointment_blocks').insert({
      team_id: a.manager.id,
      starts_at: '2026-11-11T02:00:00Z',
      ends_at: '2026-11-11T03:00:00Z',
      created_by: a.manager.id,
    });
    expect(blockError?.code).toBe('42501');
  });

  it('holds one booking per slot per team, and lets another team use the same time', async () => {
    const clash = await svc.from('appointments').insert({
      user_id: a.manager.id,
      team_id: a.manager.id,
      dbd_record_id: a.recordId,
      starts_at: '2026-11-09T02:00:00Z',
      ends_at: '2026-11-09T03:00:00Z',
      status: 'booked',
    });
    expect(clash.error?.code).toBe('23505');
    const other = await svc
      .from('appointments')
      .insert({
        user_id: b.learner.id,
        team_id: b.manager.id,
        dbd_record_id: b.recordId,
        starts_at: '2026-11-09T02:00:00Z',
        ends_at: '2026-11-09T03:00:00Z',
        status: 'booked',
      })
      .select('id')
      .single();
    expect(other.error).toBeNull();
    await svc.from('appointments').delete().eq('id', other.data!.id);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/appointments.rls.test.ts`
Expected: FAIL — `Could not find the table 'public.appointments'`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260928020000_appointments.sql`:

```sql
-- P16b: one calendar per team for the real bank visit (spec 2026-09-28 §5, §7; decision D66).

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid references public.profiles (id),      -- null = the admin's calendar
  dbd_record_id uuid not null references public.dbd_records (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null check (status in ('booked', 'cancelled')),
  note text,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  check (ends_at > starts_at)
);
-- Two learners clicking together: the index decides, the loser is told the slot was taken.
create unique index appointments_one_per_slot
  on public.appointments (coalesce(team_id, '00000000-0000-0000-0000-000000000000'), starts_at)
  where status = 'booked';
create index appointments_user_idx on public.appointments (user_id, starts_at desc);
create index appointments_team_idx on public.appointments (team_id, starts_at);
alter table public.appointments enable row level security;

create table public.appointment_blocks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.profiles (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index appointment_blocks_team_idx on public.appointment_blocks (team_id, starts_at);
alter table public.appointment_blocks enable row level security;

-- Reads: a learner their own bookings; a manager their team's bookings and blocks (the team is
-- the manager's own id); the admin everything. Writes: the service role after the server's
-- checks (readiness, window, slot, team) — no insert/update policy exists.
create policy "appointments: learners read their own" on public.appointments
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "appointments: admins and owning managers read" on public.appointments
  for select to authenticated
  using (public.is_admin() or (public.is_manager() and team_id = (select auth.uid())));

create policy "appointment blocks: admins and owning managers read" on public.appointment_blocks
  for select to authenticated
  using (public.is_admin() or (public.is_manager() and team_id = (select auth.uid())));
```

- [ ] **Step 4: Apply locally and regenerate the types**

Run: `pnpm exec supabase migration up --local && pnpm db:types && pnpm exec prettier --write lib/db/database.types.ts`
Expected: "Migrations applied"; `grep -c "appointment_blocks" lib/db/database.types.ts` ≥ 1.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/appointments.rls.test.ts && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: PASS 4/4; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260928020000_appointments.sql lib/db/database.types.ts tests/integration/appointments.rls.test.ts
git commit -m "feat(db): appointments and blocks, one booking per slot per team, team RLS"
```

---

### Task 4: Booking lifecycle and the progression fact

**Files:**
- Create: `lib/db/appointments.ts`
- Modify: `lib/db/progression.ts` (both loaders read `appointments`)
- Create: `tests/integration/appointments.test.ts`

**Interfaces:**
- Consumes: Task 2's engine, Task 3's tables, `loadProgressionFacts`/`stageStatuses` (P16a).
- Produces:

```ts
export type AppointmentRow = Database['public']['Tables']['appointments']['Row'];
export type AppointmentBlockRow = Database['public']['Tables']['appointment_blocks']['Row'];
export type AppointmentErrorCode = 'not_open' | 'already_booked' | 'slot_unavailable' | 'slot_taken' | 'not_found' | 'too_late' | 'forbidden';
export class AppointmentError extends Error { code: AppointmentErrorCode; gate?: StageInfo }
export const CALENDAR_DAYS = 7;
export const HORIZON_DAYS = 84;                                   // the picker's reach when expires_at is null
export async function appointmentConfig(): Promise<SlotConfig>;
export async function teamOf(userId: string): Promise<string | null>; // profiles.manager_id
export async function calendarFor(args: { teamId: string | null; from: ISODate; days: number; window: Window; now?: Date }): Promise<DaySlots[]>;
export async function learnerCalendar(userId: string, from: ISODate): Promise<{ gate: StageInfo; days: DaySlots[]; window: Window | null }>;
export type MyAppointment = AppointmentRow & { managerName: string | null };
export async function myUpcomingAppointment(userId: string, now?: Date): Promise<MyAppointment | null>;
export async function bookAppointment(userId: string, startsAt: string, now?: Date): Promise<AppointmentRow>;
export async function cancelAppointment(actor: { id: string; role: 'learner' | 'manager' | 'admin' }, appointmentId: string, now?: Date): Promise<void>;
export type StaffAppointmentRow = AppointmentRow & { profiles: { login_id: string; display_name: string | null }; dbd_records: { company_name_th: string | null } | null };
export async function listAppointmentsForStaff(db: Db, args: { teamId?: string | null; from: ISODate }): Promise<StaffAppointmentRow[]>;
export async function listBlocks(db: Db, args: { teamId: string | null; from: ISODate }): Promise<AppointmentBlockRow[]>;
export async function addBlock(actor: { id: string; role: 'manager' | 'admin' }, args: { teamId: string | null; date: ISODate; fromHour: number; toHour: number; reason: string | null }): Promise<AppointmentBlockRow>;
export async function removeBlock(actor: { id: string; role: 'manager' | 'admin' }, blockId: string): Promise<void>;
```

`loadProgressionFacts`: `appointmentBooked` = a row with `status = 'booked'` and `starts_at >= now`; the batch loader the same per user.

- [ ] **Step 1: Write the failing tests**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { adminClient, confirmRecord, createTestLearnerIn, deleteTestUser, deleteTeam, seedTeam, type Team, type TestUser } from './helpers';

const svc = adminClient();

/** A ready learner whose window opened long ago: issue date a year back. */
async function makeReady(userId: string, recordId: string, issuedOn: string) {
  await svc.from('dbd_records').update({ issued_on: issuedOn }).eq('id', recordId);
  await svc.from('user_dbd_assignments').insert({ user_id: userId, dbd_record_id: recordId });
  await svc.from('interview_sessions').insert({
    user_id: userId,
    dbd_record_id: recordId,
    status: 'completed',
    verdict: 'ready',
    plan: { items: [], cursor: 0 },
    provider: 'fake',
  });
}

describe('booking the bank appointment', () => {
  let team: Team;
  let second: TestUser;
  // A weekday two weeks out that is not a holiday; 09:00 Bangkok.
  const day = addCalendarDays(todayInBangkok(), 14);
  const slot = bangkokDateTime(day, 9);

  beforeAll(async () => {
    team = await seedTeam('จองนัด');
    await confirmRecord(team.recordId, team.manager.id);
    await makeReady(team.learner.id, team.recordId, '2025-09-01');
    second = await createTestLearnerIn(team.manager, { displayName: 'จองนัด สอง' });
    await svc.from('user_dbd_assignments').insert({ user_id: second.id, dbd_record_id: team.recordId });
    await svc.from('interview_sessions').insert({
      user_id: second.id,
      dbd_record_id: team.recordId,
      status: 'completed',
      verdict: 'ready',
      plan: { items: [], cursor: 0 },
      provider: 'fake',
    });
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
    await cancelAppointment({ id: team.manager.id, role: 'manager' }, (await myUpcomingAppointment(team.learner.id))!.id);
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
    const loser = won[0] && (results[0].status === 'fulfilled' ? second.id : team.learner.id);
    const { days } = await learnerCalendar(loser, day);
    expect(days[0].slots.find((s) => s.startsAt === slot)?.state).toBe('booked');
  });

  it('lets the learner cancel outside the notice window, which frees the slot', async () => {
    const holder = (await myUpcomingAppointment(team.learner.id)) ?? (await myUpcomingAppointment(second.id));
    await cancelAppointment({ id: holder!.user_id, role: 'learner' }, holder!.id);
    expect(await myUpcomingAppointment(holder!.user_id)).toBeNull();
    const { days } = await learnerCalendar(team.learner.id, day);
    expect(days[0].slots.find((s) => s.startsAt === slot)?.state).toBe('free');
  });

  it('refuses a learner cancelling inside the notice window, but not the manager', async () => {
    const soon = bangkokDateTime(addCalendarDays(todayInBangkok(), 2), 9);
    const booking = await bookAppointment(team.learner.id, soon);
    // A clock 23 hours before the slot.
    const late = new Date(new Date(soon).getTime() - 23 * 3_600_000);
    await expect(cancelAppointment({ id: team.learner.id, role: 'learner' }, booking.id, late)).rejects.toMatchObject({ code: 'too_late' });
    await cancelAppointment({ id: team.manager.id, role: 'manager' }, booking.id, late);
    expect(await myUpcomingAppointment(team.learner.id)).toBeNull();
  });

  it('refuses a slot the manager blocked, a holiday and a time outside the hours', async () => {
    const block = await addBlock({ id: team.manager.id, role: 'manager' }, { teamId: team.manager.id, date: day, fromHour: 9, toHour: 12, reason: 'ประชุม' });
    await expect(bookAppointment(team.learner.id, bangkokDateTime(day, 10))).rejects.toMatchObject({ code: 'slot_unavailable' });
    await removeBlock({ id: team.manager.id, role: 'manager' }, block.id);
    await expect(bookAppointment(team.learner.id, bangkokDateTime('2026-12-10', 9))).rejects.toMatchObject({ code: 'slot_unavailable' });
    await expect(bookAppointment(team.learner.id, bangkokDateTime(day, 7))).rejects.toMatchObject({ code: 'slot_unavailable' });
  });

  it('refuses a learner who is not ready', async () => {
    const other = await seedTeam('ยังไม่พร้อม');
    try {
      await confirmRecord(other.recordId, other.manager.id);
      await svc.from('dbd_records').update({ issued_on: '2025-09-01' }).eq('id', other.recordId);
      await svc.from('user_dbd_assignments').insert({ user_id: other.learner.id, dbd_record_id: other.recordId });
      await expect(bookAppointment(other.learner.id, slot)).rejects.toMatchObject({ code: 'not_open' });
    } finally {
      await deleteTeam(other);
    }
  });
});
```

(`issued_on` drives the eligibility snapshot through the `dbd_records_issue_date_changed` trigger, so set it before the assignment; `2026-12-10` is Constitution Day in the seeded list.)

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/appointments.test.ts`
Expected: FAIL — `Cannot find package '@/lib/db/appointments'`.

- [ ] **Step 3: Implement `lib/db/appointments.ts`**

```ts
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

function teamFilter<T extends { eq: (c: string, v: string) => T; is: (c: string, v: null) => T }>(
  query: T,
  teamId: string | null,
): T {
  return teamId === null ? query.is('team_id', null) : query.eq('team_id', teamId);
}

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
  const [bookings, blocks] = await Promise.all([
    teamFilter(
      admin.from('appointments').select('starts_at, ends_at').eq('status', 'booked'),
      args.teamId,
    )
      .lt('starts_at', rangeEnd)
      .gt('ends_at', rangeStart),
    teamFilter(admin.from('appointment_blocks').select('starts_at, ends_at'), args.teamId)
      .lt('starts_at', rangeEnd)
      .gt('ends_at', rangeStart),
  ]);
  if (bookings.error) throw bookings.error;
  if (blocks.error) throw blocks.error;
  const toInterval = (r: { starts_at: string; ends_at: string }): Interval => ({
    startsAt: new Date(r.starts_at).toISOString(),
    endsAt: new Date(r.ends_at).toISOString(),
  });
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

/** The gate and, when open, the learner's week from `from` (clamped to the window and the horizon). */
export async function learnerCalendar(
  userId: string,
  from: ISODate,
  now: Date = new Date(),
): Promise<{ gate: StageInfo; days: DaySlots[]; window: Window | null }> {
  const admin = createSupabaseAdminClient();
  const facts = await loadProgressionFacts(admin, userId);
  const gate = stageStatuses(facts).appointment;
  if (gate.status !== 'available' || !facts.eligibility) {
    return { gate, days: [], window: facts.eligibility };
  }
  const window: Window = {
    availableFrom: facts.eligibility.availableFrom,
    expiresAt: facts.eligibility.expiresAt ?? addCalendarDays(facts.today, HORIZON_DAYS),
  };
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
  if (gate.status !== 'available' || !facts.eligibility) {
    throw new AppointmentError('The appointment is not open', 'not_open', gate);
  }
  const at = new Date(startsAt);
  if (Number.isNaN(at.getTime())) throw new AppointmentError('Bad time', 'slot_unavailable');
  const iso = at.toISOString();
  const teamId = await teamOf(userId);
  const window: Window = {
    availableFrom: facts.eligibility.availableFrom,
    expiresAt: facts.eligibility.expiresAt ?? addCalendarDays(facts.today, HORIZON_DAYS),
  };
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
  let query = db
    .from('appointments')
    .select('*, profiles!appointments_user_id_fkey(login_id, display_name), dbd_records(company_name_th)')
    .eq('status', 'booked')
    .gte('starts_at', bangkokDateTime(args.from, 0))
    .order('starts_at')
    .limit(500);
  if (args.teamId !== undefined) query = teamFilter(query, args.teamId);
  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as StaffAppointmentRow[];
}

export async function listBlocks(
  db: Db,
  args: { teamId: string | null; from: ISODate },
): Promise<AppointmentBlockRow[]> {
  const { data, error } = await teamFilter(
    db.from('appointment_blocks').select('*'),
    args.teamId,
  )
    .gte('ends_at', bangkokDateTime(args.from, 0))
    .order('starts_at');
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
  args: { teamId: string | null; date: ISODate; fromHour: number; toHour: number; reason: string | null },
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
```

`lib/db/progression.ts` — in `loadProgressionFacts` add to the second `Promise.all`:

```ts
    db
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'booked')
      .gte('starts_at', new Date().toISOString()),
```

as `upcoming`, and `appointmentBooked: (upcoming.count ?? 0) > 0`. In the batch loader add `db.from('appointments').select('user_id').in('user_id', userIds).eq('status', 'booked').gte('starts_at', new Date().toISOString())` as `bookings`, include it in the error loop, build `const bookedUsers = new Set((bookings.data ?? []).map((b) => b.user_id))`, and set `appointmentBooked: bookedUsers.has(userId)`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/appointments.test.ts tests/integration/appointments.rls.test.ts && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: PASS 11/11; tsc clean. If the two-learner test finds both winning, the index is missing the `where status = 'booked'` clause or `team_id` differs between the learners — both share `team.manager.id`.

- [ ] **Step 5: Commit**

```bash
git add lib/db/appointments.ts lib/db/progression.ts tests/integration/appointments.test.ts
git commit -m "feat(appointments): booking, cancellation and blocks under the service role; the progression fact"
```

---

### Task 5: The learner's picker and the dashboard card

**Files:**
- Create: `app/[locale]/(learner)/appointment/page.tsx`, `app/[locale]/(learner)/appointment/actions.ts`, `app/[locale]/(learner)/appointment/week.tsx`
- Modify: `app/[locale]/(learner)/dashboard/stage-row.ts` (`appointment: '/appointment'`), `app/[locale]/(learner)/dashboard/page.tsx` (the booked line), `messages/*.json` (`appointment.*`, `dashboard.appointment.booked`)
- Create: `tests/e2e/appointment.spec.ts`
- Modify: `tests/e2e/seed.ts` (`seedManager`, `seedTeamLearner`, `seedReadyInterview`)

**Interfaces:**
- Consumes: Task 4.
- Produces: route `/appointment?from=YYYY-MM-DD`; test ids `appointment-blocked`, `booking-card`, `cancel-booking`, `week-prev`, `week-next`, `day-{date}` (with `data-holiday`), `slot-{iso}` buttons with `data-state`, `booking-error`; dashboard `stage-appointment` detail carries the booked line.

- [ ] **Step 1: Seeds**

Add to `tests/e2e/seed.ts`:

```ts
/** A manager account with the e2e password; their profile id is their team. */
export async function seedManager(displayName: string): Promise<{ id: string; loginId: string }> {
  const admin = svc();
  const domain = process.env.APP_INTERNAL_EMAIL_DOMAIN ?? 'learner.portal.internal';
  const loginId = `e2e-mgr-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const { data, error } = await admin.auth.admin.createUser({
    email: `${loginId}@${domain}`,
    password: E2E_PASSWORD,
    email_confirm: true,
    user_metadata: { login_id: loginId, display_name: displayName, preferred_language: 'th' },
    app_metadata: { role: 'manager' },
  });
  if (error) throw error;
  return { id: data.user.id, loginId };
}

/** A completed interview that ended ready, written the way the service role writes it. */
export async function seedReadyInterview(loginId: string): Promise<void> {
  const admin = svc();
  const { data: profile } = await admin.from('profiles').select('id').eq('login_id', loginId).single();
  const { data: assignment } = await admin
    .from('user_dbd_assignments')
    .select('dbd_record_id')
    .eq('user_id', profile!.id)
    .eq('active', true)
    .single();
  const { error } = await admin.from('interview_sessions').insert({
    user_id: profile!.id,
    dbd_record_id: assignment!.dbd_record_id,
    status: 'completed',
    verdict: 'ready',
    plan: { items: [], cursor: 0 },
    provider: 'fake',
  });
  if (error) throw error;
}

/**
 * A learner in a manager's team with a confirmed company of that team, the exam passed and the
 * interview ready: everything before the appointment. Returns the login id.
 */
export async function seedTeamLearner(
  managerId: string,
  companyNameTh: string,
  issuedOn: string,
): Promise<string> {
  const loginId = await seedLearnerWithCompany(companyNameTh, issuedOn, { team_id: managerId });
  const admin = svc();
  const { error } = await admin.from('profiles').update({ manager_id: managerId }).eq('login_id', loginId);
  if (error) throw error;
  await seedPassedExam(loginId);
  await seedReadyInterview(loginId);
  return loginId;
}
```

- [ ] **Step 2: Write the failing e2e spec**

```ts
import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './fixtures';
import { loginAs, switchTo } from './helpers';
import { seedManager, seedTeamLearner } from './seed';

/**
 * Spec §11: ready learner → appointment locked by date → past the date → a slot booked → the
 * manager sees it → a second learner cannot take the slot → the learner cancels → the slot is
 * free again. Bookings target a weekday two weeks out so notice hours and holidays stay clear.
 */
function twoWeeksOut(): string {
  const d = new Date(Date.now() + 14 * 86_400_000 + 7 * 3_600_000); // Bangkok date
  return d.toISOString().slice(0, 10);
}

test('the appointment waits for the date, then a slot is booked, seen by the manager, held against a teammate and freed on cancel', async ({
  page,
}) => {
  const manager = await seedManager('ผู้จัดการนัดหมาย');
  const waiting = await seedTeamLearner(manager.id, 'บริษัท รอวันนัด จำกัด', '2026-09-20');
  const booker = await seedTeamLearner(manager.id, 'บริษัท จองนัด จำกัด', '2026-01-05');
  const mate = await seedTeamLearner(manager.id, 'บริษัท เพื่อนร่วมทีม จำกัด', '2026-01-05');
  const from = twoWeeksOut();

  // Ready but before the 45th day: locked with the date, no picker.
  await loginAs(page, waiting, E2E_PASSWORD);
  await expect(page.getByTestId('stage-appointment')).toContainText('จองได้ตั้งแต่');
  await page.goto('/th/appointment');
  await expect(page.getByTestId('appointment-blocked')).toContainText('จองได้ตั้งแต่');

  // Past the date: the week shows free slots; the first one is booked.
  await switchTo(page, booker, E2E_PASSWORD);
  await page.goto(`/th/appointment?from=${from}`);
  const free = page.locator('[data-testid^="slot-"][data-state="free"]').first();
  const slotId = await free.getAttribute('data-testid');
  await free.click();
  await expect(page.getByTestId('booking-card')).toBeVisible();
  await page.goto('/th/dashboard');
  await expect(page.getByTestId('stage-appointment-status')).toHaveText('เสร็จสิ้น');
  await expect(page.getByTestId('stage-appointment')).toContainText('ผู้จัดการนัดหมาย');

  // The manager sees it under their team, with the company.
  await switchTo(page, manager.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/appointments');
  await expect(page.locator('[data-testid^="admin-appointment-"]').first()).toContainText(
    'บริษัท จองนัด จำกัด',
  );

  // A teammate sees the same slot taken and cannot click it.
  await switchTo(page, mate, E2E_PASSWORD);
  await page.goto(`/th/appointment?from=${from}`);
  const taken = page.getByTestId(slotId!);
  await expect(taken).toHaveAttribute('data-state', 'booked');
  await expect(taken).toBeDisabled();

  // The booker cancels; the slot is free for the teammate.
  await switchTo(page, booker, E2E_PASSWORD);
  await page.goto('/th/appointment');
  await page.getByTestId('cancel-booking').click();
  await expect(page.getByTestId('booking-card')).toHaveCount(0);
  await switchTo(page, mate, E2E_PASSWORD);
  await page.goto(`/th/appointment?from=${from}`);
  await expect(page.getByTestId(slotId!)).toHaveAttribute('data-state', 'free');
});

test('the picker fits a phone and walks week by week', async ({ page }) => {
  const manager = await seedManager('ผู้จัดการมือถือ');
  const learner = await seedTeamLearner(manager.id, 'บริษัท นัดมือถือ จำกัด', '2026-01-05');
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, learner, E2E_PASSWORD);
  await page.goto('/th/appointment');
  await expect(page.locator('[data-testid^="day-"]')).toHaveCount(7);
  await page.getByTestId('week-next').click();
  await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}/);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm exec playwright test tests/e2e/appointment.spec.ts`
Expected: FAIL — `/th/appointment` is a 404 (`appointment-blocked` not found).

- [ ] **Step 4: Strings**

Namespace `appointment` in the three catalogs:

| key | th | en | zh |
| --- | --- | --- | --- |
| title | นัดหมายธนาคาร | Bank appointment | 银行预约 |
| intro | เลือกวันและเวลาที่จะไปธนาคารกับผู้จัดการของคุณ เปิดทุกวันยกเว้นวันหยุดธนาคาร ช่วงละหนึ่งคน | Pick the day and time you will go to the bank with your manager. Open every day except bank holidays, one person per slot. | 选择你与经理前往银行的日期和时间。除银行假日外每天开放，每个时段一人。 |
| week | สัปดาห์ของ {date} | Week of {date} | {date} 当周 |
| prevWeek | สัปดาห์ก่อน | Previous week | 上一周 |
| nextWeek | สัปดาห์ถัดไป | Next week | 下一周 |
| holiday | วันหยุดธนาคาร | Bank holiday | 银行假日 |
| noSlots | ไม่มีช่วงว่าง | No free slot | 无空闲时段 |
| state.free | ว่าง | Free | 空闲 |
| state.booked | มีคนจองแล้ว | Taken | 已被预约 |
| state.blocked | ไม่เปิดจอง | Unavailable | 不可预约 |
| state.past | เลยเวลาจอง | Too soon | 已过预约时限 |
| state.outside_window | นอกช่วงที่จองได้ | Outside your window | 不在可预约期内 |
| booked.title | นัดหมายของคุณ | Your appointment | 你的预约 |
| booked.line | {date} เวลา {time} น. กับ {manager} | {date} at {time} with {manager} | {date} {time} 与 {manager} |
| booked.adminCalendar | ผู้ดูแลระบบ | the administrator | 管理员 |
| booked.cancel | ยกเลิกนัดหมาย | Cancel the appointment | 取消预约 |
| booked.cancelHint | ยกเลิกได้จนถึง {hours} ชั่วโมงก่อนเวลานัด | You can cancel until {hours} hours before | 最迟可在时段前 {hours} 小时取消 |
| errors.not_open | ยังจองไม่ได้ | Booking is not open yet. | 尚不能预约。 |
| errors.already_booked | คุณมีนัดหมายอยู่แล้ว ยกเลิกก่อนจึงจะจองใหม่ได้ | You already have an appointment. Cancel it to pick another. | 你已有预约，取消后才能重新预约。 |
| errors.slot_unavailable | ช่วงเวลานี้จองไม่ได้ | That slot cannot be booked. | 该时段无法预约。 |
| errors.slot_taken | มีคนจองช่วงนี้ไปเมื่อสักครู่ กรุณาเลือกช่วงอื่น | Someone just took that slot. Please pick another. | 该时段刚被他人预约，请选择其他时段。 |
| errors.not_found | ไม่พบนัดหมาย | Appointment not found. | 找不到预约。 |
| errors.too_late | ใกล้เวลานัดเกินกว่าจะยกเลิกได้ กรุณาติดต่อผู้จัดการ | Too close to the appointment to cancel. Ask your manager. | 距预约时间太近，无法取消，请联系经理。 |
| errors.forbidden | ไม่สามารถทำรายการนี้ได้ | You cannot do that. | 无法执行此操作。 |
| errors.unknown | เกิดข้อผิดพลาด กรุณาลองใหม่ | Something went wrong. Please try again. | 出错了，请重试。 |

And `dashboard.appointment.booked`: th "นัดหมายแล้ว: {date} เวลา {time} น. กับ {manager}", en "Booked: {date} at {time} with {manager}", zh "已预约：{date} {time} 与 {manager}".

- [ ] **Step 5: Actions and screens**

`actions.ts` (`'use server'`): `bookAction(prev: { error: string | null }, formData)` reads `startsAt` and `locale`, `requireUser`, `bookAppointment(user.id, startsAt)`, on error returns `{ error: code }` (`AppointmentError` code or `unknown`), on success `revalidatePath` dashboard + `/appointment` and `redirect` to `/${locale}/appointment`; `cancelAction(prev, formData)` reads `appointmentId`, calls `cancelAppointment({ id: user.id, role: 'learner' }, appointmentId)`, same error/redirect shape.

`page.tsx`: `requireUser`; `from` = the `from` search param when it is an ISO date on or after today, else `todayInBangkok()`; `const mine = await myUpcomingAppointment(user.id)`; if `mine` → the **booked card** (`data-testid="booking-card"`, glass-strong, medallion-free): `t('booked.title')`, `t('booked.line', { date: formatDate(bangkokDateOf(mine.starts_at), locale), time: HH:mm Bangkok, manager: mine.managerName ?? t('booked.adminCalendar') })`, `t('booked.cancelHint', { hours })`, a form with `<button data-testid="cancel-booking">` calling `cancelAction`, and the error under it; else `const { gate, days } = await learnerCalendar(user.id, from)`; gate not `available` → `<p data-testid="appointment-blocked">` with the dashboard's `detailFor` wording: `before_available_from` → `td('appointment.lockedUntil', { date })`, `missing_issue_date` → `td('appointment.pending')`, otherwise `ts(\`reasons.${gate.reason}\`)`; else `<Week days from window />`.

`week.tsx` (server component): the header `t('week', { date: formatDate(from, locale) })` with `week-prev`/`week-next` links (`?from=` ± 7 days; prev hidden when `from` ≤ today); one form (`action={bookAction}` via a small client wrapper `BookForm` using `useActionState` so the error renders at `booking-error`); a 7-column grid on desktop, one day per row on a phone: each day `<section data-testid={\`day-${date}\`} data-holiday={holiday || undefined}>` with the weekday and date (`Intl.DateTimeFormat` weekday + `formatDate`), `t('holiday')` on a holiday, `t('noSlots')` when nothing is free, and per slot `<button type="submit" name="startsAt" value={slot.startsAt} data-testid={\`slot-${slot.startsAt}\`} data-state={slot.state} disabled={slot.state !== 'free'} aria-label={time + ' ' + t(\`state.${slot.state}\`)} className="min-h-11 …">` showing the Bangkok time `HH:mm`; free = brand-600 outline, taken/blocked = ink-100 struck, past/outside = ink-50 faint.

Time: `new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' }).format(new Date(iso))`.

`stage-row.ts`: `appointment: '/appointment'`. `dashboard/page.tsx` `detailFor`: when `key === 'appointment' && info.status === 'done'`, read `mine` (fetched alongside the facts with `myUpcomingAppointment(user.id)`) and return `t('appointment.booked', { date, time, manager })`.

- [ ] **Step 6: Run the spec to verify it passes**

Run: `pnpm exec playwright test tests/e2e/appointment.spec.ts tests/e2e/learner-dashboard.spec.ts tests/e2e/dashboard-design.spec.ts && pnpm exec vitest run tests/unit/messages.test.ts && pnpm exec tsc --noEmit -p tsconfig.json && pnpm lint`
Expected: PASS. The manager part of the first test still fails until Task 6 (404 on `/admin/appointments`) — run the first test again after Task 6.

- [ ] **Step 7: Commit**

```bash
git add "app/[locale]/(learner)/appointment" "app/[locale]/(learner)/dashboard" messages tests/e2e/appointment.spec.ts tests/e2e/seed.ts
git commit -m "feat(appointments): the learner's week picker, the booked card and the dashboard line"
```

---

### Task 6: The staff day list with blocks

**Files:**
- Create: `app/[locale]/(admin)/admin/appointments/page.tsx`, `app/[locale]/(admin)/admin/appointments/actions.ts`, `app/[locale]/(admin)/admin/appointments/block-form.tsx`
- Modify: `app/[locale]/(admin)/admin/page.tsx` (STAFF_LINKS: `['/admin/appointments', 'appointments']` after interviews), `app/[locale]/(admin)/admin/users/page.tsx` (a booking column), `messages/*.json` (`admin.nav.appointments`, `admin.appointments.*`, `admin.users.appointment`)
- Modify: `tests/e2e/manager-access.spec.ts` (the door opens), `tests/e2e/appointment.spec.ts` (block + cancel by the manager)

**Interfaces:**
- Produces: route `/admin/appointments?team=<id|admin>&from=YYYY-MM-DD`; test ids `admin-appointment-{id}` rows with `cancel-{id}`, `block-form`, `block-{id}` with `unblock-{id}`, `team-filter` (admin only); Users list column `appointment-{login_id}`.

- [ ] **Step 1: Failing assertions**

`tests/e2e/manager-access.spec.ts`, after the interviews assertion:

```ts
  await page.goto('/th/admin/appointments');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('นัดหมายธนาคาร');
```

`tests/e2e/appointment.spec.ts`, in the first test after the manager sees the booking:

```ts
  // The manager blocks the following hour and cancels the booking; both show on the list.
  await page.getByTestId('block-form').locator('input[name="date"]').fill(from);
  await page.getByTestId('block-form').locator('input[name="fromHour"]').fill('13');
  await page.getByTestId('block-form').locator('input[name="toHour"]').fill('16');
  await page.getByTestId('block-form').locator('input[name="reason"]').fill('ประชุมทีม');
  await page.getByTestId('block-form').getByRole('button', { name: 'ปิดช่วงเวลา' }).click();
  await expect(page.locator('[data-testid^="block-"]').filter({ hasText: 'ประชุมทีม' })).toHaveCount(1);
```

and, for the teammate step, add after the taken-slot assertions: `await expect(page.locator(\`[data-testid="slot-${bangkokDateTime(from, 13)}"]\`)).toHaveAttribute('data-state', 'blocked');` (the e2e specs do not import from `@/`, so define in the spec `const slotIso = (date: string, hour: number) => new Date(date + 'T' + String(hour).padStart(2, '0') + ':00:00+07:00').toISOString();` and use `slotIso(from, 13)`).

- [ ] **Step 2: Run them to verify they fail** — `pnpm exec playwright test tests/e2e/manager-access.spec.ts tests/e2e/appointment.spec.ts` → FAIL (404).

- [ ] **Step 3: Implement**

Strings `admin.nav.appointments` (th นัดหมายธนาคาร / en Bank appointments / zh 银行预约) and `admin.appointments.{title, intro, empty, day, time, learner, company, cancel, cancelled, blocks, block, unblock, date, fromHour, toHour, reason, teamFilter, adminCalendar, allTeams}` (th: นัดหมายธนาคาร / นัดหมายที่กำลังจะถึงของผู้เรียนในทีม เรียงตามวัน ปิดช่วงเวลาที่คุณไม่ว่าง / ยังไม่มีนัดหมาย / วัน / เวลา / ผู้เรียน / บริษัท / ยกเลิก / ยกเลิกแล้ว / ช่วงเวลาที่ปิด / ปิดช่วงเวลา / เปิดช่วงเวลา / วันที่ / ตั้งแต่ (ชั่วโมง) / ถึง (ชั่วโมง) / เหตุผล / ทีม / ปฏิทินผู้ดูแลระบบ / ทุกทีม; en and zh accordingly), `admin.users.appointment` (th นัดหมาย / en Appointment / zh 预约).

`actions.ts` (`'use server'`): `blockAction(prev, formData)` → `requireStaff`, `addBlock({ id, role }, { teamId: role === 'manager' ? id : (formData.team === 'admin' ? null : formData.team), date, fromHour, toHour, reason })`; `unblockAction(formData)` → `removeBlock`; `cancelBookingAction(formData)` → `cancelAppointment({ id, role }, appointmentId)`; each revalidates `/admin/appointments` and returns `{ error }`.

`page.tsx`: `requireStaff`; `teamId` = for a manager their own id, for the admin the `team` param (`'admin'` → null, an id → that id, absent → `undefined` = all teams); `from` = today; `listAppointmentsForStaff(db, { teamId, from })` grouped by Bangkok date; a `<select name="team" data-testid="team-filter">` for the admin (managers from `profiles` where role manager, plus "admin calendar" and "all teams") submitting via GET; the day list: `<section>` per date with rows `data-testid={\`admin-appointment-${id}\`}` showing time, learner (`displayLoginId` + name), company, and a cancel form button `data-testid={\`cancel-${id}\`}`; then `listBlocks(db, { teamId: teamId ?? null, from })` as `block-{id}` rows (date, hours, reason, `unblock-{id}`); the `BlockForm` client component (`useActionState` over `blockAction`, `data-testid="block-form"`, inputs `date` (type date), `fromHour`, `toHour` (number 0–24), `reason`, and for the admin a hidden `team` from the filter).

`users/page.tsx`: one query `appointments` (`user_id, starts_at`) for `learnerIds`, `status = 'booked'`, `starts_at >= now`, ordered; a column `t('appointment')` with `formatDate` + time or "—", `data-testid={\`appointment-${u.login_id}\`}`.

- [ ] **Step 4: Verify** — `pnpm exec playwright test tests/e2e/manager-access.spec.ts tests/e2e/appointment.spec.ts tests/e2e/admin-users.spec.ts` PASS; `pnpm exec vitest run tests/unit/messages.test.ts`, tsc, lint clean.

- [ ] **Step 5: Commit** — `git add "app/[locale]/(admin)/admin/appointments" "app/[locale]/(admin)/admin/page.tsx" "app/[locale]/(admin)/admin/users/page.tsx" messages tests/e2e && git commit -m "feat(appointments): the staff day list, blocks and the Users column"`.

---

### Task 7: Docs, the full gate, merge and deploy

**Files:**
- Modify: `docs/decisions-log.md` (D66), `docs/security-checklist.md` (row 22), `docs/uat-script.md` (rows B8/B9 follow-ups: booking, the manager's list, the teammate, cancel), `docs/runbooks/operations.md` (a row: bookings by day; December holiday upkeep), `docs/superpowers/specs/2026-09-28-bank-readiness-interview-and-appointments-design.md` (status: P16b implemented), `README.md` (D1–D66)

- [ ] **Step 1: Decision row** (after D65):

| 2026-09-28 | D66 | **Appointments** are one calendar per team (the manager's profile id; learners without a manager book with the admin), open every day except the Bank of Thailand holidays kept in `appointment_holidays` (seeded with the 2026 list, verified by the owner, extended each December by the admin), in Bangkok hours `appointment_hours_start`–`appointment_hours_end` cut into `appointment_slot_minutes`, bookable and cancellable by the learner until `appointment_notice_hours` before; one learner per slot is the partial unique index's decision and the loser is told so; one upcoming booking per learner; the manager blocks hours and cancels any time; a holiday added later leaves existing bookings to the manager. Writes go through the service role after the server's checks; reads through RLS. The picker shows slot states only, never who holds a slot | Owner | `lib/domain/appointments/slots.ts`, `lib/db/appointments.ts`, migration `20260928020000_appointments.sql` |

Security checklist row 22: "A learner books only for themselves, only a free slot inside their own window, only once at a time; who holds another slot is never shown; managers manage only their own team's blocks and bookings; the unique index is the arbiter under concurrency | ✅ | `tests/integration/appointments.test.ts`, `tests/integration/appointments.rls.test.ts`, `tests/e2e/appointment.spec.ts`".

- [ ] **Step 2: The full gate**

Run: `pnpm db:reset > /dev/null; echo $?` (0), then `pnpm exec vitest run && pnpm test:integration && pnpm test:e2e && pnpm lint && pnpm format:check && pnpm build && pnpm check:secrets`.
Expected: all green.

- [ ] **Step 3: Commit, merge, deploy**

`git add docs README.md && git commit -m "docs: D66, the appointment in the checklist, the UAT script and the runbook"`; then `finishing-a-development-branch`: fast-forward `main`, push, apply `20260928020000_appointments.sql` to staging through the Supabase MCP, `get_advisors`, confirm `/api/health` shows the new SHA; tell the owner to verify the holiday list in Settings.

---

## Self-review

- **Spec coverage.** §5.1 calendar per team, holidays, hours, slots, notice, blocks, free-slot rule → Tasks 1, 2, 4; §5.2 booking rules, unique index, cancellation, server validation → Tasks 3, 4; §5.3 learner step and page, manager page with blocks and cancel, admin team filter, Users list booking → Tasks 5, 6; notifications deferred (spec §5.3); §3 appointment status and `APPOINTMENT_BOOKED` → Task 4's fact (the domain already derives it); §7 tables → Task 3; §9 appointment screens → Tasks 5, 6; §11 tests → each task.
- **Interfaces.** `SlotConfig`/`Window`/`DaySlots` (Task 2) are consumed unchanged by Tasks 4–5; `AppointmentError` codes map one-to-one onto `appointment.errors.*`; `bangkokDateTime` is shared by the engine, the db layer and the e2e.
- **Placeholders.** Task 5 Step 5 and Task 6 Step 3 describe markup by element, test id and string rather than full JSX; every id and string they name exists in the tables above.
- **Review Focus.** 1 → Task 4 "exactly one of two learners"; 2 → Task 2's holiday state leaves rows alone (no cancellation code exists on holiday edits); 3 → Task 2 notice test + Task 4 "refuses a learner cancelling inside the notice window"; 4 → Task 2 window test; 5 → Task 3 RLS + `teamOf` null → admin calendar (Task 4) + Task 6's admin filter.
