# Submanager Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Managers multiple upload-and-create-only Submanagers, with same-team read-only learner summaries and creator-restricted assignment.

**Architecture:** Keep the existing Manager as the team anchor. Give each Submanager a profile with its parent `manager_id`; use server-verified, purpose-specific operations for upload and learner creation, and return only list/summary DTOs for reads. Do not widen the existing Manager/staff RLS policies or rely on hidden links as authorization.

**Tech Stack:** Next.js 16 server actions, React 19, TypeScript, Supabase Auth/Postgres/Storage RLS, Vitest, Playwright, next-intl.

**Spec:** `docs/superpowers/specs/2026-10-19-submanager-role-design.md`

## Global Constraints

- The new role is `submanager`; one parent Manager per account and multiple Submanagers per Manager.
- Login ID = Manager's full ID + `s` + exactly two ASCII alphanumeric characters; no sequence or character-mix rule, case-insensitive uniqueness.
- Submanagers can upload image, PDF poster, and ZIP; create a learner and assign only their own confirmed, unassigned DBD.
- All team DBDs are listed; clicking another creator's **Assign learner** displays “This DBD has not been created by you.” Server access must enforce the same rule.
- The Submanager Learner Record shows every learner in the Manager's team, with static row-level statuses and no links/actions or detailed quiz/interview data.
- Suspending/removing a Submanager stops access; deleting in the UI archives the account and retains all DBDs, learners, results, creator references, and login-ID reservation.
- The Manager owns corrections and the Submanager's screen has only Create Learner & DBD and Learner Record, aside from profile/logout controls.
- Preserve all existing Owner, Manager and Learner behavior. Test locally, then stage before production; this plan does not authorize deployment.

## Review Focus

- Concurrent Submanager creations choosing the same suffix: one succeeds; the other gets the existing taken-ID message (Task 2).
- A suspended parent Manager with an active Submanager: neither the list nor a direct server action returns team data (Tasks 1, 4).
- An upload fails before a DBD row exists: the source and error remain reviewable by the Manager; no orphaned storage object (Task 3).
- A forged assignment form names a DBD owned by another Submanager or another team: reject before creating any learner account (Task 4).
- A direct URL/API request asks for quiz answers, interview turns, DBD editor, or appointment actions: deny, even if a table link is absent (Task 5).

---

### Task 1: Add role, parent-team invariant, and narrowly scoped guards

**Files:** Modify `supabase/migrations/` with a new dated migration, `lib/auth/session.ts`, `lib/db/middleware.ts`, `lib/db/database.types.ts`; test `tests/integration/team-helpers.test.ts`, `tests/integration/team-gates.test.ts`, `tests/unit/auth/internal-email.test.ts`.

**Interfaces:** Produce `CurrentUser.managerId: string | null`, `requireSubmanager(locale): Promise<CurrentUser>`, `requireManager(locale): Promise<CurrentUser>`, and `managerTeamId(user): string | null` in `lib/auth/session.ts` (or a focused adjacent file). Preserve `requireStaff` for Owner/Manager only. Database helpers add `public.is_submanager()` and make `public.my_team()` return the parent ID for Submanagers, without making `public.is_staff()` true for them.

- [ ] **Step 1: Write failing tests** — assert role sync accepts `submanager`, parent profile must be an actual Manager, `my_team()` resolves parent, suspended parent denies Submanager access, middleware routes Submanager to `/admin` but denies all other `/admin/*` except `/admin/users`, `/admin/learners`, and own `/admin/profile`.
- [ ] **Step 2: Run targeted tests and observe failures:** `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/team-helpers.test.ts tests/integration/team-gates.test.ts` and `pnpm exec vitest run --config vitest.config.ts tests/unit/auth/internal-email.test.ts`.
- [ ] **Step 3: Implement migration and guards** — extend `profiles_role_check`, auth metadata sync, team-membership trigger, and helper functions. Keep Submanager direct RLS limited to their own profile; do not grant whole-row learner, DBD, attempt, or interview reads. Add explicit page-level guard to the three allowed Submanager routes and deny detail routes. Regenerate database types.
- [ ] **Step 4: Run those tests plus `pnpm typecheck`; expected PASS.**
- [ ] **Step 5: Commit role/team guard changes.**

### Task 2: Manager-owned account lifecycle and management page

**Files:** Modify `lib/db/provisioning.ts`, `lib/domain/login-id.ts`, `components/staff/staff-nav.tsx`, `components/staff/staff-shell.tsx`, `messages/*.json`; create `app/[locale]/(admin)/admin/submanagers/page.tsx`, `app/[locale]/(admin)/admin/submanagers/actions.ts`; test `tests/integration/provisioning.test.ts`, `tests/e2e/manager-manages.spec.ts`.

**Interfaces:** Produce `createSubmanagerAccount({ managerId, suffix, password, displayName? })`, `setSubmanagerStatus(managerActorId, submanagerId, status)`, `resetSubmanagerPassword(managerActorId, submanagerId, password)`, and `archiveSubmanager(managerActorId, submanagerId)`. Each verifies parent ownership server-side before using the admin client. The existing self-service profile password flow accepts the new role.

- [ ] **Step 1: Write failing tests** — accept `tf38sA7` and `tf38s9z`, reject non-alphanumeric/wrong length and duplicate IDs; refuse cross-Manager management; suspended account denied login; archive hides account while retaining profile/creator ID and reserved login; concurrent duplicate suffix loses cleanly.
- [ ] **Step 2: Run targeted tests:** `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/provisioning.test.ts` and `pnpm exec playwright test tests/e2e/manager-manages.spec.ts`; expected new cases FAIL.
- [ ] **Step 3: Implement account APIs and dedicated Manager-only page** using existing account/password UI patterns. Add an archived marker (e.g. `archived_at`) rather than deleting the auth/profile row; disable archived sign-in and keep its code. Add Manager's Submanagers nav item; Submanager nav renders only the two agreed items.
- [ ] **Step 4: Run targeted tests, `pnpm typecheck`, `pnpm lint`; expected PASS.**
- [ ] **Step 5: Commit account lifecycle and UI.**

### Task 3: Constrain the three DBD upload paths and preserve error handoff

**Files:** Modify `app/[locale]/(admin)/admin/dbd-records/new/image-actions.ts`, `app/[locale]/(admin)/admin/dbd-records/actions.ts`, `lib/db/dbd-records.ts`, `app/[locale]/(admin)/admin/users/companies-panel.tsx`, `app/[locale]/(admin)/admin/users/page.tsx`; create a focused server helper such as `lib/db/submanager-upload.ts`; test `tests/integration/dbd-index.upload.test.ts`, `tests/integration/team-boundaries.test.ts`, `tests/e2e/create-learner-and-dbd.spec.ts`.

**Interfaces:** Produce `submanagerUploadContext(actorId): Promise<{ actorId; teamId }>` and `listTeamCompaniesForSubmanager(actorId): Promise<CompanyRow[]>`, where each row includes `createdByMe` and only display fields. The helper verifies active actor and active parent Manager. Existing Manager/Owner upload calls retain their current path.

- [ ] **Step 1: Write failing tests** — image, PDF, ZIP each save `team_id = manager.id` and `created_by = submanager.id`; forged existing-record/document operations are refused; technical extraction failure leaves a Manager-visible error handoff and no orphan; Submanager cannot access record editor or delete/reindex actions.
- [ ] **Step 2: Run targeted integration/E2E tests; expected new cases FAIL.**
- [ ] **Step 3: Implement a purpose-specific server upload capability.** Keep signed browser ZIP upload, but verify actor/team on both prepare and register steps and constrain record ID/path. Permit required internal post-upload updates without granting general Submanager UPDATE/DELETE RLS. Retain failed input and error state for Manager review. Show all team companies with non-clickable names for Submanagers.
- [ ] **Step 4: Run targeted tests, `pnpm typecheck`; expected PASS.**
- [ ] **Step 5: Commit upload flow.**

### Task 4: Create learner only from the Submanager's own confirmed DBD

**Files:** Modify `app/[locale]/(admin)/admin/users/actions.ts`, `app/[locale]/(admin)/admin/users/new-user-form.tsx`, `app/[locale]/(admin)/admin/users/create-learner-tabs.tsx`, `app/[locale]/(admin)/admin/users/companies-panel.tsx`; create `lib/db/submanager-learner.ts`; test `tests/integration/learner-contact.test.ts`, `tests/integration/team-isolation.test.ts`, `tests/e2e/create-learner-and-dbd.spec.ts`.

**Interfaces:** Produce `assertSubmanagerMayAssign(actorId, recordId): Promise<{ managerId: string; recordId: string }>`; call it before `createLearnerAccount`, with an active parent, same-team, creator, confirmed and untaken check. The UI gets `createdByMe` from Task 3.

- [ ] **Step 1: Write failing tests** — another creator's Assign learner click displays exact alert and does not switch tabs; forged form returns forbidden without creating an auth/profile row; own confirmed/untaken DBD creates a learner under parent Manager, assignment and name-card/quiz follow-up; unconfirmed/taken/other-team DBDs fail.
- [ ] **Step 2: Run targeted tests; expected new cases FAIL.**
- [ ] **Step 3: Implement the server assertion and reuse existing creation pipeline** with parent Manager ID derived from Submanager's profile, never from submitted form data. Show a focused accessible alert on the forbidden click. Leave Owner/Manager behavior unchanged.
- [ ] **Step 4: Run targeted tests, `pnpm typecheck`; expected PASS.**
- [ ] **Step 5: Commit learner creation boundary.**

### Task 5: Summary-only learner record and hard-deny detail/actions

**Files:** Modify `app/[locale]/(admin)/admin/learners/page.tsx`, `lib/db/learner-record.ts`, detail page/actions under `app/[locale]/(admin)/admin/learners/`, `app/[locale]/(admin)/admin/users/[id]/`, `app/[locale]/(admin)/admin/dbd-records/[id]/`, and appointment/interview actions; test `tests/integration/learner-record.test.ts`, `tests/e2e/learner-record.spec.ts`, `tests/e2e/manager-access.spec.ts`.

**Interfaces:** Produce `loadSubmanagerLearnerSummary(actorId): Promise<LearnerRecordRow[]>`, which validates active actor/parent and filters service-role reads to parent Manager's learner IDs before returning only row fields. No raw answer, attempt, or interview turn access.

- [ ] **Step 1: Write failing tests** — same-team learner rows are present for every creator and every cell/action is static; other team rows absent; guessed detail/history/appointment URLs and server actions are denied; direct raw assessment/interview reads are denied; suspended parent denies list.
- [ ] **Step 2: Run targeted tests; expected new cases FAIL.**
- [ ] **Step 3: Implement the summary loader and role-specific table rendering.** Keep Manager table unchanged. Add explicit role guards on detail/actions and RLS tests proving no broad Submanager read policy.
- [ ] **Step 4: Run targeted tests, `pnpm typecheck`, `pnpm lint`; expected PASS.**
- [ ] **Step 5: Commit summary-only access.**

### Task 6: End-to-end regression and staging-ready handoff

**Files:** Test `tests/e2e/manager-manages.spec.ts`, `tests/e2e/create-learner-and-dbd.spec.ts`, `tests/e2e/learner-record.spec.ts`; update `docs/security-checklist.md`, `docs/uat-script.md` only for new role expectations.

**Interfaces:** No new production API; this task proves Tasks 1–5 compose safely.

- [ ] **Step 1: Add one end-to-end case** with two Managers, two Submanagers on one team, records uploaded by each, a Manager-corrected error, and a learner created from one Submanager's own record; assert exact forbidden alert on the other record and static whole-team Learner Record.
- [ ] **Step 2: Run it; fix only integration gaps found and rerun to PASS.**
- [ ] **Step 3: Run `pnpm test:unit`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm typecheck`, `pnpm lint`, `pnpm build`; record any unrelated pre-existing failure separately.**
- [ ] **Step 4: Update security checklist/UAT for the new role; review diff for accidental permission widening and unchanged existing-role behavior.**
- [ ] **Step 5: Commit final tests/docs. Do not push/deploy without a separate request.**
