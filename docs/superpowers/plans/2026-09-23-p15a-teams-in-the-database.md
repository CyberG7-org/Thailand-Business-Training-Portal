# P15a — Teams in the database: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the three-role, one-team-per-manager model into the database — role, membership, code allocation, authorization helpers and every rewritten policy — so that one manager provably cannot read another manager's data.

**Architecture:** A team is anchored by two columns: `profiles.manager_id` (which team a learner is in) and `dbd_records.team_id` (which team a company record is in). Four security-definer helpers answer "who is asking" and "whose team is this", and every policy that today asks `is_admin()` becomes admin-only, staff-shared, or team-scoped. Nothing in the user interface changes in this stage.

**Tech Stack:** Supabase Postgres (RLS, security-definer functions), Supabase CLI migrations, Vitest integration suite against the local Docker stack.

**Spec:** `docs/superpowers/specs/2026-09-23-teams-and-roles-design.md`

## Global Constraints

- Role values are exactly `'learner'`, `'manager'`, `'admin'`. `admin` and `learner` keep their current meaning.
- `is_admin()` keeps its exact current definition and meaning: an active level-1 account.
- Login ids are stored lower-case. Manager codes are `t` + the number padded to two digits (`t01`, `t99`, `t100`); learner codes are the manager's code + `-` + the number padded to two digits (`t01-01`, `t01-100`).
- A code is allocated once and never issued again, even after the account is deleted.
- Records created by an admin have `team_id` null and are visible to admins only.
- Notifications, webhooks and policy settings stay admin-only in this stage; routing results to managers is deferred (spec §8).
- No data migration: existing rows keep `manager_id` and `team_id` null.
- Every migration file is `supabase/migrations/YYYYMMDDHHMMSS_name.sql` and must survive `pnpm db:reset` from empty.
- Integration tests run against the local stack: `pnpm db:start` once, then `pnpm exec vitest run --config vitest.integration.config.ts <file>`.
- Spec invariants 3 (a learner's code starts with their manager's) and 5 (a record's `team_id` is its creator's team) are properties of the account- and record-creation paths, which belong to P15b; this plan builds the columns, the allocator and the policies they will use.

## Review Focus

1. **A suspended manager with a live session.** Their browser still holds a valid JWT; `is_manager()` requires `status = 'active'`, so every team-scoped policy must fall shut for them. Tested in Task 4.
2. **A learner whose manager is suspended.** They must keep signing in and studying — the spec's exit path depends on it. Tested in Task 5.
3. **Storage path guessing.** A manager requesting `<other-team-record-id>/file.pdf` from the `dbd-documents` bucket must be refused, since the object key is guessable from a record id. Tested in Task 5.
4. **Concurrent creation.** Two managers (or two learners in one team) created at the same moment must not receive the same code. Tested in Task 3.
5. **Writing into another team.** A manager inserting or updating a `dbd_records` row with someone else's `team_id`, or moving a learner to another manager, must be refused by `with check`, not merely hidden by `using`. Tested in Tasks 5 and 6.

---

### Task 1: The `manager` role

**Files:**

- Create: `supabase/migrations/20260923010000_manager_role.sql`
- Modify: `lib/auth/session.ts` (the `CurrentUser.role` union)
- Modify: `tests/integration/helpers.ts` (the `Role` union)
- Test: `tests/integration/teams.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: role value `'manager'` accepted by `profiles.role` and by the app-metadata sync trigger; `Role` in the test helpers includes `'manager'`.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/teams.test.ts`:

```ts
import { afterAll, describe, expect, it } from 'vitest';
import { adminClient, createTestUser, deleteTestUser } from './helpers';

describe('the manager role', () => {
  const created: string[] = [];
  afterAll(async () => {
    await Promise.all(created.map((id) => deleteTestUser(id)));
  });

  it('creates a profile with role manager from app metadata', async () => {
    const manager = await createTestUser('manager');
    created.push(manager.id);
    const { data } = await adminClient()
      .from('profiles')
      .select('role, status')
      .eq('id', manager.id)
      .single();
    expect(data).toMatchObject({ role: 'manager', status: 'active' });
  });

  it('syncs a role change to manager through app metadata', async () => {
    const user = await createTestUser('learner');
    created.push(user.id);
    await adminClient().auth.admin.updateUserById(user.id, { app_metadata: { role: 'manager' } });
    const { data } = await adminClient().from('profiles').select('role').eq('id', user.id).single();
    expect(data?.role).toBe('manager');
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/teams.test.ts`
Expected: FAIL — `createTestUser('manager')` is a type error, and the check constraint rejects `'manager'`.

- [ ] **Step 3: Widen the `Role` union in the test helpers**

In `tests/integration/helpers.ts`, replace the `Role` line:

```ts
export type Role = 'learner' | 'manager' | 'admin';
```

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20260923010000_manager_role.sql`:

```sql
-- P15a: a third role between the admin and the learner (spec §3.1). `admin` and `learner` keep
-- their meaning, so every existing row and policy is unaffected.

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('learner', 'manager', 'admin'));

-- The app-metadata sync trigger only recognised the two old values.
create or replace function public.sync_profile_role_from_app_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := new.raw_app_meta_data ->> 'role';
begin
  if v_role is distinct from (old.raw_app_meta_data ->> 'role')
     and v_role in ('learner', 'manager', 'admin') then
    update public.profiles set role = v_role where id = new.id;
  end if;
  return new;
end;
$$;
```

- [ ] **Step 5: Widen the app's role type**

In `lib/auth/session.ts`, change the `role` field of `CurrentUser`:

```ts
  role: 'learner' | 'manager' | 'admin';
```

- [ ] **Step 6: Apply the migration and run the test**

Run: `pnpm db:reset && pnpm db:types && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/teams.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 7: Typecheck**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260923010000_manager_role.sql lib/auth/session.ts lib/db/database.types.ts tests/integration/helpers.ts tests/integration/teams.test.ts
git commit -m "feat(p15a): the manager role"
```

---

### Task 2: Team membership columns and invariants

**Files:**

- Create: `supabase/migrations/20260923010100_team_columns.sql`
- Modify: `tests/integration/teams.test.ts`
- Modify: `tests/integration/helpers.ts`

**Interfaces:**

- Consumes: role `'manager'` from Task 1.
- Produces: `profiles.manager_id uuid`, `dbd_records.team_id uuid`; test helpers `createTestManager()` and `createTestLearnerIn(manager)`.

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/teams.test.ts`:

```ts
describe('team membership', () => {
  const created: string[] = [];
  afterAll(async () => {
    await Promise.all(created.map((id) => deleteTestUser(id)));
  });

  it('puts a learner in a manager team and rejects a manager carrying one', async () => {
    const manager = await createTestManager();
    const learner = await createTestLearnerIn(manager);
    created.push(learner.id, manager.id);
    const { data } = await adminClient()
      .from('profiles')
      .select('manager_id')
      .eq('id', learner.id)
      .single();
    expect(data?.manager_id).toBe(manager.id);

    const other = await createTestManager();
    created.push(other.id);
    const { error } = await adminClient()
      .from('profiles')
      .update({ manager_id: other.id })
      .eq('id', manager.id);
    expect(error).not.toBeNull();
  });

  it('refuses a learner parented to someone who is not a manager', async () => {
    const admin = await createTestUser('admin');
    const learner = await createTestUser('learner');
    created.push(admin.id, learner.id);
    const { error } = await adminClient()
      .from('profiles')
      .update({ manager_id: admin.id })
      .eq('id', learner.id);
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Add the test helpers**

Append to `tests/integration/helpers.ts`:

```ts
/** A manager account; its profile id is its own team. */
export async function createTestManager(
  overrides: { loginId?: string; displayName?: string } = {},
): Promise<TestUser> {
  return createTestUser('manager', overrides);
}

/** A learner inside the given manager's team. */
export async function createTestLearnerIn(
  manager: TestUser,
  overrides: { loginId?: string; displayName?: string } = {},
): Promise<TestUser> {
  const learner = await createTestUser('learner', overrides);
  const { error } = await adminClient()
    .from('profiles')
    .update({ manager_id: manager.id })
    .eq('id', learner.id);
  if (error) throw error;
  return learner;
}
```

Add `createTestManager` and `createTestLearnerIn` to the import list at the top of `tests/integration/teams.test.ts`.

- [ ] **Step 3: Run the test and watch it fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/teams.test.ts`
Expected: FAIL — column `manager_id` does not exist.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20260923010100_team_columns.sql`:

```sql
-- P15a: the two columns that anchor a team (spec §3.2). Everything else reaches its team
-- through a join to one of these.

-- People: which team a learner belongs to. Null for managers and admins.
alter table public.profiles add column manager_id uuid references public.profiles (id);
create index profiles_manager_idx on public.profiles (manager_id);
comment on column public.profiles.manager_id is
  'The manager whose team this learner belongs to; null for managers and admins.';

-- Companies: which team a record belongs to. Null means the admin''s own.
alter table public.dbd_records add column team_id uuid references public.profiles (id);
create index dbd_records_team_idx on public.dbd_records (team_id);
comment on column public.dbd_records.team_id is
  'The manager whose team uploaded this record; null when an admin created it.';

-- Invariants 1 and 2 of the spec: only a learner has a team, and that team is a manager.
create or replace function public.enforce_team_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.manager_id is null then
    return new;
  end if;
  if new.role <> 'learner' then
    raise exception 'only a learner can belong to a team (role is %)', new.role;
  end if;
  if not exists (select 1 from public.profiles p where p.id = new.manager_id and p.role = 'manager') then
    raise exception 'manager_id must reference a manager';
  end if;
  return new;
end;
$$;

create trigger profiles_team_membership
  before insert or update of manager_id, role on public.profiles
  for each row execute function public.enforce_team_membership();
```

- [ ] **Step 5: Apply and run the test**

Run: `pnpm db:reset && pnpm db:types && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/teams.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260923010100_team_columns.sql lib/db/database.types.ts tests/integration/helpers.ts tests/integration/teams.test.ts
git commit -m "feat(p15a): team membership columns and their invariants"
```

---

### Task 3: Account code allocation

**Files:**

- Create: `supabase/migrations/20260923010200_login_id_counters.sql`
- Create: `tests/integration/login-ids.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `public.allocate_login_id(p_scope text, p_prefix text) returns text`, granted to `service_role`.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/login-ids.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { adminClient } from './helpers';

const svc = adminClient();

async function allocate(scope: string, prefix: string): Promise<string> {
  const { data, error } = await svc.rpc('allocate_login_id', {
    p_scope: scope,
    p_prefix: prefix,
  });
  if (error) throw error;
  return data as string;
}

describe('allocate_login_id', () => {
  const scopes: string[] = [];
  afterAll(async () => {
    await svc.from('login_id_counters').delete().in('scope', scopes);
  });

  it('counts from one, pads to two digits and grows past 99', async () => {
    const scope = `test-${randomUUID()}`;
    scopes.push(scope);
    expect(await allocate(scope, 't')).toBe('t01');
    expect(await allocate(scope, 't')).toBe('t02');
    await svc.from('login_id_counters').update({ next_value: 99 }).eq('scope', scope);
    expect(await allocate(scope, 't')).toBe('t99');
    expect(await allocate(scope, 't')).toBe('t100');
  });

  it('keeps each team is own counter and never repeats under concurrency', async () => {
    const team = `test-${randomUUID()}`;
    const other = `test-${randomUUID()}`;
    scopes.push(team, other);
    const codes = await Promise.all(
      Array.from({ length: 10 }, () => allocate(team, 't01-')),
    );
    expect(new Set(codes).size).toBe(10);
    expect(codes.sort()).toEqual(
      Array.from({ length: 10 }, (_, i) => `t01-${String(i + 1).padStart(2, '0')}`).sort(),
    );
    expect(await allocate(other, 't02-')).toBe('t02-01');
  });

  it('never reissues a number after the account that held it is gone', async () => {
    const scope = `test-${randomUUID()}`;
    scopes.push(scope);
    expect(await allocate(scope, 't')).toBe('t01');
    expect(await allocate(scope, 't')).toBe('t02');
    // Deleting accounts does not touch the counter, so the next code is t03.
    expect(await allocate(scope, 't')).toBe('t03');
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/login-ids.test.ts`
Expected: FAIL — function `allocate_login_id` does not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260923010200_login_id_counters.sql`:

```sql
-- P15a: account codes that are never reused (spec §3.3). One counter row per scope: 'manager'
-- for team codes, and a manager''s profile id for the learners inside that team.

create table public.login_id_counters (
  scope text primary key,
  next_value integer not null default 1
);
alter table public.login_id_counters enable row level security;
-- No policies: only the service role, through allocate_login_id, ever touches this.

comment on table public.login_id_counters is
  'Monotonic counters behind account codes; a value is issued once and never reused.';

create or replace function public.allocate_login_id(p_scope text, p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  insert into public.login_id_counters as c (scope, next_value)
  values (p_scope, 2)
  on conflict (scope) do update set next_value = c.next_value + 1
  returning case when xmax = 0 then 1 else c.next_value - 1 end into v_next;
  return p_prefix || lpad(v_next::text, 2, '0');
end;
$$;

revoke all on function public.allocate_login_id(text, text) from public, anon, authenticated;
grant execute on function public.allocate_login_id(text, text) to service_role;
```

- [ ] **Step 4: Apply and run the test**

Run: `pnpm db:reset && pnpm db:types && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/login-ids.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260923010200_login_id_counters.sql lib/db/database.types.ts tests/integration/login-ids.test.ts
git commit -m "feat(p15a): account codes allocated once and never reused"
```

---

### Task 4: Authorization helpers

**Files:**

- Create: `supabase/migrations/20260923010300_team_helpers.sql`
- Create: `tests/integration/team-helpers.test.ts`

**Interfaces:**

- Consumes: role `'manager'` (Task 1), `profiles.manager_id` (Task 2).
- Produces: `public.is_manager()`, `public.is_staff()`, `public.my_team()`, `public.in_my_team(uuid)`, all `stable security definer`, granted to `authenticated` and `service_role`.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/team-helpers.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  clientFor,
  createTestLearnerIn,
  createTestManager,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

const svc = adminClient();

async function ask(client: Client, fn: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(fn as 'is_manager', args as never);
  if (error) throw error;
  return data;
}

describe('the team helpers', () => {
  let admin: TestUser;
  let manager: TestUser;
  let learner: TestUser;
  let stranger: TestUser;
  let asAdmin: Client;
  let asManager: Client;
  let asLearner: Client;

  beforeAll(async () => {
    admin = await createTestUser('admin');
    manager = await createTestManager();
    learner = await createTestLearnerIn(manager);
    stranger = await createTestManager();
    [asAdmin, asManager, asLearner] = await Promise.all([
      clientFor(admin),
      clientFor(manager),
      clientFor(learner),
    ]);
  });

  afterAll(async () => {
    await Promise.all(
      [admin, manager, learner, stranger].map((u) => deleteTestUser(u.id)),
    );
  });

  it('answers who is asking', async () => {
    expect(await ask(asManager, 'is_manager')).toBe(true);
    expect(await ask(asAdmin, 'is_manager')).toBe(false);
    expect(await ask(asLearner, 'is_manager')).toBe(false);
    expect(await ask(asAdmin, 'is_staff')).toBe(true);
    expect(await ask(asManager, 'is_staff')).toBe(true);
    expect(await ask(asLearner, 'is_staff')).toBe(false);
  });

  it('reports the caller team', async () => {
    expect(await ask(asManager, 'my_team')).toBe(manager.id);
    expect(await ask(asLearner, 'my_team')).toBe(manager.id);
    expect(await ask(asAdmin, 'my_team')).toBeNull();
  });

  it('places accounts inside or outside the caller team', async () => {
    expect(await ask(asManager, 'in_my_team', { p_user: learner.id })).toBe(true);
    expect(await ask(asManager, 'in_my_team', { p_user: stranger.id })).toBe(false);
    expect(await ask(asAdmin, 'in_my_team', { p_user: stranger.id })).toBe(true);
  });

  it('falls shut for a suspended manager who still holds a session', async () => {
    await svc.from('profiles').update({ status: 'disabled' }).eq('id', manager.id);
    expect(await ask(asManager, 'is_manager')).toBe(false);
    expect(await ask(asManager, 'is_staff')).toBe(false);
    expect(await ask(asManager, 'my_team')).toBeNull();
    await svc.from('profiles').update({ status: 'active' }).eq('id', manager.id);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/team-helpers.test.ts`
Expected: FAIL — function `is_manager` does not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260923010300_team_helpers.sql`:

```sql
-- P15a: the four questions every team-scoped policy asks (spec §6). Security definer so a policy
-- can call them without recursing into the policies on profiles.

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'manager' and p.status = 'active'
  );
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('manager', 'admin') and p.status = 'active'
  );
$$;

-- A manager''s team is themselves; a learner''s team is their manager; an admin has none.
create or replace function public.my_team()
returns uuid language sql stable security definer set search_path = public as $$
  select case when p.role = 'manager' then p.id else p.manager_id end
  from public.profiles p
  where p.id = auth.uid() and p.status = 'active';
$$;

create or replace function public.in_my_team(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.profiles p
    where p.id = p_user
      and public.my_team() is not null
      and (p.id = public.my_team() or p.manager_id = public.my_team())
  );
$$;

revoke all on function public.is_manager() from public;
revoke all on function public.is_staff() from public;
revoke all on function public.my_team() from public;
revoke all on function public.in_my_team(uuid) from public;
grant execute on function public.is_manager() to authenticated, service_role;
grant execute on function public.is_staff() to authenticated, service_role;
grant execute on function public.my_team() to authenticated, service_role;
grant execute on function public.in_my_team(uuid) to authenticated, service_role;
```

- [ ] **Step 4: Apply and run the test**

Run: `pnpm db:reset && pnpm db:types && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/team-helpers.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260923010300_team_helpers.sql lib/db/database.types.ts tests/integration/team-helpers.test.ts
git commit -m "feat(p15a): authorization helpers for teams"
```

---

### Task 5: Policies for people, companies and their files

**Files:**

- Create: `supabase/migrations/20260923010400_team_policies_core.sql`
- Create: `tests/integration/team-isolation.test.ts`

**Interfaces:**

- Consumes: the helpers from Task 4, the columns from Task 2.
- Produces: team-scoped policies on `public.profiles`, `public.dbd_records`, `public.dbd_documents` and the `dbd-documents` storage bucket. Later tasks reuse the seeding helper `seedTeam()` defined in `tests/integration/team-isolation.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/team-isolation.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  clientFor,
  createTestLearnerIn,
  createTestManager,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

const svc = adminClient();
const fixture = readFileSync('tests/fixtures/three-pages.pdf');

export type Team = {
  manager: TestUser;
  learner: TestUser;
  asManager: Client;
  recordId: string;
  documentPath: string;
};

/** A manager, one learner of theirs, and one company record with a document. */
async function seedTeam(label: string): Promise<Team> {
  const manager = await createTestManager({ displayName: label });
  const learner = await createTestLearnerIn(manager, { displayName: `${label} learner` });
  const { data: record, error } = await svc
    .from('dbd_records')
    .insert({ company_name_th: `บริษัท ${label} จำกัด`, team_id: manager.id, created_by: manager.id })
    .select()
    .single();
  if (error) throw error;
  const documentPath = `${record.id}/${Date.now()}-1.pdf`;
  await svc.storage
    .from('dbd-documents')
    .upload(documentPath, fixture, { contentType: 'application/pdf' });
  const { error: docError } = await svc.from('dbd_documents').insert({
    record_id: record.id,
    path: documentPath,
    original_name: 'pack.pdf',
    size_bytes: fixture.byteLength,
    position: 1,
    page_count: 3,
    index_status: 'ready',
  });
  if (docError) throw docError;
  return { manager, learner, asManager: await clientFor(manager), recordId: record.id, documentPath };
}

describe('one team cannot see another', () => {
  let a: Team;
  let b: Team;

  beforeAll(async () => {
    a = await seedTeam('เอ');
    b = await seedTeam('บี');
  });

  afterAll(async () => {
    for (const team of [a, b]) {
      await svc.storage.from('dbd-documents').remove([team.documentPath]);
      await svc.from('dbd_records').delete().eq('id', team.recordId);
      await deleteTestUser(team.learner.id);
      await deleteTestUser(team.manager.id);
    }
  });

  it('shows a manager their own learner and no one else is', async () => {
    const { data } = await a.asManager.from('profiles').select('id, manager_id');
    const ids = (data ?? []).map((p) => p.id);
    expect(ids).toContain(a.learner.id);
    expect(ids).not.toContain(b.learner.id);
    expect(ids).not.toContain(b.manager.id);
  });

  it('shows a manager their own records and documents only', async () => {
    const { data: records } = await a.asManager.from('dbd_records').select('id');
    expect((records ?? []).map((r) => r.id)).toEqual([a.recordId]);
    const { data: docs } = await a.asManager.from('dbd_documents').select('record_id');
    expect((docs ?? []).map((d) => d.record_id)).toEqual([a.recordId]);
  });

  it('refuses a document file belonging to another team', async () => {
    const mine = await a.asManager.storage.from('dbd-documents').download(a.documentPath);
    expect(mine.error).toBeNull();
    const theirs = await a.asManager.storage.from('dbd-documents').download(b.documentPath);
    expect(theirs.data).toBeNull();
  });

  it('refuses writing a record into another team, or moving a learner out of one', async () => {
    const { error: inserted } = await a.asManager
      .from('dbd_records')
      .insert({ company_name_th: 'บริษัท แอบ จำกัด', team_id: b.manager.id });
    expect(inserted).not.toBeNull();
    const { data: moved } = await a.asManager
      .from('dbd_records')
      .update({ team_id: a.manager.id })
      .eq('id', b.recordId)
      .select();
    expect(moved ?? []).toEqual([]);

    const { data: poached } = await a.asManager
      .from('profiles')
      .update({ manager_id: a.manager.id })
      .eq('id', b.learner.id)
      .select();
    expect(poached ?? []).toEqual([]);
    const { error: pushedAway } = await a.asManager
      .from('profiles')
      .update({ manager_id: b.manager.id })
      .eq('id', a.learner.id)
      .select();
    expect(pushedAway).not.toBeNull();
  });

  it('keeps a record the admin owns out of every manager view', async () => {
    const { data: mine } = await svc
      .from('dbd_records')
      .insert({ company_name_th: 'บริษัท ของแอดมิน จำกัด' })
      .select()
      .single();
    const { data: seenByA } = await a.asManager.from('dbd_records').select('id');
    expect((seenByA ?? []).map((r) => r.id)).not.toContain(mine!.id);
    await svc.from('dbd_records').delete().eq('id', mine!.id);
  });

  it('lets a learner keep working while their manager is suspended', async () => {
    await svc.from('profiles').update({ status: 'disabled' }).eq('id', a.manager.id);
    const asLearner = await clientFor(a.learner);
    const { data, error } = await asLearner.from('profiles').select('id').eq('id', a.learner.id);
    expect(error).toBeNull();
    expect((data ?? []).map((p) => p.id)).toEqual([a.learner.id]);
    const { data: hidden } = await a.asManager.from('dbd_records').select('id');
    expect(hidden ?? []).toEqual([]);
    await svc.from('profiles').update({ status: 'active' }).eq('id', a.manager.id);
  });

  it('still shows an admin everything', async () => {
    const admin = await createTestUser('admin');
    const asAdmin = await clientFor(admin);
    const { data } = await asAdmin.from('dbd_records').select('id');
    const ids = (data ?? []).map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([a.recordId, b.recordId]));
    await deleteTestUser(admin.id);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/team-isolation.test.ts`
Expected: FAIL — a manager currently reads nothing (the policies only admit admins), so the first assertion about seeing their own learner fails.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260923010400_team_policies_core.sql`:

```sql
-- P15a: people, companies and their files become team-scoped (spec §6). The admin keeps
-- everything; a manager gets exactly their own team.

drop policy "profiles: admins do everything" on public.profiles;
create policy "profiles: admins and owning managers" on public.profiles
  for all to authenticated
  using (public.is_admin() or (public.is_manager() and manager_id = public.my_team()))
  with check (public.is_admin() or (public.is_manager() and manager_id = public.my_team()));

drop policy "dbd: admins do everything" on public.dbd_records;
create policy "dbd: admins and owning managers" on public.dbd_records
  for all to authenticated
  using (public.is_admin() or (public.is_manager() and team_id = public.my_team()))
  with check (public.is_admin() or (public.is_manager() and team_id = public.my_team()));

drop policy "dbd documents: admins do everything" on public.dbd_documents;
create policy "dbd documents: admins and owning managers" on public.dbd_documents
  for all to authenticated
  using (
    public.is_admin() or (public.is_manager() and exists (
      select 1 from public.dbd_records r
      where r.id = dbd_documents.record_id and r.team_id = public.my_team()
    ))
  )
  with check (
    public.is_admin() or (public.is_manager() and exists (
      select 1 from public.dbd_records r
      where r.id = dbd_documents.record_id and r.team_id = public.my_team()
    ))
  );

-- Object keys are '<record id>/<file>', so the record id is guessable: scope the bucket too.
drop policy "dbd docs: admins do everything" on storage.objects;
create policy "dbd docs: admins and owning managers" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'dbd-documents' and (
      public.is_admin() or (public.is_manager() and exists (
        select 1 from public.dbd_records r
        where r.id::text = split_part(name, '/', 1) and r.team_id = public.my_team()
      ))
    )
  )
  with check (
    bucket_id = 'dbd-documents' and (
      public.is_admin() or (public.is_manager() and exists (
        select 1 from public.dbd_records r
        where r.id::text = split_part(name, '/', 1) and r.team_id = public.my_team()
      ))
    )
  );
```

- [ ] **Step 4: Apply and run the test**

Run: `pnpm db:reset && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/team-isolation.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the existing security suites for regressions**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/profiles.rls.test.ts tests/integration/dbd-records.rls.test.ts tests/integration/isolation.test.ts`
Expected: PASS, unchanged counts.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260923010400_team_policies_core.sql tests/integration/team-isolation.test.ts
git commit -m "feat(p15a): team-scoped policies for people, companies and their files"
```

---

### Task 6: Policies for everything hanging off a record

**Files:**

- Create: `supabase/migrations/20260923010500_team_policies_record_children.sql`
- Modify: `tests/integration/team-isolation.test.ts`

**Interfaces:**

- Consumes: `seedTeam()` and the helpers from Task 5.
- Produces: team-scoped policies on `dbd_pages`, `dbd_chunks`, `dbd_sweeps`, `index_jobs`.

- [ ] **Step 1: Write the failing test**

Append to the `describe('one team cannot see another')` block in `tests/integration/team-isolation.test.ts`:

```ts
  it('hides another team transcripts, chunks, sweeps and jobs', async () => {
    const { data: doc } = await svc
      .from('dbd_documents')
      .select('id')
      .eq('record_id', b.recordId)
      .single();
    await svc
      .from('dbd_pages')
      .insert({ document_id: doc!.id, page: 1, text: 'ความลับ', model: 'fake' });
    await svc.from('dbd_chunks').insert({
      id: `${doc!.id}#1#0`,
      record_id: b.recordId,
      document_id: doc!.id,
      page: 1,
      chunk_index: 0,
      chunk_text: 'ความลับ',
      char_count: 7,
    });
    await svc
      .from('dbd_sweeps')
      .insert({ document_id: doc!.id, first_page: 1, last_page: 1, result: {} });
    await svc
      .from('index_jobs')
      .insert({ record_id: b.recordId, document_id: doc!.id, kind: 'index' });

    for (const table of ['dbd_pages', 'dbd_chunks', 'dbd_sweeps', 'index_jobs'] as const) {
      const { data } = await a.asManager.from(table).select('*');
      expect(data ?? []).toEqual([]);
    }
    const { data: mine } = await b.asManager.from('dbd_chunks').select('record_id');
    expect((mine ?? []).map((c) => c.record_id)).toEqual([b.recordId]);
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/team-isolation.test.ts`
Expected: FAIL — team B's manager reads no chunks, because those tables still admit admins only.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260923010500_team_policies_record_children.sql`:

```sql
-- P15a: transcripts, chunks, cached sweeps and jobs follow the record they belong to.

drop policy "dbd pages: admins read" on public.dbd_pages;
create policy "dbd pages: admins and owning managers read" on public.dbd_pages
  for select to authenticated
  using (
    public.is_admin() or (public.is_manager() and exists (
      select 1 from public.dbd_documents d
      join public.dbd_records r on r.id = d.record_id
      where d.id = dbd_pages.document_id and r.team_id = public.my_team()
    ))
  );

drop policy "dbd chunks: admins read" on public.dbd_chunks;
create policy "dbd chunks: admins and owning managers read" on public.dbd_chunks
  for select to authenticated
  using (
    public.is_admin() or (public.is_manager() and exists (
      select 1 from public.dbd_records r
      where r.id = dbd_chunks.record_id and r.team_id = public.my_team()
    ))
  );

drop policy "dbd sweeps: admins read" on public.dbd_sweeps;
create policy "dbd sweeps: admins and owning managers read" on public.dbd_sweeps
  for select to authenticated
  using (
    public.is_admin() or (public.is_manager() and exists (
      select 1 from public.dbd_documents d
      join public.dbd_records r on r.id = d.record_id
      where d.id = dbd_sweeps.document_id and r.team_id = public.my_team()
    ))
  );

drop policy "index jobs: admins do everything" on public.index_jobs;
create policy "index jobs: admins and owning managers" on public.index_jobs
  for all to authenticated
  using (
    public.is_admin() or (public.is_manager() and exists (
      select 1 from public.dbd_records r
      where r.id = index_jobs.record_id and r.team_id = public.my_team()
    ))
  )
  with check (
    public.is_admin() or (public.is_manager() and exists (
      select 1 from public.dbd_records r
      where r.id = index_jobs.record_id and r.team_id = public.my_team()
    ))
  );
```

- [ ] **Step 4: Apply and run the test**

Run: `pnpm db:reset && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/team-isolation.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Run the index security suite for regressions**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/dbd-index.rls.test.ts tests/integration/dbd-index.test.ts`
Expected: PASS, unchanged counts.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260923010500_team_policies_record_children.sql tests/integration/team-isolation.test.ts
git commit -m "feat(p15a): team-scoped policies for transcripts, chunks, sweeps and jobs"
```

---

### Task 7: Policies for learner activity

**Files:**

- Create: `supabase/migrations/20260923010600_team_policies_activity.sql`
- Modify: `tests/integration/team-isolation.test.ts`

**Interfaces:**

- Consumes: `in_my_team(uuid)` from Task 4, `seedTeam()` from Task 5.
- Produces: team-scoped policies on `user_dbd_assignments`, `eligibility_snapshots`, `assessment_attempts`, `assessment_answers`, `study_progress`, `call_sessions`, `name_cards`, and the `recordings` and `name-cards` buckets.

- [ ] **Step 1: Write the failing test**

Append to the `describe('one team cannot see another')` block:

```ts
  it('hides another team learner activity', async () => {
    const { data: assignment } = await svc
      .from('user_dbd_assignments')
      .insert({ user_id: b.learner.id, dbd_record_id: b.recordId })
      .select()
      .single();
    expect(assignment).not.toBeNull();
    const { data: attempt } = await svc
      .from('assessment_attempts')
      .insert({
        user_id: b.learner.id,
        dbd_record_id: b.recordId,
        kind: 'quiz',
        language: 'th',
        attempt_no: 1,
        question_ids: [],
        shuffle_seed: 'seed',
      })
      .select()
      .single();
    expect(attempt).not.toBeNull();

    const { data: assignmentsSeen } = await a.asManager
      .from('user_dbd_assignments')
      .select('user_id');
    expect((assignmentsSeen ?? []).map((r) => r.user_id)).not.toContain(b.learner.id);
    const { data: attemptsSeen } = await a.asManager.from('assessment_attempts').select('user_id');
    expect((attemptsSeen ?? []).map((r) => r.user_id)).not.toContain(b.learner.id);

    const { data: mine } = await b.asManager.from('assessment_attempts').select('user_id');
    expect((mine ?? []).map((r) => r.user_id)).toEqual([b.learner.id]);
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/team-isolation.test.ts`
Expected: FAIL — team B's manager sees no attempts of their own learner.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260923010600_team_policies_activity.sql`:

```sql
-- P15a: what a learner does is visible to their own manager and to the admin.

drop policy "assignments: admins do everything" on public.user_dbd_assignments;
create policy "assignments: admins and owning managers" on public.user_dbd_assignments
  for all to authenticated
  using (public.is_admin() or (public.is_manager() and public.in_my_team(user_id)))
  with check (public.is_admin() or (public.is_manager() and public.in_my_team(user_id)));

drop policy "eligibility: admins read" on public.eligibility_snapshots;
create policy "eligibility: admins and owning managers read" on public.eligibility_snapshots
  for select to authenticated
  using (public.is_admin() or (public.is_manager() and public.in_my_team(user_id)));

drop policy "attempts: admins read" on public.assessment_attempts;
create policy "attempts: admins and owning managers read" on public.assessment_attempts
  for select to authenticated
  using (public.is_admin() or (public.is_manager() and public.in_my_team(user_id)));

drop policy "answers: admins read" on public.assessment_answers;
create policy "answers: admins and owning managers read" on public.assessment_answers
  for select to authenticated
  using (
    public.is_admin() or (public.is_manager() and exists (
      select 1 from public.assessment_attempts t
      where t.id = assessment_answers.attempt_id and public.in_my_team(t.user_id)
    ))
  );

drop policy "progress: admins read" on public.study_progress;
create policy "progress: admins and owning managers read" on public.study_progress
  for select to authenticated
  using (public.is_admin() or (public.is_manager() and public.in_my_team(user_id)));

drop policy "calls: admins read" on public.call_sessions;
create policy "calls: admins and owning managers read" on public.call_sessions
  for select to authenticated
  using (public.is_admin() or (public.is_manager() and public.in_my_team(user_id)));

drop policy "name cards: admins read" on public.name_cards;
create policy "name cards: admins and owning managers read" on public.name_cards
  for select to authenticated
  using (public.is_admin() or (public.is_manager() and public.in_my_team(user_id)));

-- Recording and name-card objects are keyed by the learner''s id.
drop policy "recordings bucket: admins do everything" on storage.objects;
create policy "recordings bucket: admins and owning managers" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'recordings' and (
      public.is_admin()
      or (public.is_manager() and public.in_my_team(nullif(split_part(name, '/', 1), '')::uuid))
    )
  )
  with check (bucket_id = 'recordings' and public.is_admin());

drop policy "name cards bucket: admins do everything" on storage.objects;
create policy "name cards bucket: admins and owning managers" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'name-cards' and (
      public.is_admin()
      or (public.is_manager() and public.in_my_team(nullif(split_part(name, '/', 1), '')::uuid))
    )
  )
  with check (bucket_id = 'name-cards' and public.is_admin());
```

- [ ] **Step 4: Apply and run the test**

Run: `pnpm db:reset && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/team-isolation.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Run the learner-facing suites for regressions**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/assessment.test.ts tests/integration/isolation.test.ts tests/integration/calls.test.ts tests/integration/name-cards.test.ts`
Expected: PASS, unchanged counts.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260923010600_team_policies_activity.sql tests/integration/team-isolation.test.ts
git commit -m "feat(p15a): team-scoped policies for learner activity"
```

---

### Task 8: Shared content, and what stays admin-only

**Files:**

- Create: `supabase/migrations/20260923010700_staff_and_admin_policies.sql`
- Modify: `tests/integration/team-isolation.test.ts`

**Interfaces:**

- Consumes: `is_staff()` and `in_my_team(uuid)` from Task 4.
- Produces: `is_staff()` policies on the content tables and the study-files bucket; the audit log gains its team predicate; policy settings, notifications and webhooks stay admin-only.

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/team-isolation.test.ts`, after the isolation block:

```ts
describe('the shared library and the admin-only corners', () => {
  let team: Team;
  let admin: TestUser;
  let asAdmin: Client;

  beforeAll(async () => {
    team = await seedTeam('ซี');
    admin = await createTestUser('admin');
    asAdmin = await clientFor(admin);
  });

  afterAll(async () => {
    await svc.storage.from('dbd-documents').remove([team.documentPath]);
    await svc.from('dbd_records').delete().eq('id', team.recordId);
    await deleteTestUser(team.learner.id);
    await deleteTestUser(team.manager.id);
    await deleteTestUser(admin.id);
  });

  it('lets a manager author and approve in the shared question bank', async () => {
    const { data, error } = await team.asManager
      .from('questions')
      .insert({ question_key: `mgr-${Date.now()}`, kind: 'generic', approval_status: 'draft' })
      .select()
      .single();
    expect(error).toBeNull();
    const { error: approved } = await team.asManager
      .from('questions')
      .update({ approval_status: 'approved' })
      .eq('id', data!.id);
    expect(approved).toBeNull();
    await svc.from('questions').delete().eq('id', data!.id);
  });

  it('lets a manager author a study card', async () => {
    const { data, error } = await team.asManager
      .from('study_materials')
      .insert({ content_key: `mgr-${Date.now()}`, type: 'card' })
      .select()
      .single();
    expect(error).toBeNull();
    await svc.from('study_materials').delete().eq('id', data!.id);
  });

  it('keeps policy settings, notifications and webhooks for the admin alone', async () => {
    const { data: policy } = await team.asManager.from('policy_config').select('key');
    expect(policy ?? []).toEqual([]);
    const { data: notifications } = await team.asManager.from('notifications').select('id');
    expect(notifications ?? []).toEqual([]);
    const { data: adminPolicy } = await asAdmin.from('policy_config').select('key');
    expect((adminPolicy ?? []).length).toBeGreaterThan(0);
  });

  it('shows a manager only their own team actions in the audit log', async () => {
    await svc.from('audit_logs').insert([
      { actor_id: team.manager.id, action: 'test.mine', entity_type: 'test', entity_id: 'x' },
      { actor_id: admin.id, action: 'test.theirs', entity_type: 'test', entity_id: 'y' },
    ]);
    const { data } = await team.asManager.from('audit_logs').select('action').like('action', 'test.%');
    expect((data ?? []).map((r) => r.action)).toEqual(['test.mine']);
    await svc.from('audit_logs').delete().like('action', 'test.%');
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/team-isolation.test.ts`
Expected: FAIL — a manager cannot insert a question, because the content tables still admit admins only.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260923010700_staff_and_admin_policies.sql`:

```sql
-- P15a: one shared content library that managers help author (spec §4), while settings,
-- notifications and webhooks stay with the admin. The audit log shows a manager their own team.

drop policy "study: admins do everything" on public.study_materials;
create policy "study: staff do everything" on public.study_materials
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy "study loc: admins do everything" on public.study_material_localizations;
create policy "study loc: staff do everything" on public.study_material_localizations
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy "questions: admins do everything" on public.questions;
create policy "questions: staff do everything" on public.questions
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy "question loc: admins do everything" on public.question_localizations;
create policy "question loc: staff do everything" on public.question_localizations
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy "question batches: admins do everything" on public.question_generation_batches;
create policy "question batches: staff do everything" on public.question_generation_batches
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy "study files: admins do everything" on storage.objects;
create policy "study files: staff do everything" on storage.objects
  for all to authenticated
  using (bucket_id = 'study-files' and public.is_staff())
  with check (bucket_id = 'study-files' and public.is_staff());

-- A manager reads what their own team did; the admin reads everything.
drop policy "audit: admins read" on public.audit_logs;
create policy "audit: admins read all, managers read their team" on public.audit_logs
  for select to authenticated
  using (public.is_admin() or (public.is_manager() and public.in_my_team(actor_id)));
```

- [ ] **Step 4: Apply and run the test**

Run: `pnpm db:reset && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/team-isolation.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Run the content suites for regressions**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/study.test.ts tests/integration/questions.test.ts tests/integration/question-gen.test.ts`
Expected: PASS, unchanged counts.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260923010700_staff_and_admin_policies.sql tests/integration/team-isolation.test.ts
git commit -m "feat(p15a): shared content for staff, settings and audit for the admin"
```

---

### Task 9: Record the model and verify the whole branch

**Files:**

- Modify: `docs/decisions-log.md`
- Modify: `docs/superpowers/specs/2026-09-23-teams-and-roles-design.md` (status line)
- Modify: `docs/security-checklist.md`

**Interfaces:**

- Consumes: everything from Tasks 1–8.
- Produces: decisions D52–D56 in the log; the spec marked as in progress; a security-checklist row for team isolation.

- [ ] **Step 1: Run every suite**

Run: `pnpm exec vitest run --config vitest.config.ts && pnpm exec vitest run --config vitest.integration.config.ts && pnpm exec playwright test && pnpm lint && pnpm format:check && pnpm build && pnpm check:secrets`
Expected: all green; the e2e count is unchanged from before this plan, since no screen changed.

- [ ] **Step 2: Record the decisions**

Add these rows at the top of the table in `docs/decisions-log.md`:

```markdown
| 2026-09-23 | D52 | Three roles — `admin`, `manager`, `learner` — with a team as the unit of privacy: a manager owns the learners they create and the records they upload, an admin sees every team, and a record created by an admin belongs to no team | `supabase/migrations/20260923010000_manager_role.sql`, spec §3 |
| 2026-09-23 | D53 | Account codes are allocated from monotonic counters and never reused: managers are `T` + two padded digits, learners are the team code + `-` + two padded digits, both stored lower-case and displayed upper-case | `supabase/migrations/20260923010200_login_id_counters.sql` |
| 2026-09-23 | D54 | Study cards and the question bank are one shared library that managers author and approve (`is_staff()`), while company data stays private per team; D36's literal-value validator is what keeps company PII out of shared questions | `supabase/migrations/20260923010700_staff_and_admin_policies.sql` |
| 2026-09-23 | D55 | A departing manager is suspended, never cascaded: their learners keep signing in and studying, their records stay readable by the admin, and handing the team to a successor is a password reset plus a display-name change | spec §7 |
| 2026-09-23 | D56 | Authorization asks four questions in one place — `is_manager()`, `is_staff()`, `my_team()`, `in_my_team()` — so every team-scoped policy is one predicate and a future change happens once | `supabase/migrations/20260923010300_team_helpers.sql` |
```

- [ ] **Step 3: Mark the spec in progress**

In `docs/superpowers/specs/2026-09-23-teams-and-roles-design.md`, change the status line to:

```markdown
| Status | Stage 1 implemented (P15a); stages 2–3 (P15b, P15c) pending |
```

- [ ] **Step 4: Add the security-checklist row**

Append a row to the table in `docs/security-checklist.md`:

```markdown
| 19 | One manager cannot read or write another team's learners, records, documents, transcripts, attempts, calls, name cards or audit entries; storage keys are scoped by record and learner id, not merely hidden in the UI | ✅ | `tests/integration/team-isolation.test.ts`, `tests/integration/team-helpers.test.ts` |
```

- [ ] **Step 5: Verify formatting and commit**

Run: `pnpm exec prettier --write docs && pnpm format:check`
Expected: "All matched files use Prettier code style!"

```bash
git add docs/decisions-log.md docs/superpowers/specs/2026-09-23-teams-and-roles-design.md docs/security-checklist.md
git commit -m "docs(p15a): record the team model as D52-D56"
```

- [ ] **Step 6: Apply the migrations to staging before pushing**

Apply each of the eight P15a migrations (`20260923010000` through `20260923010700`) to the
staging Supabase project in file order, through the Supabase MCP `apply_migration`, then push:

```bash
git push origin main
```

Expected: `/api/health` reports the new short SHA; CI passes.
