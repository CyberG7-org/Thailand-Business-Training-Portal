# Manager-booked appointments (P18c) — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move bank-appointment booking from learners to their owning manager, with one replaceable date selected from a month calendar after the learner passes the Business Knowledge Quiz and Bank Readiness Interview.

**Architecture:** Keep the existing `appointments` table as the audit record, but treat `starts_at` as a date marker at Bangkok noon and remove the team/time-slot uniqueness rule. A manager-only service rechecks ownership and readiness, then inserts or updates the learner's single booked row. The staff appointments route renders the month picker; the learner route only reports the booked date or says the manager will book it.

**Tech Stack:** Next.js 16 App Router and Server Actions, React 19, TypeScript, Supabase/PostgreSQL, next-intl, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-company-pack-design.md` §15 P18c.

## Global Constraints

- Only the learner's owning manager may create or replace the appointment; learners cannot mutate it.
- Booking requires both a passed Business Knowledge Quiz and a readiness-interview verdict of `ready`.
- Dates before today in Bangkok are rejected; today and future dates are available without holiday, notice-period, time-slot, or 45-day-window rules.
- One booked appointment per learner; selecting another date replaces it.
- Learner and manager displays show a date only, never a time.
- Preserve Thai, English, and Chinese UI copy and the project's existing design tokens and focus states.

## Review Focus

- A manager must not book a learner owned by another manager.
- An Owner/admin or learner must not reach a booking mutation by crafting form data.
- A learner who passed only one of the two readiness gates must remain unbookable.
- Concurrent first bookings must not leave two booked rows for one learner.
- Existing time-slot-era rows must continue to display and be replaceable by date.

---

### Task 1: Date-only appointment model and database invariant

**Files:**
- Create: `lib/domain/appointments/month.ts`
- Create: `tests/unit/domain/appointments/month.test.ts`
- Create: `supabase/migrations/20261007020000_manager_booked_appointments.sql`
- Modify: `lib/db/appointments.ts`
- Modify: `tests/integration/appointments.test.ts`

**Interfaces:**
- Produces: `appointmentDateTime(date: ISODate): { startsAt: string; endsAt: string }`.
- Produces: `monthGrid(month: string): (ISODate | null)[]` and `shiftMonth(month: string, delta: number): string`.
- Produces: `bookAppointmentForManager(managerId: string, learnerId: string, date: ISODate, now?: Date): Promise<AppointmentRow>`.

- [x] Write unit tests proving a six-week Sunday-first month grid, month navigation across year boundaries, and Bangkok-noon storage.
- [x] Run `pnpm test:unit -- tests/unit/domain/appointments/month.test.ts` and verify RED because the module does not exist.
- [x] Implement the pure date helpers with ISO-date validation and no locale-dependent parsing.
- [x] Run the focused unit test and verify GREEN.
- [x] Add integration tests for owner-manager authorization, both readiness gates, past-date rejection, replacement, and one booked row per learner; run them and verify RED against the learner-booked service.
- [x] Add the migration: drop `appointments_one_per_slot`; cancel duplicate legacy booked rows per learner if any; create partial unique index `appointments_one_booked_per_learner` on `user_id where status = 'booked'`.
- [x] Implement the manager-only service. Check the learner profile's `manager_id`, check `examPassed` and `interviewReady`, and update the existing booked row or insert one using the active assignment.
- [x] Run the focused integration test and verify GREEN.
- [x] Commit with `feat(appointments): managers book one date per ready learner (D102)`.

### Task 2: Manager month calendar and learner read-only page

**Files:**
- Create: `app/[locale]/(admin)/admin/appointments/month-calendar.tsx`
- Modify: `app/[locale]/(admin)/admin/appointments/actions.ts`
- Modify: `app/[locale]/(admin)/admin/appointments/page.tsx`
- Modify: `app/[locale]/(admin)/admin/learners/page.tsx`
- Modify: `app/[locale]/(learner)/appointment/page.tsx`
- Delete: `app/[locale]/(learner)/appointment/actions.ts`
- Delete: `app/[locale]/(learner)/appointment/action-form.tsx`
- Delete: `app/[locale]/(learner)/appointment/week.tsx`
- Modify: `messages/en.json`
- Modify: `messages/th.json`
- Modify: `messages/zh.json`
- Modify: `tests/e2e/appointment.spec.ts`
- Modify: `tests/e2e/learner-record.spec.ts`

**Interfaces:**
- Consumes: `monthGrid`, `shiftMonth`, and `bookAppointmentForManager` from Task 1.
- Produces: `bookForLearnerAction` returning the existing `StaffActionState` shape.

- [x] Rewrite the appointment E2E assertions first: learner sees read-only manager-booking copy; an unready learner has no manager booking control; a ready learner can be selected by their manager; a month date button books and a second date replaces it; another manager cannot book them.
- [x] Run the focused Playwright test and verify RED on the old learner time-slot flow.
- [x] Add the authenticated manager Server Action. Reject non-manager staff before calling the service; revalidate manager appointments, learner record, learner dashboard, and learner appointment routes.
- [x] Build the server-rendered month grid with previous/next links, weekday headings, 44px date buttons, `aria-current` for today, and a selected-date state. Use existing `staff-*` classes and design tokens because the 21st catalog request was unavailable.
- [x] Replace the staff slot/blocking screen with upcoming date-only appointments plus learner selection and the month calendar. Link eligible learner rows from Learner Record to the selected calendar; show the missing quiz/interview reason for ineligible rows.
- [x] Make the learner appointment page read-only and delete its mutation components/actions.
- [x] Update all three locale files, removing time-slot, holiday, notice-period, and cancellation copy from visible appointment flows.
- [x] Run the focused Playwright test and verify GREEN.
- [x] Commit with `feat(appointments): add the manager month calendar (D102)`.

### Task 3: Sample-pack regression, documentation, and branch verification

**Files:**
- Modify: `tests/unit/pack/unzip.test.ts`
- Modify: `.21st/design.json`
- Modify: `docs/decisions-log.md`
- Modify: `docs/runbooks/operations.md`
- Modify: `docs/uat-script.md`

**Interfaces:**
- Consumes: the existing `openPack(File)` ZIP importer and the completed appointment UI.
- Produces: durable D102 documentation and a regression for a pack with Facebook but no website.

- [x] Add a ZIP test matching `chaya sri trade.zip`: 1 pack PDF, 5 invoices, 5 agreements, a Facebook `.doc`, and no website file; assert `website: null` and no validation problem.
- [x] Run the focused ZIP test. It was already GREEN, confirming that D101 handles the website-optional pack without production changes.
- [x] Record the manager-calendar design decision in `.21st/design.json` and D102 in the decision log; update operations and UAT steps.
- [x] Run typecheck, lint, all unit tests, focused appointment integration tests, and focused Playwright appointment/company-pack tests. The full integration run reached 53 passing files but its persistent local MCQ starter data made two unrelated suites fail; see the handoff notes.
- [x] Commit the durable documentation and regressions.
