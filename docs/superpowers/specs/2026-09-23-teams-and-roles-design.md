# Teams and roles (P15) — design

| | |
|---|---|
| Status | Stage 1 implemented (P15a); stages 2–3 (P15b, P15c) pending |
| Date | 2026-09-23 |
| Supersedes | The two-role model of the foundation spec (`admin` / `learner`) |
| Decisions | D52–D56 (recorded when the first stage merges) |

## 1. Why

Today the portal has two roles: one admin who can do everything, and learners. The owner cannot
delegate. Every DBD pack, every learner account and every content review passes through one
person, and there is no way to let a partner run their own group of learners without handing them
the keys to everything — including other clients' company records, which hold real PII.

This spec adds a middle level and, with it, the organising concept the project has lacked: **a
team**. Every person and every company record belongs to exactly one team, and a team is a
manager. Most future authorization questions answer themselves against that sentence.

## 2. Outcome

When this is done:

- The owner creates managers; a manager creates learners. Nobody else creates accounts.
- A manager sees their own learners and their own company records, and nothing of any other
  manager's. The owner sees everything.
- Account codes read as what they are: `T01` is a manager, `T01-03` is the third learner of that
  manager's team.
- Study cards and the question bank stay one shared library that managers help author.
- A departing manager's learners keep studying without interruption.

## 3. The model

### 3.1 Roles

| Level | Role value | Shown as | Thai |
|---|---|---|---|
| 1 | `admin` | Admin | ผู้ดูแลระบบ |
| 2 | `manager` | Manager | ผู้จัดการ |
| 3 | `learner` | Learner | ผู้เรียน |

`admin` and `learner` keep their current values, so existing rows, policies and app code that
read them are unaffected. Only `manager` is new.

### 3.2 Teams

A **team** is one manager plus the learners they create and the DBD records they upload. The
manager's login id *is* the team code.

- An **admin** belongs to no team and sees every team.
- A **manager** owns exactly one team, their own.
- A **learner** belongs to exactly one team, permanently.
- Records created by an admin belong to no team and are visible to admins only.

Two columns anchor this; everything else derives from them:

- `profiles.manager_id` — which manager a learner belongs to.
- `dbd_records.team_id` — which manager a company record belongs to.

Documents, transcripts, chunks, index jobs, assignments, attempts, eligibility, calls, name cards
and notifications all hang off a record or a user, so their policies reach the team through one
join rather than carrying their own copy of it.

### 3.3 Account codes

| | Format | Examples |
|---|---|---|
| Manager | `T` + number, padded to two digits | `T01`, `T02`, `T99`, `T100` |
| Learner | manager code + `-` + number, padded to two digits | `T01-01`, `T01-99`, `T01-100` |
| Admin | unchanged | `owner` |

Rules:

- Codes are allocated automatically: the next free number, taken from a counter that only ever
  increases. **A number is never reused**, even if the account it belonged to is deleted, so an
  exam result or audit entry always points at one person.
- Numbers pass 99 by growing a digit, not by failing.
- Login ids are stored lower-case (`t01-03`) as all login ids already are, and displayed
  upper-case (`T01-03`).
- The existing `owner` account keeps its login id: the admin sits outside the team system, so a
  team number would misrepresent it.

## 4. Permissions

| Area | Admin | Manager | Learner |
|---|---|---|---|
| Managers | create, suspend, reset password | — | — |
| Learners | all teams | own team: create, suspend, reset password | — |
| DBD records and documents | all teams | own team only | — |
| Study cards | write, approve | write, approve (shared library) | read approved |
| Question bank | write, approve | write, approve (shared library) | answer |
| AI question generation | any record | own records only | — |
| Exam and quiz results | all teams | own team only | own only |
| Call sessions and recordings | all teams | own team only | own only |
| Name cards | all teams | own team only | own only |
| Notifications | all | — (deferred) | — |
| Audit log | everything | own team's actions | — |
| Policy settings, provider keys | yes | no | — |

Two consequences worth stating plainly, both accepted by the owner:

- **Content is communal while data is private.** A card or question a manager approves reaches
  every learner in the system, including other teams'. The existing validator that rejects any
  generated question containing a reference company's literal values (D36) is what keeps company
  PII from travelling between teams; what travels is wording and judgement.
- **A manager can spend AI credits** by generating questions grounded in their own records.
  Cost stays visible to the admin through the generation batch list.

## 5. Data model

### 5.1 Changes

All of it lands in the first stage.

```sql
-- Role gains one value.
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('learner', 'manager', 'admin'));

-- People: which team a learner belongs to (null for managers and admins).
alter table public.profiles add column manager_id uuid references public.profiles (id);
create index profiles_manager_idx on public.profiles (manager_id);

-- Companies: which team a record belongs to (null = the admin's own).
alter table public.dbd_records add column team_id uuid references public.profiles (id);
create index dbd_records_team_idx on public.dbd_records (team_id);

-- Codes that never repeat.
create table public.login_id_counters (
  scope text primary key,          -- 'manager', or a manager's profile id for their learners
  next_value integer not null default 1
);
```

### 5.2 Invariants

1. Only a learner carries a `manager_id`; managers and admins have none.
2. A `manager_id` always references an account whose role is `manager`.
3. A learner's login id is their manager's login id, a hyphen, and a number.
4. A team code and a learner number are allocated once and never issued again.
5. `dbd_records.team_id` is the team of the account that created the record, or null when an
   admin created it.

Invariants 1–2 are enforced by a database trigger, 3–4 by the allocation function, 5 by the
record-creation path.

### 5.3 Allocation

A security-definer function `public.allocate_login_id(p_scope text)` increments the counter row
for its scope inside the transaction and returns the next number. Two callers:

- Creating a manager: scope `'manager'` → `T` + padded number.
- Creating a learner: scope = the manager's profile id → manager code + `-` + padded number.

The function is granted to `service_role` only; account creation already runs through the admin
client.

## 6. Authorization

`is_admin()` is used by 48 policies today and keeps its exact meaning: level 1. Four helpers join
it, all security-definer, all reading only `profiles`:

| Helper | Answers |
|---|---|
| `is_manager()` | Is the caller an active manager? |
| `is_staff()` | Is the caller an active admin or manager? |
| `my_team()` | The caller's team: their own id if a manager, their `manager_id` if a learner, null if an admin |
| `in_my_team(p_user uuid)` | Is that account in the caller's team (or is the caller an admin)? |

Every policy that reads `is_admin()` today becomes one of three shapes:

- **Admin only** (policy settings, provider keys, the managers list, the full audit log):
  unchanged.
- **Staff, shared** (study cards, questions, localizations, generation batches):
  `is_staff()`.
- **Staff, team-scoped** (records, documents, transcripts, chunks, sweeps, index jobs,
  assignments, eligibility, attempts, answers, calls, name cards, notifications, audit):
  `is_admin() or (is_manager() and <the row's team> = my_team())`, where the row's team is reached
  by the joins in §3.2.

Learner policies are untouched: a learner already sees only their own rows.

## 7. Lifecycle

**Creating a manager.** The admin supplies a display name, an initial password and a contact
channel. The system allocates the next team code, creates the account with role `manager`, and
records the creation in the audit log.

**Creating a learner.** A manager supplies a display name, an initial password and the company
(one of their own confirmed records, as D48 already requires). The system allocates the next code
inside that team, creates the account with role `learner` and `manager_id` set to the creator, and
assigns the company.

**Suspending a learner.** Unchanged from today: the account is disabled and cannot sign in. Their
history stays.

**A manager leaves.** The admin suspends the manager's account. Nothing cascades:

- The manager cannot sign in; `is_manager()` requires an active account, so their team is no
  longer reachable by anyone but the admin.
- Their learners stay active. Logins, progress, assignments and exam history are untouched, and
  learners notice nothing.
- Their records, documents and transcripts stay exactly as they are, visible to the admin.

**Handing a team to a successor.** The admin re-enables the team's account, sets a new password
and changes the display name to the new holder. The team code, its learners and its records stay
put, so every id keeps meaning and no data moves. The audit log records the change of holder.
This needs no schema beyond what §5 adds.

## 8. Notifications — deferred

Notifications are untouched by this spec, at the owner's instruction: exam results keep going to
the global admin list in Policy settings, and the Notifications screen stays admin-only. Routing a
result to the learner's own manager needs a contact channel per manager and a subject column on
the queue; both are a later, self-contained piece of work once teams are in use.

## 9. Audit

`audit_logs.actor_id` already records who acted. A manager reads the rows whose actor is in their
team — themselves and their learners. The admin reads everything, including actions on rows that
have since been deleted.

## 10. Existing data

Nothing needs migrating. The `owner` account stays an admin. Every record and learner created so
far has no team, which makes them the admin's own and invisible to every manager — the correct
outcome. The first manager created after this ships starts at `T01`.

## 11. Application changes

**Session guards.** `requireAdmin` appears in 27 files today and means "level 1 or nothing". It
splits into `requireAdmin` (level 1) and `requireStaff` (admin or manager). Pages that stay level
1: Policy settings, Managers, the full audit log, and anything touching provider keys.

**Queries.** Team-scoped pages pass the caller's team to their query. Because RLS enforces the
same rule, a missed filter shows an empty list rather than another team's data.

**Screens.**

- New **Managers** screen for the admin: create a manager, see each team's learner and record
  counts, suspend, reset password, edit the holder and contact channel.
- **Users** screen becomes team-scoped for managers; the admin additionally sees which team each
  learner belongs to.
- **Navigation** is filtered by role: managers do not see Policy settings or the system audit log.
- Account codes are shown upper-case through one display helper, so `t01-03` never reaches a
  screen.

## 12. Stages

Each stage is shippable on its own and ends green.

1. **Teams in the database.** Migration, helpers, the rewritten policies, allocation function, and
   the security tests that prove one team cannot read another. No visible change.
2. **Creating people.** Managers screen, team-scoped Users screen, automatic codes, display
   helper.
3. **Scoping the rest.** Records, documents, questions, content, calls, name cards, audit,
   navigation.

Each stage gets its own implementation plan: P15a, P15b, P15c.

## 13. Tests

- **Isolation (integration).** For each team-scoped table, a manager in team A reads zero rows of
  team B and cannot write to them: records, documents, pages, chunks, sweeps, index jobs,
  assignments, eligibility, attempts, answers, calls, name cards, notifications, audit. This
  follows the existing `*.rls.test.ts` pattern.
- **Allocation (integration).** Codes are padded, sequential, unaffected by deletion, and pass 99
  correctly; two concurrent creations never collide.
- **Invariants (integration).** A learner cannot be created under a non-manager; a manager cannot
  carry a `manager_id`.
- **Lifecycle (integration).** Suspending a manager leaves their learners able to sign in and
  their records readable by the admin; re-enabling restores the team.
- **Content (integration).** A manager may approve a shared question; a learner in another team
  receives it.
- **End to end.** The admin creates `T01` and `T02`; `T01` creates two learners and uploads a
  pack; `T02` signs in and sees neither the learners nor the record; a `T01` learner signs in and
  studies.

## 14. Out of scope

Deliberately excluded, and why:

- **Per-manager content libraries** — the owner chose a shared library; splitting it later is a
  separate spec.
- **Managers creating managers** — a second level of delegation nobody has asked for.
- **Moving a learner between teams** — the exit path covers the real case; cross-team transfer
  would break the code-to-team correspondence.
- **Quotas or billing per team** — no commercial model depends on it yet.
- **Routing notifications to managers** — deferred by the owner; see §8.
- **Restyling the screens** — the design system (palette, typography, selective glassmorphism) is
  applied after this lands, so the new screens are built once rather than styled twice.
