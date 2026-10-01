# P17b — Training Versions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every learner studies and is evaluated on one immutable snapshot of their company's facts — a *training version* pinned to their assignment — that never changes underneath them and moves only when a person moves it (spec 2026-09-30 §5.6, §6, §7.2; decisions D74, D75).

**Architecture:** A confirmed record's fact sheet (P17a's `buildFactSheet`, plus the extras the old templates still read) is frozen into `company_training_versions` whenever it changes; a database trigger keeps active and superseded versions immutable and one version active per record. `user_dbd_assignments` pins a version and holds the learner's confirmed role as a snapshot; assignments never move on their own. Every reader that renders company facts for a learner — quiz and exam rendering, the D64 interview, study cards, the dashboard, the name card — reads the pinned snapshot; the record and user pages show which version is active, which one a learner is on, and offer the audited "Move to version n". Validation exceptions (P17c) and readiness gating (P17e) plug into the same rows later.

**Tech Stack:** Next.js 16 App Router, React 19 `useActionState`, next-intl (th/en/zh), Supabase Postgres with RLS + triggers, Vitest (unit, integration), Playwright.

**Branch:** `p17b/training-versions` from `main` at `801489c` (P17a merged). Same worktree `../portal-p17a`, same second local Supabase stack (project id `thailand-training-portal-p17a`, API 55321). Migration timestamp `20261002010000` (after P17a's `20261001030000`).

---

## Decisions taken in this plan — Owner: say if any is wrong

1. **Activation is not gated on completeness.** §5.6 gates version creation on *open blocking exceptions* (P17c), not on the 29/12 count; "complete at company scope" is a property. So P17b activates a new version whenever a confirmed record's sheet changes and records `company_complete`; readiness gating on it arrives with P17c/P17e. Consequence: today's quiz, exam and D64 interview keep working on a possibly incomplete version — exactly as they work on live facts today.
2. **The first pin is automatic; every later move is manual.** Assigning pins the record's active version; an assignment that has none yet (a record versioned later, or an assignment from before P17b) is pinned to the record's first version when it appears — created by the next save, or lazily on the learner's first read. D75's "never move automatically" applies to moving between versions.
3. **Learners read their own pinned version through RLS.** §6's read column names the Owner and the owning manager; the study page and the dashboard read under the learner's client, so a policy lets a learner read exactly the version their active assignment pins. (Alternative: service-role reads everywhere.)
4. **Role confirmation is explicit.** A staff member types the role as today, then presses *Confirm role*, which freezes `role_snapshot` (the four fields plus `learner_is_shareholder`, `my_shares`, `my_share_percent` derived against the pinned sheet) and sets `role_confirmed_at/by`. Editing the role afterwards unconfirms it and is refused while an evaluation is in progress. Assignment readiness (30/13) counts the confirmed role only. In P17b evaluations use the confirmed snapshot when present, otherwise the live role, as today.
5. **A move goes only to the record's current active version**, is refused while a quiz, exam or interview session is in progress, keeps a confirmed role but re-derives its shareholding against the new sheet, and is written under the mover's own client so the assignments audit trigger names them.
6. **The snapshot is the fact sheet plus `extras`**: certificate no., issue date, province, the printed address, objectives, promoters, par value, the four legacy answers, contact email and phone — what the old question templates, the D64 interview and the name card still read. Extras leave with P17i.
7. **A category change makes a new version** (`business_category` is in the sheet, §7.2); learners stay where they are.
8. **`assessment_attempts.training_version_id` is added now** (nullable) rather than in P17e, so an attempt knows the version it was rendered from.
9. **Fallbacks:** study cards, the dashboard and the name card fall back to live facts only while no version exists; starting a quiz, an exam or an interview refuses without one (`no_version`).

**Out of scope (later phases):** exceptions and validators (P17c), the new flow and readiness gates (P17e), removing the old quiz/exam/D64 paths (P17i), the learner-side "newer version" notice (readers are pinned; the record and user pages carry the notice, risk §12.4).

---

## File map

| File | Responsibility |
| --- | --- |
| `supabase/migrations/20261002010000_training_versions.sql` | `company_training_versions`, freeze trigger, RLS; the pin columns on `user_dbd_assignments`; `assessment_attempts.training_version_id` |
| `lib/domain/facts/snapshot.ts` | The snapshot shape (`facts` + `extras`), the role snapshot, `assignmentFacts`, `templateRecordFromSnapshot`, `templateRecordFromRecord` (moved from `lib/db/assessment.ts`), `canonicalJson` |
| `lib/db/training-versions.ts` | `snapshotHash`, `readSnapshot`, `getActiveVersion`, `getVersion`, `listVersions`, `syncTrainingVersion`, `syncAfterChange`, `countAssignmentsBehind` |
| `lib/db/pinning.ts` | `evaluationInProgress`, `confirmAssignmentRole`, `moveAssignmentToVersion`, `pinnedFactsFor`, `PinError` |
| `lib/db/assignments.ts` | `assignDbdRecord` pins; `updateAssignmentRole` unconfirms |
| `lib/db/assessment.ts`, `lib/db/interviews.ts`, `lib/db/name-cards.ts`, `app/[locale]/(learner)/study/[key]/page.tsx`, `app/[locale]/(learner)/dashboard/page.tsx` | Readers on the pinned snapshot |
| `app/[locale]/(admin)/admin/dbd-records/actions.ts`, `app/api/cron/index/route.ts`, `lib/db/auto-confirm.ts` | Sync after every change |
| `app/[locale]/(admin)/admin/dbd-records/[id]/training-versions-panel.tsx` | Record page: versions, completeness, learners behind |
| `app/[locale]/(admin)/admin/users/[id]/version-panel.tsx`, `.../actions.ts`, `.../page.tsx` | User page: pinned version, move, role confirmation, coverage from the snapshot |
| `messages/{th,en,zh}.json` | `admin.dbd.versions`, `admin.users.version`, the learner `noVersion` strings |
| Tests | `tests/integration/training-versions.db.test.ts`, `tests/integration/training-versions.test.ts`, `tests/integration/pinning.test.ts`, `tests/unit/domain/training-snapshot.test.ts`, `tests/e2e/training-versions.spec.ts` |

---

## Task 1: The versions table and the pin columns

**Files:**
- Create: `supabase/migrations/20261002010000_training_versions.sql`
- Modify: `lib/db/database.types.ts` (regenerated)
- Test: `tests/integration/training-versions.db.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/training-versions.db.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  anonClient,
  clientFor,
  confirmRecord,
  deleteTeam,
  seedTeam,
  type Team,
} from './helpers';

const svc = adminClient();

const SHEET = {
  facts: { company_name_th: 'บริษัท รุ่น จำกัด', juristic_id: '0105568233704' },
  extras: {},
  provenance: {},
  coverage: { mcq: { ready: 2, total: 29 }, interview: { ready: 2, total: 12 }, missingFacts: [] },
  company_complete: false,
  facts_hash: 'h1',
  source_updated_at: new Date().toISOString(),
};

async function insertVersion(recordId: string, patch: Record<string, unknown>) {
  return svc
    .from('company_training_versions')
    .insert({ ...SHEET, dbd_record_id: recordId, ...patch } as never)
    .select('id, version_no, status')
    .single();
}

/** The version table's own rules (spec §5.6, D75): frozen once active, one active per record. */
describe('company_training_versions', () => {
  let team: Team;
  let other: Team;
  let v1: string;
  beforeAll(async () => {
    [team, other] = await Promise.all([seedTeam('รุ่น'), seedTeam('ทีมอื่น')]);
    await confirmRecord(team.recordId, team.manager.id);
  });
  afterAll(async () => {
    await svc.from('user_dbd_assignments').delete().eq('dbd_record_id', team.recordId);
    await svc.from('company_training_versions').delete().eq('dbd_record_id', team.recordId);
    await Promise.all([deleteTeam(team), deleteTeam(other)]);
  });

  it('activates a draft, and then keeps its sheet frozen', async () => {
    const { data, error } = await insertVersion(team.recordId, { version_no: 1 });
    if (error) throw error;
    v1 = data.id;
    const activate = await svc
      .from('company_training_versions')
      .update({ status: 'active', activated_at: new Date().toISOString() })
      .eq('id', v1);
    expect(activate.error).toBeNull();
    const edit = await svc
      .from('company_training_versions')
      .update({ facts_hash: 'h2' } as never)
      .eq('id', v1);
    expect(edit.error?.code).toBe('23514');
    const back = await svc.from('company_training_versions').update({ status: 'draft' }).eq('id', v1);
    expect(back.error?.code).toBe('23514');
  });

  it('allows one active version per record, and no way back from superseded', async () => {
    const second = await insertVersion(team.recordId, {
      version_no: 2,
      status: 'active',
      activated_at: new Date().toISOString(),
    });
    expect(second.error?.code).toBe('23505');
    const supersede = await svc
      .from('company_training_versions')
      .update({ status: 'superseded', superseded_at: new Date().toISOString() })
      .eq('id', v1);
    expect(supersede.error).toBeNull();
    const revive = await svc
      .from('company_training_versions')
      .update({ status: 'active' })
      .eq('id', v1);
    expect(revive.error?.code).toBe('23514');
  });

  it('refuses an active version without an activation time', async () => {
    const { error } = await insertVersion(team.recordId, { version_no: 3, status: 'active' });
    expect(error?.code).toBe('23514');
  });

  it('pins an assignment only to a version of its own record', async () => {
    const { data: v2, error } = await insertVersion(team.recordId, {
      version_no: 4,
      status: 'active',
      activated_at: new Date().toISOString(),
      company_complete: true,
    });
    if (error) throw error;
    const { data: a, error: aError } = await svc
      .from('user_dbd_assignments')
      .insert({
        user_id: team.learner.id,
        dbd_record_id: team.recordId,
        training_version_id: v2.id,
      })
      .select('id')
      .single();
    if (aError) throw aError;
    const { data: foreign } = await insertVersion(other.recordId, { version_no: 1 });
    const wrong = await svc
      .from('user_dbd_assignments')
      .update({ training_version_id: foreign!.id })
      .eq('id', a.id);
    expect(wrong.error?.code).toBe('23514');
    // A confirmed role is a snapshot with a date, or nothing.
    const half = await svc
      .from('user_dbd_assignments')
      .update({ role_snapshot: { holder_name: 'x' } as never })
      .eq('id', a.id);
    expect(half.error?.code).toBe('23514');
  });

  it('is read by the Owner, the owning manager and the pinned learner; written by nobody signed in', async () => {
    const mine = await team.asManager
      .from('company_training_versions')
      .select('id')
      .eq('dbd_record_id', team.recordId);
    expect(mine.data!.length).toBeGreaterThan(0);
    const theirs = await other.asManager
      .from('company_training_versions')
      .select('id')
      .eq('dbd_record_id', team.recordId);
    expect(theirs.data).toEqual([]);
    const asLearner = await clientFor(team.learner);
    const pinned = await asLearner.from('company_training_versions').select('version_no');
    expect(pinned.data).toEqual([{ version_no: 4 }]);
    const unpinnedLearner = await (await clientFor(other.learner))
      .from('company_training_versions')
      .select('id');
    expect(unpinnedLearner.data).toEqual([]);
    expect((await anonClient().from('company_training_versions').select('id')).data).toEqual([]);
    const write = await team.asManager
      .from('company_training_versions')
      .insert({ ...SHEET, dbd_record_id: team.recordId, version_no: 9 } as never);
    expect(write.error?.code).toBe('42501');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/training-versions.db.test.ts`
Expected: FAIL — `company_training_versions` does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20261002010000_training_versions.sql
-- P17b: immutable training versions (spec 2026-09-30 §5.6, §6; decisions D74, D75). A version is
-- the fact sheet of a confirmed record, frozen once active; an assignment pins one and never
-- moves by itself. Written by the service role after checks in code (the audit trigger keeps
-- the history); read by the Owner, the owning manager and the learner it is pinned to.

create table public.company_training_versions (
  id uuid primary key default gen_random_uuid(),
  dbd_record_id uuid not null references public.dbd_records (id) on delete cascade,
  version_no integer not null check (version_no >= 1),
  status text not null default 'draft' check (status in ('draft', 'active', 'superseded')),
  -- The company-scope fact sheet (lib/domain/facts/fact-sheet.ts) and what the old templates
  -- still read beside it (lib/domain/facts/snapshot.ts).
  facts jsonb not null,
  extras jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  coverage jsonb not null,
  company_complete boolean not null default false,
  facts_hash text not null,
  source_updated_at timestamptz not null,
  created_by uuid references public.profiles (id) on delete set null,
  activated_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dbd_record_id, version_no),
  -- Activation is not gated on completeness (plan decision 1); it is gated on exceptions from P17c.
  check (status <> 'active' or activated_at is not null),
  check (status <> 'superseded' or (activated_at is not null and superseded_at is not null))
);

create unique index company_training_versions_one_active
  on public.company_training_versions (dbd_record_id) where status = 'active';
create unique index company_training_versions_one_draft
  on public.company_training_versions (dbd_record_id) where status = 'draft';
create index company_training_versions_record_idx
  on public.company_training_versions (dbd_record_id, version_no desc);

-- Frozen once active (D75): the sheet of an active or superseded version never changes, and the
-- only moves are draft → active and active → superseded.
create or replace function public.training_version_freeze()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('active', 'superseded') then
    if new.facts is distinct from old.facts
       or new.extras is distinct from old.extras
       or new.provenance is distinct from old.provenance
       or new.coverage is distinct from old.coverage
       or new.company_complete is distinct from old.company_complete
       or new.facts_hash is distinct from old.facts_hash
       or new.version_no is distinct from old.version_no
       or new.dbd_record_id is distinct from old.dbd_record_id
       or new.activated_at is distinct from old.activated_at then
      raise exception 'training version % is frozen', old.id using errcode = 'check_violation';
    end if;
    if old.status = 'superseded' and new.status is distinct from 'superseded' then
      raise exception 'a superseded training version stays superseded'
        using errcode = 'check_violation';
    end if;
    if old.status = 'active' and new.status not in ('active', 'superseded') then
      raise exception 'an active training version can only be superseded'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.training_version_freeze() from public, anon, authenticated;

create trigger company_training_versions_freeze
  before update on public.company_training_versions
  for each row execute function public.training_version_freeze();
create trigger company_training_versions_set_updated_at
  before update on public.company_training_versions
  for each row execute function public.set_updated_at();
create trigger company_training_versions_audit
  after insert or update or delete on public.company_training_versions
  for each row execute function public.audit_row_change();

alter table public.company_training_versions enable row level security;

create policy "training versions: admins and owning managers read"
  on public.company_training_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.dbd_records r
      where r.id = dbd_record_id
        and (public.is_admin() or (public.is_manager() and r.team_id = public.my_team()))
    )
  );

-- The pin (§5.6): which version an assignment studies and is evaluated on, and the learner's
-- role as confirmed against it (plan decision 4).
alter table public.user_dbd_assignments
  add column training_version_id uuid references public.company_training_versions (id),
  add column role_snapshot jsonb,
  add column role_confirmed_at timestamptz,
  add column role_confirmed_by uuid references public.profiles (id) on delete set null,
  add constraint user_dbd_assignments_role_confirmed
    check ((role_snapshot is null) = (role_confirmed_at is null));
create index user_dbd_assignments_version_idx
  on public.user_dbd_assignments (training_version_id);

-- The learner reads exactly the version their active assignment pins (plan decision 3).
create policy "training versions: learners read their pinned version"
  on public.company_training_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.user_dbd_assignments a
      where a.training_version_id = company_training_versions.id
        and a.user_id = auth.uid()
        and a.active
    )
  );

-- A pin points at a version of the assignment's own record.
create or replace function public.assignment_version_matches()
returns trigger
language plpgsql
as $$
begin
  if new.training_version_id is not null and not exists (
    select 1 from public.company_training_versions v
    where v.id = new.training_version_id and v.dbd_record_id = new.dbd_record_id
  ) then
    raise exception 'training version % is not a version of record %',
      new.training_version_id, new.dbd_record_id using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.assignment_version_matches() from public, anon, authenticated;
create trigger user_dbd_assignments_version_check
  before insert or update of training_version_id, dbd_record_id on public.user_dbd_assignments
  for each row execute function public.assignment_version_matches();

-- Results count against a version (D75): an attempt remembers the one it was rendered from.
alter table public.assessment_attempts
  add column training_version_id uuid
    references public.company_training_versions (id) on delete set null;
```

- [ ] **Step 4: Apply, regenerate types, run the test**

Run: `pnpm db:reset && pnpm db:types && pnpm exec prettier --write lib/db/database.types.ts && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/training-versions.db.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261002010000_training_versions.sql lib/db/database.types.ts tests/integration/training-versions.db.test.ts
git commit -m "feat(versions): immutable training versions and the assignment pin (P17b, D75)"
```

---

## Task 2: The snapshot — what a version holds

**Files:**
- Create: `lib/domain/facts/snapshot.ts`
- Modify: `lib/db/assessment.ts` (`toTemplateRecord` moves to the domain and is re-exported)
- Test: `tests/unit/domain/training-snapshot.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/domain/training-snapshot.test.ts
import { describe, expect, it } from 'vitest';
import { EMPTY_INTERVIEW_PROFILE } from '@/lib/domain/bank-interview';
import { EMPTY_BUSINESS_PROFILE } from '@/lib/domain/dbd-profile';
import {
  assignmentFacts,
  buildRoleSnapshot,
  buildTrainingSnapshot,
  canonicalJson,
  templateRecordFromRecord,
  templateRecordFromSnapshot,
} from '@/lib/domain/facts/snapshot';

const record = {
  company_name_th: 'บริษัท ซินเนอร์จี แล็บ จำกัด',
  company_name_en: 'SYNERGY LAB CO., LTD.',
  juristic_id: '0455569000808',
  certificate_no: 'C-1',
  registered_on: '2026-04-16',
  issued_on: '2026-08-05',
  registered_capital: 2_000_000,
  head_office_address: 'เลขที่ 87 หมู่ที่ 9 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด',
  province: 'ร้อยเอ็ด',
  objectives_count: 3,
  directors: [{ name_th: 'นางสาวกุลธิดา พลเยี่ยม', name_en: null }],
  signing_authority: 'กรรมการหนึ่งคนลงลายมือชื่อ',
  structured_data: null,
};
const structured = {
  business: {
    ...EMPTY_BUSINESS_PROFILE,
    objectives: [{ no: 1, text: 'ค้าเสื้อผ้า' }],
    shareholders: [
      { name: 'นางสาวกุลธิดา พลเยี่ยม', nationality: null, shares: 18_000, percent: null },
      { name: 'นายสมชาย ใจดี', nationality: null, shares: 2_000, percent: null },
    ],
    share_structure: { total_shares: 20_000, par_value: 100, paid_up_capital: null, share_type: null },
  },
  interview: {
    ...EMPTY_INTERVIEW_PROFILE,
    contact_email: 'info@synergy.co.th',
    nature_of_business: 'ค้าส่งเสื้อผ้า',
    monthly_volume: '300,000',
    has_existing_customers: 'yes' as const,
  },
  category: {
    key: 'clothing_fashion',
    candidate_key: null,
    confidence: 0.95,
    source: 'auto' as const,
    status: 'mapped' as const,
    model: null,
    input_hash: 'h',
    error: null,
    decided_at: null,
  },
  provenance: {},
};
const role = {
  holder_name: 'นางสาวกุลธิดา พลเยี่ยม',
  position: 'กรรมการ',
  responsibilities: 'ดูแลลูกค้า',
  relationship_to_shareholders: 'พี่น้อง',
};

describe('the training snapshot (spec §5.6, §7.2)', () => {
  it('freezes the company fact sheet and the extras the old templates read', () => {
    const s = buildTrainingSnapshot({ record, structured, address: null });
    expect(s.facts).toMatchObject({
      company_name_th: record.company_name_th,
      director_count: 1,
      shareholder_count: 2,
      business_category: 'clothing_fashion',
      has_existing_customers: true,
      holder_name: null,
      learner_is_shareholder: null,
    });
    expect(s.extras).toMatchObject({
      certificate_no: 'C-1',
      issued_on: '2026-08-05',
      province: 'ร้อยเอ็ด',
      head_office_address: record.head_office_address,
      contact_email: 'info@synergy.co.th',
      monthly_volume: '300,000',
      par_value: 100,
    });
  });

  it('derives the learner’s shareholding against the frozen sheet', () => {
    const s = buildTrainingSnapshot({ record, structured, address: null });
    expect(buildRoleSnapshot(role, s)).toEqual({
      ...role,
      learner_is_shareholder: true,
      my_shares: 18_000,
      my_share_percent: 90,
    });
    expect(buildRoleSnapshot({ ...role, holder_name: 'นายภายนอก' }, s)).toMatchObject({
      learner_is_shareholder: false,
      my_shares: null,
    });
    expect(assignmentFacts(s, buildRoleSnapshot(role, s))).toMatchObject({
      holder_name: role.holder_name,
      position: 'กรรมการ',
      learner_is_shareholder: true,
      my_share_percent: 90,
    });
  });

  it('renders the same template record from the snapshot as from the live record', () => {
    const s = buildTrainingSnapshot({ record, structured, address: null });
    expect(templateRecordFromSnapshot(s, buildRoleSnapshot(role, s))).toEqual(
      templateRecordFromRecord({ ...record, structured_data: structured }, role),
    );
    expect(templateRecordFromSnapshot(s, null)).toEqual(
      templateRecordFromRecord({ ...record, structured_data: structured }, null),
    );
  });

  it('hashes independently of key order', () => {
    expect(canonicalJson({ b: [1, { z: 1, a: 2 }], a: null })).toBe(
      canonicalJson({ a: null, b: [1, { a: 2, z: 1 }] }),
    );
    expect(canonicalJson({ a: undefined })).toBe('{"a":null}');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/training-snapshot.test.ts`
Expected: FAIL — cannot resolve `@/lib/domain/facts/snapshot`.

- [ ] **Step 3: Write the module**

```ts
// lib/domain/facts/snapshot.ts
import type { TemplateRecord } from '@/lib/domain/assessment/template';
import {
  EMPTY_INTERVIEW_PROFILE,
  isShareholder,
  myShareholding,
  type LearnerRole,
} from '@/lib/domain/bank-interview';
import {
  EMPTY_BUSINESS_PROFILE,
  readStructuredData,
  type Objective,
  type Promoter,
  type StructuredData,
} from '@/lib/domain/dbd-profile';
import type { Director } from '@/lib/domain/dbd-record';
import type { RegisteredAddress } from '@/lib/domain/geo/resolve';
import { buildFactSheet, type FactSheet, type RecordColumns } from './fact-sheet';

/** The record columns a snapshot reads beyond the fact sheet's. */
export type SnapshotRecordColumns = RecordColumns & {
  certificate_no: string | null;
  issued_on: string | null;
  objectives_count: number | null;
  province: string | null;
  head_office_address: string | null;
};

/**
 * What the old question templates, the D64 interview and the name card read beside the fact
 * sheet (plan decision 6). Frozen with it so every reader is pinned; retired with P17i.
 */
export type TrainingExtras = {
  certificate_no: string | null;
  issued_on: string | null;
  objectives_count: number | null;
  province: string | null;
  head_office_address: string | null;
  objectives: Objective[];
  business_categories: string[];
  promoters: Promoter[];
  par_value: number | null;
  monthly_volume: string | null;
  clients_location: string | null;
  suppliers_location: string | null;
  operations_status: string | null;
  contact_email: string | null;
  contact_phone: string | null;
};

/** A training version's content (spec §5.6): the company-scope sheet and the extras. */
export type TrainingSnapshot = { facts: FactSheet; extras: TrainingExtras };

/** The learner's role as confirmed against a version (spec §5.6; plan decision 4). */
export type RoleSnapshot = LearnerRole & {
  learner_is_shareholder: boolean | null;
  my_shares: number | null;
  my_share_percent: number | null;
};

export function buildTrainingSnapshot(input: {
  record: SnapshotRecordColumns;
  structured: StructuredData;
  address: RegisteredAddress | null;
}): TrainingSnapshot {
  const business = input.structured.business ?? EMPTY_BUSINESS_PROFILE;
  const interview = input.structured.interview ?? EMPTY_INTERVIEW_PROFILE;
  return {
    facts: buildFactSheet({
      record: input.record,
      structured: input.structured,
      address: input.address,
      role: null,
    }),
    extras: {
      certificate_no: input.record.certificate_no,
      issued_on: input.record.issued_on,
      objectives_count: input.record.objectives_count,
      province: input.record.province,
      head_office_address: input.record.head_office_address,
      objectives: business.objectives,
      business_categories: business.business_categories,
      promoters: business.promoters,
      par_value: business.share_structure.par_value,
      monthly_volume: interview.monthly_volume,
      clients_location: interview.clients_location,
      suppliers_location: interview.suppliers_location,
      operations_status: interview.operations_status,
      contact_email: interview.contact_email,
      contact_phone: interview.contact_phone,
    },
  };
}

/** The shareholder list as `myShareholding` wants it, from the frozen sheet. */
function businessOf(snapshot: TrainingSnapshot) {
  return {
    ...EMPTY_BUSINESS_PROFILE,
    shareholders: snapshot.facts.shareholders,
    share_structure: {
      ...EMPTY_BUSINESS_PROFILE.share_structure,
      total_shares: snapshot.facts.total_shares,
    },
  };
}

export function buildRoleSnapshot(role: LearnerRole, snapshot: TrainingSnapshot): RoleSnapshot {
  const business = businessOf(snapshot);
  const holder = role.holder_name?.trim() || null;
  const mine = myShareholding(business, holder);
  return {
    holder_name: holder,
    position: role.position,
    responsibilities: role.responsibilities,
    relationship_to_shareholders: role.relationship_to_shareholders,
    learner_is_shareholder: isShareholder(business, holder),
    my_shares: mine.shares,
    my_share_percent: mine.percent,
  };
}

/** The assignment-scope fact sheet (spec §7.3): the frozen company sheet plus the role. */
export function assignmentFacts(snapshot: TrainingSnapshot, role: RoleSnapshot | null): FactSheet {
  return {
    ...snapshot.facts,
    holder_name: role?.holder_name ?? null,
    position: role?.position ?? null,
    learner_is_shareholder: role?.learner_is_shareholder ?? null,
    my_shares: role?.my_shares ?? null,
    my_share_percent: role?.my_share_percent ?? null,
  };
}

/** The old templates' record, read from a version instead of the live row (§11). */
export function templateRecordFromSnapshot(
  snapshot: TrainingSnapshot,
  role: RoleSnapshot | null,
): TemplateRecord {
  const f = snapshot.facts;
  const x = snapshot.extras;
  return {
    company_name_th: f.company_name_th,
    company_name_en: f.company_name_en,
    juristic_id: f.juristic_id,
    certificate_no: x.certificate_no,
    registered_capital: f.registered_capital,
    head_office_address: x.head_office_address,
    registered_on: f.registered_on,
    issued_on: x.issued_on,
    directors: f.directors.length ? f.directors : null,
    objectives_count: x.objectives_count,
    signing_authority: f.signing_authority,
    province: x.province,
    objectives: x.objectives.length ? x.objectives : null,
    business_categories: x.business_categories.length ? x.business_categories : null,
    shareholders: f.shareholders.length ? f.shareholders : null,
    promoters: x.promoters.length ? x.promoters : null,
    total_shares: f.total_shares,
    par_value: x.par_value,
    directors_count: f.director_count,
    shareholders_count: f.shareholder_count,
    nature_of_business: f.nature_of_business,
    products_services: f.products_services,
    account_purpose: f.account_purpose,
    monthly_volume: x.monthly_volume,
    clients_location: x.clients_location,
    suppliers_location: x.suppliers_location,
    source_of_funds: f.source_of_funds,
    business_address: f.business_address,
    operations_status: x.operations_status,
    my_name: role?.holder_name ?? null,
    my_position: role?.position ?? null,
    my_responsibilities: role?.responsibilities ?? null,
    my_relationship: role?.relationship_to_shareholders ?? null,
    my_shares: role?.my_shares ?? null,
    my_share_percent: role?.my_share_percent ?? null,
  };
}

/**
 * The templates' record from the live row (moved here from lib/db/assessment.ts, unchanged in
 * behaviour). Kept for readers that have no version yet (plan decision 9); superseded by the
 * snapshot everywhere else (§11).
 */
export function templateRecordFromRecord(
  record: SnapshotRecordColumns & { structured_data: unknown },
  role: LearnerRole | null = null,
): TemplateRecord {
  const structured = readStructuredData(record.structured_data);
  const business = structured.business ?? EMPTY_BUSINESS_PROFILE;
  const interview = structured.interview ?? EMPTY_INTERVIEW_PROFILE;
  const directors = (record.directors as Director[] | null) ?? null;
  const mine = myShareholding(business, role?.holder_name ?? null);
  return {
    company_name_th: record.company_name_th,
    company_name_en: record.company_name_en,
    juristic_id: record.juristic_id,
    certificate_no: record.certificate_no,
    registered_capital: record.registered_capital,
    head_office_address: record.head_office_address,
    registered_on: record.registered_on,
    issued_on: record.issued_on,
    directors,
    objectives_count: record.objectives_count,
    signing_authority: record.signing_authority,
    province: record.province,
    objectives: business.objectives.length ? business.objectives : null,
    business_categories: business.business_categories.length ? business.business_categories : null,
    shareholders: business.shareholders.length ? business.shareholders : null,
    promoters: business.promoters.length ? business.promoters : null,
    total_shares: business.share_structure.total_shares,
    par_value: business.share_structure.par_value,
    directors_count: directors && directors.length > 0 ? directors.length : null,
    shareholders_count: business.shareholders.length > 0 ? business.shareholders.length : null,
    nature_of_business: interview.nature_of_business,
    products_services: interview.products_services,
    account_purpose: interview.account_purpose,
    monthly_volume: interview.monthly_volume,
    clients_location: interview.clients_location,
    suppliers_location: interview.suppliers_location,
    source_of_funds: interview.source_of_funds,
    business_address: interview.business_address,
    operations_status: interview.operations_status,
    my_name: role?.holder_name ?? null,
    my_position: role?.position ?? null,
    my_responsibilities: role?.responsibilities ?? null,
    my_relationship: role?.relationship_to_shareholders ?? null,
    my_shares: mine.shares,
    my_share_percent: mine.percent,
  };
}

/** JSON with keys sorted at every level, so equal content hashes equal. */
export function canonicalJson(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (v === undefined) return null;
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => [k, norm((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(norm(value));
}
```

Note: `templateRecordFromRecord` keeps `toTemplateRecord`'s exact behaviour (untrimmed `my_name`, `directors` as stored); the parity test uses clean names so the snapshot path (trimmed holder, `directors` from the sheet) renders the same. `FactSheet.registered_on` is a `string`, as is `ISODate`.

- [ ] **Step 4: Point `lib/db/assessment.ts` at it**

Replace the `toTemplateRecord` function (from `export function toTemplateRecord(` to its closing `}`) with:

```ts
/** The old templates' record from the live row (moved to the domain in P17b, §11). */
import { templateRecordFromRecord as toTemplateRecord } from '@/lib/domain/facts/snapshot';
export { toTemplateRecord };
```

and prune the imports it alone used: remove `myShareholding`, `EMPTY_INTERVIEW_PROFILE` and `LearnerRole` from the `@/lib/domain/bank-interview` import (keep the import only if something else in the file still uses a name from it — `pnpm lint` reports what is unused), remove `EMPTY_BUSINESS_PROFILE` and `readStructuredData` from `@/lib/domain/dbd-profile`, and `import type { Director }` — each only if no other use remains in the file.

- [ ] **Step 5: Run the tests and the checks**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/training-snapshot.test.ts && pnpm typecheck && pnpm lint`
Expected: 4 passed; clean.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/facts/snapshot.ts lib/db/assessment.ts tests/unit/domain/training-snapshot.test.ts
git commit -m "feat(versions): the training snapshot — fact sheet, extras and the role snapshot (P17b)"
```

---

## Task 3: Creating and superseding versions

**Files:**
- Create: `lib/db/training-versions.ts`
- Modify: `tests/integration/helpers.ts` (a complete-sheet fixture)
- Test: `tests/integration/training-versions.test.ts`

- [ ] **Step 1: Add the complete-sheet fixture to `tests/integration/helpers.ts`**

Append after `CONFIRMED_ANSWERS`:

```ts
/** Every company-level concept resolvable (29 / 12): the record columns and the structured data. */
export const COMPLETE_RECORD = {
  company_name_th: 'บริษัท ครบถ้วน จำกัด',
  company_name_en: 'COMPLETE CO., LTD.',
  registered_on: '2026-04-16',
  registered_capital: 2_000_000,
  directors: [{ name_th: 'นางสาวกุลธิดา พลเยี่ยม', name_en: null }],
  signing_authority: 'กรรมการหนึ่งคนลงลายมือชื่อและประทับตราสำคัญของบริษัท',
  head_office_address: 'เลขที่ 87 หมู่ที่ 9 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด',
} as const;

export const COMPLETE_STRUCTURED = {
  business: {
    shareholders: [
      { name: 'นางสาวกุลธิดา พลเยี่ยม', nationality: 'ไทย', shares: 18000, percent: null },
      { name: 'นายสมชาย ใจดี', nationality: 'ไทย', shares: 2000, percent: null },
    ],
    share_structure: { total_shares: 20000, par_value: 100, paid_up_capital: null, share_type: null },
  },
  interview: {
    ...CONFIRMED_ANSWERS.interview,
    nature_of_business: 'ค้าส่งและค้าปลีกเสื้อผ้า',
    products_services: 'ชุดเดรส เสื้อ กระโปรงสตรี',
    business_purpose: 'จำหน่ายเสื้อผ้าสตรีในภาคอีสาน',
    main_clients: 'ร้านค้าปลีกเสื้อผ้า',
    client_origin: 'หน้าร้านและออนไลน์',
    main_suppliers: 'โรงงานตัดเย็บในกรุงเทพฯ',
    business_address: 'ร้อยเอ็ด',
    monthly_revenue: '300,000 บาท',
    revenue_basis: 'ลูกค้า 30 ราย เฉลี่ย 10,000 บาท',
    average_transaction: '10,000 บาท',
    monthly_transactions: '30',
    source_of_funds: 'เงินออมของกรรมการ',
    first_incoming_funds: 'ทุนจดทะเบียนจากผู้ถือหุ้น',
    account_purpose: 'รับชำระค่าสินค้า',
    promptpay_qr_purpose: 'ให้ลูกค้าชำระเงินสะดวก',
    customer_examples: 'ร้านบุษบา ร้อยเอ็ด',
    customer_profile: 'ร้านค้าปลีกในประเทศ',
    transaction_details: 'โอนผ่านบัญชีบริษัท',
    operations_started: 'yes',
    has_existing_customers: 'yes',
    has_completed_transactions: 'yes',
    has_regular_suppliers: 'yes',
  },
} as const;

/** Makes a confirmed record's sheet complete at company scope (spec §5.6). */
export async function completeRecord(recordId: string): Promise<void> {
  const { error } = await adminClient()
    .from('dbd_records')
    .update({ ...COMPLETE_RECORD, structured_data: COMPLETE_STRUCTURED } as never)
    .eq('id', recordId);
  if (error) throw error;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/integration/training-versions.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assignDbdRecord } from '@/lib/db/assignments';
import {
  getActiveVersion,
  listVersions,
  readSnapshot,
  syncTrainingVersion,
} from '@/lib/db/training-versions';
import {
  adminClient,
  completeRecord,
  confirmRecord,
  deleteTeam,
  seedTeam,
  type Team,
} from './helpers';

const svc = adminClient();

async function assignment(userId: string) {
  const { data } = await svc
    .from('user_dbd_assignments')
    .select('training_version_id')
    .eq('user_id', userId)
    .eq('active', true)
    .single();
  return data!;
}

describe('syncTrainingVersion (spec §5.6, D75)', () => {
  let team: Team;
  beforeAll(async () => {
    team = await seedTeam('รุ่นข้อมูล');
  });
  afterAll(async () => {
    await svc.from('user_dbd_assignments').delete().eq('dbd_record_id', team.recordId);
    await svc.from('company_training_versions').delete().eq('dbd_record_id', team.recordId);
    await deleteTeam(team);
  });

  it('versions nothing before the record is confirmed', async () => {
    expect(await syncTrainingVersion(svc, team.recordId, null)).toBe('unconfirmed');
    expect(await listVersions(svc, team.recordId)).toEqual([]);
  });

  it('activates version 1 on confirmation, incomplete but usable, and pins the waiting learner', async () => {
    await assignDbdRecord(svc, { userId: team.learner.id, dbdRecordId: team.recordId }).catch(
      () => null,
    );
    await confirmRecord(team.recordId, team.manager.id);
    await assignDbdRecord(svc, { userId: team.learner.id, dbdRecordId: team.recordId });
    expect((await assignment(team.learner.id)).training_version_id).toBeNull();
    expect(await syncTrainingVersion(svc, team.recordId, team.manager.id)).toBe('activated');
    const v1 = await getActiveVersion(svc, team.recordId);
    expect(v1).toMatchObject({ version_no: 1, status: 'active', company_complete: false });
    expect((v1!.coverage as { missingFacts: string[] }).missingFacts).toContain('registered_on');
    expect(readSnapshot(v1!).facts.nature_of_business).toBe('ทดสอบระบบ');
    expect((await assignment(team.learner.id)).training_version_id).toBe(v1!.id);
  });

  it('does nothing when the sheet is unchanged', async () => {
    expect(await syncTrainingVersion(svc, team.recordId, null)).toBe('unchanged');
    expect(await listVersions(svc, team.recordId)).toHaveLength(1);
  });

  it('supersedes with version 2 when a fact changes, and leaves the learner on 1', async () => {
    await completeRecord(team.recordId);
    expect(await syncTrainingVersion(svc, team.recordId, null)).toBe('activated');
    const versions = await listVersions(svc, team.recordId);
    expect(versions.map((v) => [v.version_no, v.status])).toEqual([
      [2, 'active'],
      [1, 'superseded'],
    ]);
    expect(versions[0]).toMatchObject({ company_complete: true });
    expect(versions[1]!.superseded_at).not.toBeNull();
    expect((await assignment(team.learner.id)).training_version_id).toBe(versions[1]!.id);
  });

  it('keeps the frozen sheet when the record moves on again', async () => {
    const before = readSnapshot((await getActiveVersion(svc, team.recordId))!);
    await svc
      .from('dbd_records')
      .update({ registered_capital: 3_000_000 })
      .eq('id', team.recordId);
    await syncTrainingVersion(svc, team.recordId, null);
    const versions = await listVersions(svc, team.recordId);
    expect(versions[0]!.version_no).toBe(3);
    expect(readSnapshot(versions[1]!).facts.registered_capital).toBe(
      before.facts.registered_capital,
    );
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/training-versions.test.ts`
Expected: FAIL — cannot resolve `@/lib/db/training-versions`.

- [ ] **Step 4: Write the module**

```ts
// lib/db/training-versions.ts
import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { conceptCoverage, type Coverage } from '@/lib/domain/concepts/resolve';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import type { FactSheet } from '@/lib/domain/facts/fact-sheet';
import {
  buildTrainingSnapshot,
  canonicalJson,
  type TrainingExtras,
  type TrainingSnapshot,
} from '@/lib/domain/facts/snapshot';
import { createSupabaseAdminClient } from './admin';
import type { Database, Json } from './database.types';
import { getDbdRecord } from './dbd-records';
import { currentAddress } from './derived-facts';

type Db = SupabaseClient<Database>;
export type TrainingVersionRow = Database['public']['Tables']['company_training_versions']['Row'];

/** What a version records about its own readiness (spec §5.6): company scope, at freeze time. */
export type VersionCoverage = Pick<Coverage, 'mcq' | 'interview' | 'missingFacts'>;

export type SyncResult = 'not_found' | 'unconfirmed' | 'unchanged' | 'activated';

/** Content identity of a sheet: the facts and the extras, never the provenance. */
export function snapshotHash(snapshot: TrainingSnapshot): string {
  return createHash('sha256').update(canonicalJson(snapshot)).digest('hex').slice(0, 32);
}

/** A stored version's content. Written only by `syncTrainingVersion`, so the shape is trusted. */
export function readSnapshot(row: Pick<TrainingVersionRow, 'facts' | 'extras'>): TrainingSnapshot {
  if (!row.facts || typeof row.facts !== 'object' || !('company_name_th' in row.facts)) {
    throw new Error('training version without a fact sheet');
  }
  return {
    facts: row.facts as unknown as FactSheet,
    extras: (row.extras ?? {}) as unknown as TrainingExtras,
  };
}

export function versionCoverage(row: Pick<TrainingVersionRow, 'coverage'>): VersionCoverage {
  return row.coverage as unknown as VersionCoverage;
}

export async function getActiveVersion(
  db: Db,
  recordId: string,
): Promise<TrainingVersionRow | null> {
  const { data, error } = await db
    .from('company_training_versions')
    .select('*')
    .eq('dbd_record_id', recordId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getVersion(db: Db, versionId: string): Promise<TrainingVersionRow | null> {
  const { data, error } = await db
    .from('company_training_versions')
    .select('*')
    .eq('id', versionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Newest first. */
export async function listVersions(db: Db, recordId: string): Promise<TrainingVersionRow[]> {
  const { data, error } = await db
    .from('company_training_versions')
    .select('*')
    .eq('dbd_record_id', recordId)
    .order('version_no', { ascending: false });
  if (error) throw error;
  return data;
}

/** Active assignments of the record that are not on its active version (risk §12.4). */
export async function countAssignmentsBehind(
  db: Db,
  recordId: string,
  activeVersionId: string,
): Promise<number> {
  const { count, error } = await db
    .from('user_dbd_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('dbd_record_id', recordId)
    .eq('active', true)
    .or(`training_version_id.is.null,training_version_id.neq.${activeVersionId}`);
  if (error) throw error;
  return count ?? 0;
}

const isComplete = (c: Coverage) =>
  c.mcq.ready === c.mcq.total && c.interview.ready === c.interview.total;

/**
 * Freezes a confirmed record's current sheet as its active version when the sheet changed
 * (spec §5.6): the previous active version is superseded, an assignment without a version is
 * pinned to this one (plan decision 2), and nobody else moves (D75). No blocking-exception
 * gate yet — P17c adds it in front of the activation; the `draft` status waits for it.
 * `admin` is the service role: versions have no write policy.
 */
export async function syncTrainingVersion(
  admin: Db,
  recordId: string,
  actorId: string | null,
  now: Date = new Date(),
): Promise<SyncResult> {
  const record = await getDbdRecord(admin, recordId);
  if (!record) return 'not_found';
  if (record.extraction_status !== 'confirmed') return 'unconfirmed';

  const structured = readStructuredData(record.structured_data);
  const address = await currentAddress(admin, record, structured);
  const snapshot = buildTrainingSnapshot({ record, structured, address });
  const hash = snapshotHash(snapshot);
  const active = await getActiveVersion(admin, recordId);
  if (active && active.facts_hash === hash) return 'unchanged';

  const coverage = conceptCoverage(snapshot.facts, 'company');
  const { data: last } = await admin
    .from('company_training_versions')
    .select('version_no')
    .eq('dbd_record_id', recordId)
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle();
  const at = now.toISOString();

  if (active) {
    const { error } = await admin
      .from('company_training_versions')
      .update({ status: 'superseded', superseded_at: at })
      .eq('id', active.id);
    if (error) throw error;
  }
  const { data: created, error } = await admin
    .from('company_training_versions')
    .insert({
      dbd_record_id: recordId,
      version_no: (last?.version_no ?? 0) + 1,
      status: 'active',
      facts: snapshot.facts as unknown as Json,
      extras: snapshot.extras as unknown as Json,
      provenance: (structured.provenance ?? {}) as unknown as Json,
      coverage: {
        mcq: coverage.mcq,
        interview: coverage.interview,
        missingFacts: coverage.missingFacts,
      } as unknown as Json,
      company_complete: isComplete(coverage),
      facts_hash: hash,
      source_updated_at: record.updated_at,
      created_by: actorId,
      activated_at: at,
    })
    .select('id')
    .single();
  if (error) throw error;

  const { error: pinError } = await admin
    .from('user_dbd_assignments')
    .update({ training_version_id: created.id })
    .eq('dbd_record_id', recordId)
    .eq('active', true)
    .is('training_version_id', null);
  if (pinError) throw pinError;
  return 'activated';
}

/** After a change that may have altered the sheet: versioning never fails the change itself. */
export async function syncAfterChange(recordId: string, actorId: string | null): Promise<void> {
  try {
    await syncTrainingVersion(createSupabaseAdminClient(), recordId, actorId);
  } catch (e) {
    console.error('training version', recordId, e);
  }
}
```

- [ ] **Step 5: Run it to see it pass**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/training-versions.test.ts && pnpm typecheck && pnpm lint`
Expected: 5 passed; clean.

- [ ] **Step 6: Commit**

```bash
git add lib/db/training-versions.ts tests/integration/helpers.ts tests/integration/training-versions.test.ts
git commit -m "feat(versions): freeze a confirmed record's sheet whenever it changes (P17b, §5.6)"
```

---

## Task 4: Versions follow every change

**Files:**
- Modify: `app/[locale]/(admin)/admin/dbd-records/actions.ts`, `app/api/cron/index/route.ts`, `lib/db/auto-confirm.ts`

- [ ] **Step 1: The record actions**

In `app/[locale]/(admin)/admin/dbd-records/actions.ts` add the import:

```ts
import { syncAfterChange } from '@/lib/db/training-versions';
```

Replace `deriveAfterSave` with:

```ts
/**
 * A save has succeeded; a failure to derive must not undo it (the next save derives again). A
 * confirmed record's sheet may have changed with it (spec §5.6): a new version, never a moved
 * learner.
 */
async function deriveAfterSave(
  db: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  id: string,
  actorId: string,
): Promise<void> {
  await refreshDerivedFacts(db, id).catch((e) => console.error('derived facts', id, e));
  await syncAfterChange(id, actorId);
}
```

Then, in `saveDbdRecordAction`, change `await deriveAfterSave(db, id);` to `await deriveAfterSave(db, id, admin.id);` and `await deriveAfterSave(db, row.id);` to `await deriveAfterSave(db, row.id, admin.id);`.

In `confirmDbdRecordAction`, after `await confirmDbdRecord(db, id, admin.id);` add:

```ts
    await syncAfterChange(id, admin.id);
```

In `saveInterviewAnswersAction`, change `await requireStaff(locale);` to `const staff = await requireStaff(locale);` and `await deriveAfterSave(db, id);` to `await deriveAfterSave(db, id, staff.id);`.

In `setBusinessCategoryAction` and `remapBusinessCategoryAction`, change `await requireStaff(locale);` to `const staff = await requireStaff(locale);` and add, right after `await setBusinessCategory(db, id, key);` / `await remapBusinessCategory(db, id);`:

```ts
    await syncAfterChange(id, staff.id);
```

- [ ] **Step 2: The background reads**

In `app/api/cron/index/route.ts` add the import:

```ts
import { syncAfterChange } from '@/lib/db/training-versions';
```

In the `extract` handler, after the `refreshDerivedFacts(...)` call add:

```ts
          await syncAfterChange(recordId, null);
```

In the `transcript` handler replace the `if (run.applied.includes('head_office_address')) { ... }` block with:

```ts
        if (run.applied.length > 0) {
          if (run.applied.includes('head_office_address')) {
            await refreshDerivedFacts(createSupabaseAdminClient(), input.recordId).catch((e) =>
              console.error('derived facts', input.recordId, e),
            );
          }
          // Any filled fact may have changed the sheet (spec §5.6).
          await syncAfterChange(input.recordId, null);
        }
```

- [ ] **Step 3: Auto-confirmation (D80)**

In `lib/db/auto-confirm.ts`, import `syncAfterChange` from `./training-versions` and, where the update that sets `extraction_status: 'confirmed'` has succeeded (before the function returns its confirming verdict), add:

```ts
  // The first version of a record that confirmed itself (spec §5.6).
  await syncAfterChange(recordId, null);
```

(Read the function first: the call goes on the success path only — the one that returns the `confirmed` verdict.)

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/dbd-records.db.test.ts tests/integration/extraction.test.ts tests/integration/transcript-extraction.test.ts tests/integration/auto-confirm.test.ts`
Expected: clean; the suites pass (if `auto-confirm.test.ts` is named differently, run the file that tests `autoConfirmIfClean`).

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/(admin)/admin/dbd-records/actions.ts" app/api/cron/index/route.ts lib/db/auto-confirm.ts
git commit -m "feat(versions): a new version after saves, confirmation, extraction and transcript fills (P17b)"
```

---

## Task 5: Pinning, the role snapshot and the move

**Files:**
- Create: `lib/db/pinning.ts`
- Modify: `lib/db/assignments.ts`
- Test: `tests/integration/pinning.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/pinning.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assignDbdRecord,
  getActiveAssignmentForUser,
  updateAssignmentRole,
} from '@/lib/db/assignments';
import {
  PinError,
  confirmAssignmentRole,
  evaluationInProgress,
  moveAssignmentToVersion,
  pinnedFactsFor,
} from '@/lib/db/pinning';
import { getActiveVersion, listVersions, syncTrainingVersion } from '@/lib/db/training-versions';
import {
  adminClient,
  completeRecord,
  confirmRecord,
  deleteTeam,
  seedTeam,
  type Team,
} from './helpers';

const svc = adminClient();
const ROLE = {
  holder_name: 'นางสาวกุลธิดา พลเยี่ยม',
  position: 'กรรมการ',
  responsibilities: 'ดูแลลูกค้า',
  relationship_to_shareholders: null,
};

describe('pinning (spec §5.6, D75)', () => {
  let team: Team;
  let assignmentId: string;
  let attemptId: string;
  beforeAll(async () => {
    team = await seedTeam('ตรึงรุ่น');
    await confirmRecord(team.recordId, team.manager.id);
    await completeRecord(team.recordId);
  });
  afterAll(async () => {
    await svc.from('assessment_attempts').delete().eq('user_id', team.learner.id);
    await svc.from('user_dbd_assignments').delete().eq('dbd_record_id', team.recordId);
    await svc.from('company_training_versions').delete().eq('dbd_record_id', team.recordId);
    await deleteTeam(team);
  });

  it('assigning pins the active version; a first read makes one when none exists yet', async () => {
    const a = await assignDbdRecord(team.asManager, {
      userId: team.learner.id,
      dbdRecordId: team.recordId,
    });
    assignmentId = a.id;
    expect(a.training_version_id).toBeNull();
    const active = (await getActiveAssignmentForUser(svc, team.learner.id))!;
    const pinned = await pinnedFactsFor(svc, active);
    expect(pinned?.version.version_no).toBe(1);
    expect(pinned?.roleConfirmed).toBe(false);
    expect(pinned?.snapshot.facts.company_name_th).toBe('บริษัท ครบถ้วน จำกัด');
    const { data } = await svc
      .from('user_dbd_assignments')
      .select('training_version_id')
      .eq('id', assignmentId)
      .single();
    expect(data!.training_version_id).toBe(pinned!.version.id);
  });

  it('confirms the role against the pinned sheet, and a later edit unconfirms it', async () => {
    await updateAssignmentRole(team.asManager, assignmentId, ROLE);
    const snapshot = await confirmAssignmentRole(team.asManager, {
      assignmentId,
      actorId: team.manager.id,
    });
    expect(snapshot).toMatchObject({
      holder_name: ROLE.holder_name,
      learner_is_shareholder: true,
      my_shares: 18000,
      my_share_percent: 90,
    });
    const active = (await getActiveAssignmentForUser(svc, team.learner.id))!;
    expect(active.role_confirmed_by).toBe(team.manager.id);
    expect((await pinnedFactsFor(svc, active))?.roleConfirmed).toBe(true);
    await updateAssignmentRole(team.asManager, assignmentId, { ...ROLE, position: 'ผู้จัดการ' });
    const edited = (await getActiveAssignmentForUser(svc, team.learner.id))!;
    expect(edited.role_snapshot).toBeNull();
    expect(edited.role_confirmed_at).toBeNull();
    await confirmAssignmentRole(team.asManager, { assignmentId, actorId: team.manager.id });
  });

  it('refuses to confirm a role without a name', async () => {
    await updateAssignmentRole(team.asManager, assignmentId, { ...ROLE, holder_name: null });
    await expect(
      confirmAssignmentRole(team.asManager, { assignmentId, actorId: team.manager.id }),
    ).rejects.toMatchObject({ code: 'role_missing' });
    await updateAssignmentRole(team.asManager, assignmentId, ROLE);
    await confirmAssignmentRole(team.asManager, { assignmentId, actorId: team.manager.id });
  });

  it('moves only to the active version, never while an evaluation is in progress', async () => {
    await svc
      .from('dbd_records')
      .update({ registered_capital: 5_000_000 })
      .eq('id', team.recordId);
    await syncTrainingVersion(svc, team.recordId, null);
    const [v2, v1] = await listVersions(svc, team.recordId);
    expect(v2!.version_no).toBe(2);
    const { data: attempt } = await svc
      .from('assessment_attempts')
      .insert({
        user_id: team.learner.id,
        dbd_record_id: team.recordId,
        kind: 'quiz',
        language: 'th',
        attempt_no: 1,
        question_ids: [],
        shuffle_seed: 'pin',
        status: 'in_progress',
      })
      .select('id')
      .single();
    attemptId = attempt!.id;
    expect(await evaluationInProgress(team.asManager, team.learner.id)).toBe('quiz');
    await expect(
      moveAssignmentToVersion(team.asManager, { assignmentId, versionId: v2!.id }),
    ).rejects.toMatchObject({ code: 'evaluation_in_progress' });
    await svc.from('assessment_attempts').update({ status: 'submitted' }).eq('id', attemptId);
    expect(await evaluationInProgress(team.asManager, team.learner.id)).toBeNull();
    await expect(
      moveAssignmentToVersion(team.asManager, { assignmentId, versionId: v1!.id }),
    ).rejects.toMatchObject({ code: 'not_active' });
    const moved = await moveAssignmentToVersion(team.asManager, {
      assignmentId,
      versionId: v2!.id,
    });
    expect(moved).toEqual({ from: 1, to: 2, moved: true });
    const active = (await getActiveAssignmentForUser(svc, team.learner.id))!;
    expect(active.training_version_id).toBe(v2!.id);
    // The confirmation survived the move; the shareholding was derived against the new sheet.
    expect(active.role_confirmed_at).not.toBeNull();
    expect(active.role_snapshot).toMatchObject({ learner_is_shareholder: true, my_shares: 18000 });
    expect(
      await moveAssignmentToVersion(team.asManager, { assignmentId, versionId: v2!.id }),
    ).toEqual({ from: 2, to: 2, moved: false });
    expect(await getActiveVersion(svc, team.recordId)).toMatchObject({ id: v2!.id });
    expect(new PinError('not_found').code).toBe('not_found');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/pinning.test.ts`
Expected: FAIL — cannot resolve `@/lib/db/pinning`.

- [ ] **Step 3: `lib/db/assignments.ts` — pin at assignment, unconfirm on edit**

Replace `assignDbdRecord` and `updateAssignmentRole` with:

```ts
/**
 * The database enforces "confirmed only" and "one active per learner"; errors surface as thrown
 * PostgrestErrors. The assignment pins the record's active version (spec §5.6); when there is
 * none yet, the first one to appear pins itself (plan decision 2).
 */
export async function assignDbdRecord(
  db: Db,
  args: { userId: string; dbdRecordId: string },
): Promise<AssignmentRow> {
  const { data: active, error: versionError } = await db
    .from('company_training_versions')
    .select('id')
    .eq('dbd_record_id', args.dbdRecordId)
    .eq('status', 'active')
    .maybeSingle();
  if (versionError) throw versionError;
  const { data, error } = await db
    .from('user_dbd_assignments')
    .insert({
      user_id: args.userId,
      dbd_record_id: args.dbdRecordId,
      training_version_id: active?.id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * The learner's own role in the company (decision D39): feeds {my_*} placeholders. Editing it
 * withdraws a confirmation (plan decision 4); the caller refuses the edit while an evaluation
 * is in progress.
 */
export async function updateAssignmentRole(
  db: Db,
  assignmentId: string,
  role: LearnerRole,
): Promise<void> {
  const { error } = await db
    .from('user_dbd_assignments')
    .update({
      holder_name: role.holder_name,
      position: role.position,
      responsibilities: role.responsibilities,
      relationship_to_shareholders: role.relationship_to_shareholders,
      role_snapshot: null,
      role_confirmed_at: null,
      role_confirmed_by: null,
    })
    .eq('id', assignmentId);
  if (error) throw error;
}
```

- [ ] **Step 4: `lib/db/pinning.ts`**

```ts
// lib/db/pinning.ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LearnerRole } from '@/lib/domain/bank-interview';
import {
  buildRoleSnapshot,
  type RoleSnapshot,
  type TrainingSnapshot,
} from '@/lib/domain/facts/snapshot';
import type { ActiveAssignment, AssignmentRow } from './assignments';
import type { Database, Json } from './database.types';
import {
  getVersion,
  readSnapshot,
  syncTrainingVersion,
  type TrainingVersionRow,
} from './training-versions';

type Db = SupabaseClient<Database>;

export type PinErrorCode =
  | 'not_found'
  | 'no_version'
  | 'not_active'
  | 'other_record'
  | 'evaluation_in_progress'
  | 'role_missing';

export class PinError extends Error {
  constructor(public readonly code: PinErrorCode) {
    super(code);
    this.name = 'PinError';
  }
}

export type InProgress = 'quiz' | 'exam' | 'interview' | null;

/** A quiz or exam attempt, or a D64 interview session, that the learner has not finished. */
export async function evaluationInProgress(db: Db, userId: string): Promise<InProgress> {
  const attempt = await db
    .from('assessment_attempts')
    .select('kind')
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .limit(1)
    .maybeSingle();
  if (attempt.error) throw attempt.error;
  if (attempt.data) return attempt.data.kind as 'quiz' | 'exam';
  const session = await db
    .from('interview_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .limit(1)
    .maybeSingle();
  if (session.error) throw session.error;
  return session.data ? 'interview' : null;
}

export function roleOf(a: Pick<AssignmentRow, keyof LearnerRole>): LearnerRole {
  return {
    holder_name: a.holder_name,
    position: a.position,
    responsibilities: a.responsibilities,
    relationship_to_shareholders: a.relationship_to_shareholders,
  };
}

async function activeAssignment(db: Db, assignmentId: string): Promise<AssignmentRow> {
  const { data, error } = await db
    .from('user_dbd_assignments')
    .select('*')
    .eq('id', assignmentId)
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new PinError('not_found');
  return data;
}

/**
 * Freezes the role as typed, with the shareholding derived against the pinned sheet (plan
 * decision 4). Written under the caller's own client so the assignments audit names them.
 */
export async function confirmAssignmentRole(
  db: Db,
  args: { assignmentId: string; actorId: string; now?: Date },
): Promise<RoleSnapshot> {
  const a = await activeAssignment(db, args.assignmentId);
  if (!a.training_version_id) throw new PinError('no_version');
  if (!a.holder_name?.trim()) throw new PinError('role_missing');
  const version = await getVersion(db, a.training_version_id);
  if (!version) throw new PinError('no_version');
  const snapshot = buildRoleSnapshot(roleOf(a), readSnapshot(version));
  const { error } = await db
    .from('user_dbd_assignments')
    .update({
      role_snapshot: snapshot as unknown as Json,
      role_confirmed_at: (args.now ?? new Date()).toISOString(),
      role_confirmed_by: args.actorId,
    })
    .eq('id', a.id);
  if (error) throw error;
  return snapshot;
}

/**
 * "Move to version n" (D75): only to the record's active version, never while an evaluation is
 * in progress; a confirmed role stays confirmed, its shareholding re-derived. The caller's own
 * client writes, so the audit trigger records who moved the learner.
 */
export async function moveAssignmentToVersion(
  db: Db,
  args: { assignmentId: string; versionId: string },
): Promise<{ from: number | null; to: number; moved: boolean }> {
  const a = await activeAssignment(db, args.assignmentId);
  const target = await getVersion(db, args.versionId);
  if (!target) throw new PinError('not_found');
  if (target.dbd_record_id !== a.dbd_record_id) throw new PinError('other_record');
  if (target.status !== 'active') throw new PinError('not_active');
  if (a.training_version_id === target.id) {
    return { from: target.version_no, to: target.version_no, moved: false };
  }
  const busy = await evaluationInProgress(db, a.user_id);
  if (busy) throw new PinError('evaluation_in_progress');
  const current = a.training_version_id ? await getVersion(db, a.training_version_id) : null;
  const role = a.role_snapshot ? buildRoleSnapshot(roleOf(a), readSnapshot(target)) : null;
  const { error } = await db
    .from('user_dbd_assignments')
    .update({
      training_version_id: target.id,
      role_snapshot: role as unknown as Json,
    })
    .eq('id', a.id);
  if (error) throw error;
  return { from: current?.version_no ?? null, to: target.version_no, moved: true };
}

export type PinnedFacts = {
  version: TrainingVersionRow;
  snapshot: TrainingSnapshot;
  /** The confirmed role, or — until confirmation — the role as typed (plan decision 4). */
  role: RoleSnapshot | null;
  roleConfirmed: boolean;
};

/**
 * What an assignment is studied and evaluated on. An assignment without a version (from before
 * P17b, or assigned before its record had one) is pinned to the record's first version here,
 * made now if the record is confirmed (plan decision 2). `admin` is the service role.
 */
export async function pinnedFactsFor(
  admin: Db,
  assignment: ActiveAssignment,
): Promise<PinnedFacts | null> {
  let row: AssignmentRow = assignment;
  if (!row.training_version_id) {
    await syncTrainingVersion(admin, assignment.dbd_record_id, null);
    const { data, error } = await admin
      .from('user_dbd_assignments')
      .select('*')
      .eq('id', assignment.id)
      .maybeSingle();
    if (error) throw error;
    if (!data?.training_version_id) return null;
    row = data;
  }
  const version = await getVersion(admin, row.training_version_id!);
  if (!version) return null;
  const snapshot = readSnapshot(version);
  const confirmed = (row.role_snapshot as RoleSnapshot | null) ?? null;
  return {
    version,
    snapshot,
    role: confirmed ?? buildRoleSnapshot(roleOf(row), snapshot),
    roleConfirmed: confirmed !== null,
  };
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/pinning.test.ts tests/integration/assignments.db.test.ts tests/integration/assignments.test.ts && pnpm typecheck && pnpm lint`
Expected: pinning 4 passed; the assignments suites unchanged; clean.

- [ ] **Step 6: Commit**

```bash
git add lib/db/pinning.ts lib/db/assignments.ts tests/integration/pinning.test.ts
git commit -m "feat(versions): pin at assignment, confirm the role against the sheet, move on request (P17b, D75)"
```

---

## Task 6: Every reader on the pinned version

**Files:**
- Modify: `lib/db/assessment.ts`, `lib/db/interviews.ts`, `lib/db/name-cards.ts`, `app/[locale]/(learner)/study/[key]/page.tsx`, `app/[locale]/(learner)/dashboard/page.tsx`, `messages/{th,en,zh}.json`

- [ ] **Step 1: Quiz and exam render from the snapshot and remember the version**

In `lib/db/assessment.ts`:

Add to the imports:

```ts
import { templateRecordFromSnapshot } from '@/lib/domain/facts/snapshot';
import { pinnedFactsFor } from './pinning';
import { getVersion, readSnapshot } from './training-versions';
```

Add `| 'no_version'` to the `AssessmentError` code union (after `'no_assignment'`).

In `getOrStartAttempt`, replace

```ts
  const record = toTemplateRecord(assignment.dbd_records, assignment);
```

with

```ts
  // Rendered from the pinned version (D75), never from the live row.
  const pinned = await pinnedFactsFor(admin, assignment);
  if (!pinned) throw new AssessmentError('No training version yet', 'no_version');
  const record = templateRecordFromSnapshot(pinned.snapshot, pinned.role);
```

and add to the attempt `.insert({ ... })` the field:

```ts
      training_version_id: pinned.version.id,
```

Replace `templateRecordForAttempt` with:

```ts
/** The learner's company as the templates see it, for an attempt: its version, or the live row for an attempt from before P17b. */
async function templateRecordForAttempt(
  admin: Db,
  attempt: AttemptRow,
): Promise<TemplateRecord | null> {
  const assignment = await getActiveAssignmentForUser(admin, attempt.user_id);
  const sameRecord =
    assignment && assignment.dbd_record_id === attempt.dbd_record_id ? assignment : null;
  if (attempt.training_version_id) {
    const version = await getVersion(admin, attempt.training_version_id);
    if (version) {
      const snapshot = readSnapshot(version);
      const pinned = sameRecord ? await pinnedFactsFor(admin, sameRecord) : null;
      return templateRecordFromSnapshot(snapshot, pinned?.role ?? null);
    }
  }
  if (!attempt.dbd_record_id) return null;
  const { data: recordRow } = await admin
    .from('dbd_records')
    .select('*')
    .eq('id', attempt.dbd_record_id)
    .maybeSingle();
  if (!recordRow) return null;
  return toTemplateRecord(recordRow, sameRecord);
}
```

- [ ] **Step 2: The D64 interview verifies the frozen facts**

In `lib/db/interviews.ts`:

Add `| 'no_version'` to `InterviewErrorCode` (after `'no_assignment'`), and to the imports:

```ts
import type { TemplateRecord } from '@/lib/domain/assessment/template';
import { templateRecordFromSnapshot } from '@/lib/domain/facts/snapshot';
import { pinnedFactsFor } from './pinning';
```

Change the signature line of `interviewFacts` from

```ts
export function interviewFacts(record: DbdRecordRow, role: LearnerRole | null): FactSheet {
  const t = toTemplateRecord(record, role);
```

to

```ts
export function interviewFacts(record: DbdRecordRow, role: LearnerRole | null): FactSheet {
  return factsFromTemplate(toTemplateRecord(record, role));
}

/** The same display strings from any template record — a version's or the live row's. */
export function factsFromTemplate(t: TemplateRecord): FactSheet {
```

(the body that follows is unchanged). Replace `factsFor` with:

```ts
async function factsFor(userId: string) {
  const admin = createSupabaseAdminClient();
  const assignment = await getActiveAssignmentForUser(admin, userId);
  if (!assignment) throw new InterviewError('No active assignment', 'no_assignment');
  const pinned = await pinnedFactsFor(admin, assignment);
  if (!pinned) throw new InterviewError('No training version yet', 'no_version');
  return {
    assignment,
    facts: factsFromTemplate(templateRecordFromSnapshot(pinned.snapshot, pinned.role)),
  };
}
```

- [ ] **Step 3: Study cards, the dashboard and the name card**

`app/[locale]/(learner)/study/[key]/page.tsx` — add the imports:

```ts
import { templateRecordFromSnapshot } from '@/lib/domain/facts/snapshot';
import { pinnedFactsFor } from '@/lib/db/pinning';
```

and replace

```ts
  const templateRecord = assignment ? toTemplateRecord(assignment.dbd_records, assignment) : null;
```

with

```ts
  // The pinned version (D75); the live row only while the record has no version yet.
  const pinned = assignment ? await pinnedFactsFor(createSupabaseAdminClient(), assignment) : null;
  const templateRecord = pinned
    ? templateRecordFromSnapshot(pinned.snapshot, pinned.role)
    : assignment
      ? toTemplateRecord(assignment.dbd_records, assignment)
      : null;
```

`app/[locale]/(learner)/dashboard/page.tsx` — add the imports:

```ts
import { createSupabaseAdminClient } from '@/lib/db/admin';
import { pinnedFactsFor } from '@/lib/db/pinning';
```

(keep any that already exist) and replace the block

```ts
  const record = mine?.dbd_records ?? null;
  const documentUrl = record ? await createMyDocumentSignedUrl(user.id, record.id) : null;
  const directors = (record?.directors as unknown as Director[] | null) ?? [];
  // What the company does and sells is the manager's answer, not a certificate fact (Level 4).
  const interview = record
    ? (readStructuredData(record.structured_data).interview ?? EMPTY_INTERVIEW_PROFILE)
    : EMPTY_INTERVIEW_PROFILE;
```

with

```ts
  const record = mine?.dbd_records ?? null;
  const documentUrl = record ? await createMyDocumentSignedUrl(user.id, record.id) : null;
  // The company as the learner is trained on it: the pinned version (D75), or the live row
  // while the record has no version yet.
  const pinned = mine ? await pinnedFactsFor(createSupabaseAdminClient(), mine) : null;
  const liveInterview = record
    ? (readStructuredData(record.structured_data).interview ?? EMPTY_INTERVIEW_PROFILE)
    : EMPTY_INTERVIEW_PROFILE;
  const company = pinned
    ? {
        name_th: pinned.snapshot.facts.company_name_th,
        name_en: pinned.snapshot.facts.company_name_en,
        juristic_id: pinned.snapshot.facts.juristic_id,
        registered_capital: pinned.snapshot.facts.registered_capital,
        head_office_address: pinned.snapshot.extras.head_office_address,
        directors: pinned.snapshot.facts.directors,
        issued_on: pinned.snapshot.extras.issued_on,
        nature_of_business: pinned.snapshot.facts.nature_of_business,
        products_services: pinned.snapshot.facts.products_services,
      }
    : record
      ? {
          name_th: record.company_name_th,
          name_en: record.company_name_en,
          juristic_id: record.juristic_id,
          registered_capital: record.registered_capital,
          head_office_address: record.head_office_address,
          directors: (record.directors as unknown as Director[] | null) ?? [],
          issued_on: record.issued_on,
          nature_of_business: liveInterview.nature_of_business,
          products_services: liveInterview.products_services,
        }
      : null;
```

Then, inside `<CompanyCard …>`, read from `company` instead of `record`/`directors`/`interview`: `nameTh={company.name_th ?? '—'}`, `nameEn={company.name_en}`, `juristicId={company.juristic_id ?? '—'}`, `registeredCapital` from `company.registered_capital`, address from `company.head_office_address`, directors from `company.directors`, issued-on from `company.issued_on`, nature/products from `company.nature_of_business` / `company.products_services`; the surrounding `{record && (` becomes `{company && (`. `hero` keeps `company={company?.name_th ?? null}`.

`lib/db/name-cards.ts` — in `sourceFor`, add the import `import { pinnedFactsFor } from './pinning';` and replace the `source: { ... }` object with:

```ts
    source: pinned
      ? {
          company_name_th: pinned.snapshot.facts.company_name_th,
          company_name_en: pinned.snapshot.facts.company_name_en,
          head_office_address: pinned.snapshot.extras.head_office_address,
          juristic_id: pinned.snapshot.facts.juristic_id,
          contact_email: pinned.snapshot.extras.contact_email,
          nature_of_business: pinned.snapshot.facts.nature_of_business,
          products_services: pinned.snapshot.facts.products_services,
        }
      : {
          company_name_th: r.company_name_th,
          company_name_en: r.company_name_en,
          head_office_address: r.head_office_address,
          juristic_id: r.juristic_id,
          contact_email: interview?.contact_email ?? null,
          nature_of_business: interview?.nature_of_business ?? null,
          products_services: interview?.products_services ?? null,
        },
```

with `const pinned = await pinnedFactsFor(admin, assignment);` added right after `if (!assignment) throw …`.

- [ ] **Step 4: The learner sees why an evaluation will not start**

Run `grep -rn "no_assignment" "app/[locale]/(learner)" messages/en.json` and, wherever a `'no_assignment'` code is mapped to a message key, map `'no_version'` beside it to a sibling key `noVersion`, added to the same namespace in the three files:

- en: `"noVersion": "Your company's training facts are not ready yet. Ask your manager to check the record."`
- th: `"noVersion": "ข้อมูลสำหรับฝึกของบริษัทคุณยังไม่พร้อม กรุณาแจ้งผู้จัดการให้ตรวจสอบข้อมูล DBD"`
- zh: `"noVersion": "贵公司的培训信息尚未就绪，请联系经理检查 DBD 记录。"`

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm exec vitest run --config vitest.config.ts tests/unit/messages.test.ts && pnpm test:integration`
Expected: clean; the whole integration suite passes — every seeded confirmed record now gets its version on first read (Task 5), so the assessment, exam, interview and name-card suites need no change. If one fails with `no_version`, its record is unconfirmed: read the test and confirm the record in its setup.

- [ ] **Step 6: Commit**

```bash
git add lib/db/assessment.ts lib/db/interviews.ts lib/db/name-cards.ts "app/[locale]/(learner)/study/[key]/page.tsx" "app/[locale]/(learner)/dashboard/page.tsx" messages
git commit -m "feat(versions): quiz, exam, interview, study, dashboard and name card read the pinned version (P17b, D75)"
```

---

## Task 7: The record page shows its versions

**Files:**
- Create: `app/[locale]/(admin)/admin/dbd-records/[id]/training-versions-panel.tsx`
- Modify: `app/[locale]/(admin)/admin/dbd-records/[id]/page.tsx`, `messages/{th,en,zh}.json`

- [ ] **Step 1: Messages** — add `versions` to `admin.dbd` in each file:

`messages/en.json`
```json
"versions": {
  "title": "Training versions",
  "intro": "Learners study and are evaluated on a frozen copy of these facts. A save that changes them makes a new version; nobody moves to it until a person moves them.",
  "none": "No version yet — the record has not been confirmed.",
  "active": "Version {n} — active since {date}",
  "complete": "Complete at company scope: every one of the 29 MCQ and 12 bank-interview concepts resolves.",
  "incomplete": "Not complete yet — still missing:",
  "behind": "{count, plural, =0 {Every learner is on this version.} one {# learner is on an older version.} other {# learners are on older versions.}}",
  "history": "History",
  "status": { "active": "active", "superseded": "superseded", "draft": "draft" }
}
```
`messages/th.json`
```json
"versions": {
  "title": "รุ่นข้อมูลสำหรับฝึก",
  "intro": "ผู้เรียนศึกษาและถูกประเมินจากสำเนาข้อมูลที่ตรึงไว้ การบันทึกที่เปลี่ยนข้อมูลจะสร้างรุ่นใหม่ และไม่มีใครถูกย้ายไปรุ่นใหม่จนกว่าเจ้าหน้าที่จะย้ายให้",
  "none": "ยังไม่มีรุ่นข้อมูล — ยังไม่ได้ยืนยันข้อมูล DBD",
  "active": "รุ่นที่ {n} — ใช้งานตั้งแต่ {date}",
  "complete": "ครบถ้วนระดับบริษัท: แนวคิดแบบทดสอบ 29 ข้อและสัมภาษณ์ธนาคาร 12 ข้อมีข้อมูลครบ",
  "incomplete": "ยังไม่ครบ — ยังขาด:",
  "behind": "{count, plural, =0 {ผู้เรียนทุกคนอยู่ในรุ่นนี้} other {ผู้เรียน # คนยังอยู่ในรุ่นเก่า}}",
  "history": "ประวัติ",
  "status": { "active": "ใช้งาน", "superseded": "ถูกแทนที่", "draft": "ร่าง" }
}
```
`messages/zh.json`
```json
"versions": {
  "title": "培训版本",
  "intro": "学员学习和评估所依据的是这些信息的冻结副本。改变信息的保存会生成新版本；在人员操作之前，没有学员会被移到新版本。",
  "none": "尚无版本——记录尚未确认。",
  "active": "版本 {n}——自 {date} 起生效",
  "complete": "公司层面已完整：选择题 29 个概念和银行面谈 12 个概念全部可解析。",
  "incomplete": "尚不完整——仍缺少：",
  "behind": "{count, plural, =0 {所有学员都在此版本。} other {# 名学员仍在旧版本。}}",
  "history": "历史",
  "status": { "active": "生效", "superseded": "已替代", "draft": "草稿" }
}
```

- [ ] **Step 2: The panel**

```tsx
// app/[locale]/(admin)/admin/dbd-records/[id]/training-versions-panel.tsx
import { useFormatter, useTranslations } from 'next-intl';
import type { TrainingVersionRow } from '@/lib/db/training-versions';
import { versionCoverage } from '@/lib/db/training-versions';

/**
 * Which frozen copy of the facts learners are on (spec §5.6, D75): the active version, whether
 * it is complete at company scope, how many learners are behind it, and the history.
 */
export function TrainingVersionsPanel({
  versions,
  behind,
}: {
  versions: TrainingVersionRow[];
  behind: number;
}) {
  const t = useTranslations('admin.dbd.versions');
  const tf = useTranslations('admin.dbd.facts');
  const format = useFormatter();
  const active = versions.find((v) => v.status === 'active') ?? null;
  const missing = active ? versionCoverage(active).missingFacts : [];
  const when = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  return (
    <section
      className="staff-card grid max-w-2xl gap-3"
      data-testid="training-versions"
      data-active={active?.version_no ?? ''}
    >
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <p className="text-sm text-ink-500">{t('intro')}</p>
      {!active ? (
        <p className="staff-notice-info" data-testid="version-none">
          {t('none')}
        </p>
      ) : (
        <>
          <p className="staff-notice-ok" data-testid="version-active">
            {t('active', { n: active.version_no, date: when(active.activated_at) })}
          </p>
          {active.company_complete ? (
            <p className="text-sm text-ok-600" data-testid="version-complete">
              {t('complete')}
            </p>
          ) : (
            <div className="grid gap-1" data-testid="version-incomplete">
              <p className="text-sm text-warn-700">{t('incomplete')}</p>
              <ul className="list-disc pl-5 text-sm">
                {missing.map((f) => (
                  <li key={f} data-fact={f}>
                    {tf(f as 'address')}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-sm text-ink-700" data-testid="version-behind" data-count={behind}>
            {t('behind', { count: behind })}
          </p>
        </>
      )}
      {versions.length > 0 && (
        <details>
          <summary className="min-h-11 cursor-pointer text-sm font-semibold text-ink-700">
            {t('history')}
          </summary>
          <ul className="grid gap-1 text-sm tabular-nums" data-testid="version-history">
            {versions.map((v) => (
              <li key={v.id} data-version={v.version_no} data-status={v.status}>
                {v.version_no} · {t(`status.${v.status}` as 'status.active')} · {when(v.activated_at)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Wire it**

In `app/[locale]/(admin)/admin/dbd-records/[id]/page.tsx` add the imports:

```ts
import { countAssignmentsBehind, listVersions } from '@/lib/db/training-versions';
import { TrainingVersionsPanel } from './training-versions-panel';
```

after the `coverage` computation add:

```ts
  const versions = await listVersions(db, record.id);
  const activeVersion = versions.find((v) => v.status === 'active') ?? null;
  const behind = activeVersion ? await countAssignmentsBehind(db, record.id, activeVersion.id) : 0;
```

and render `<TrainingVersionsPanel versions={versions} behind={behind} />` directly after `<CoveragePanel coverage={coverage} />`.

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm exec vitest run --config vitest.config.ts tests/unit/messages.test.ts`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/(admin)/admin/dbd-records/[id]" messages
git commit -m "feat(versions): the record page shows the active version, its completeness and who is behind (P17b)"
```

---

## Task 8: The user page — pinned version, move, role confirmation

**Files:**
- Create: `app/[locale]/(admin)/admin/users/[id]/version-panel.tsx`
- Modify: `app/[locale]/(admin)/admin/users/[id]/actions.ts`, `.../page.tsx`, `.../role-form.tsx`, `messages/{th,en,zh}.json`

- [ ] **Step 1: Messages** — add `version` to `admin.users` in each file:

`messages/en.json`
```json
"version": {
  "title": "Training version",
  "pinned": "On version {n}",
  "none": "No version pinned yet — the company's facts are not versioned.",
  "newer": "Version {n} is newer.",
  "current": "This is the company's current version.",
  "move": "Move to version {n}",
  "moveHint": "Results on the old version no longer count. Refused while a quiz, exam or interview is in progress.",
  "roleConfirmed": "Role confirmed on {date}",
  "roleUnconfirmed": "The role is not confirmed: the learner's own concepts do not count until it is.",
  "confirmRole": "Confirm role",
  "messages": { "moved": "Moved to version {n}.", "role-confirmed": "Role confirmed." },
  "errors": {
    "evaluation-in-progress": "A quiz, exam or interview is in progress; try again when it is finished.",
    "not-active": "That is not the company's current version.",
    "other-record": "That version belongs to another company.",
    "not-found": "Not found.",
    "no-version": "The company has no version yet.",
    "role-missing": "Write the learner's name as in the DBD documents first."
  }
}
```
`messages/th.json`
```json
"version": {
  "title": "รุ่นข้อมูลสำหรับฝึก",
  "pinned": "อยู่ในรุ่นที่ {n}",
  "none": "ยังไม่ได้ตรึงรุ่น — ข้อมูลของบริษัทยังไม่มีรุ่น",
  "newer": "มีรุ่นที่ {n} ใหม่กว่า",
  "current": "เป็นรุ่นปัจจุบันของบริษัทแล้ว",
  "move": "ย้ายไปรุ่นที่ {n}",
  "moveHint": "ผลในรุ่นเก่าจะไม่นับอีกต่อไป ย้ายไม่ได้ระหว่างที่กำลังทำแบบทดสอบ สอบ หรือสัมภาษณ์",
  "roleConfirmed": "ยืนยันบทบาทเมื่อ {date}",
  "roleUnconfirmed": "ยังไม่ได้ยืนยันบทบาท: แนวคิดเฉพาะของผู้เรียนจะยังไม่นับจนกว่าจะยืนยัน",
  "confirmRole": "ยืนยันบทบาท",
  "messages": { "moved": "ย้ายไปรุ่นที่ {n} แล้ว", "role-confirmed": "ยืนยันบทบาทแล้ว" },
  "errors": {
    "evaluation-in-progress": "กำลังทำแบบทดสอบ สอบ หรือสัมภาษณ์อยู่ กรุณาลองใหม่เมื่อเสร็จแล้ว",
    "not-active": "ไม่ใช่รุ่นปัจจุบันของบริษัท",
    "other-record": "รุ่นนี้เป็นของบริษัทอื่น",
    "not-found": "ไม่พบข้อมูล",
    "no-version": "บริษัทยังไม่มีรุ่นข้อมูล",
    "role-missing": "กรุณากรอกชื่อผู้เรียนตามเอกสาร DBD ก่อน"
  }
}
```
`messages/zh.json`
```json
"version": {
  "title": "培训版本",
  "pinned": "当前在版本 {n}",
  "none": "尚未固定版本——公司信息尚未有版本。",
  "newer": "版本 {n} 更新。",
  "current": "这已是公司的当前版本。",
  "move": "移到版本 {n}",
  "moveHint": "旧版本上的成绩不再计入。测验、考试或面谈进行中时无法移动。",
  "roleConfirmed": "角色已于 {date} 确认",
  "roleUnconfirmed": "角色尚未确认：确认之前，学员本人的概念不计入。",
  "confirmRole": "确认角色",
  "messages": { "moved": "已移到版本 {n}。", "role-confirmed": "角色已确认。" },
  "errors": {
    "evaluation-in-progress": "测验、考试或面谈正在进行中，请在结束后重试。",
    "not-active": "这不是公司的当前版本。",
    "other-record": "该版本属于另一家公司。",
    "not-found": "未找到。",
    "no-version": "公司尚无版本。",
    "role-missing": "请先填写学员在 DBD 文件中的姓名。"
  }
}
```

- [ ] **Step 2: Actions** — append to `app/[locale]/(admin)/admin/users/[id]/actions.ts` (and add the imports `import { PinError, confirmAssignmentRole, evaluationInProgress, moveAssignmentToVersion } from '@/lib/db/pinning';`):

```ts
export type VersionActionState = {
  message: 'moved' | 'role-confirmed' | null;
  n: number | null;
  error: string | null;
};

function pinErrorKey(e: unknown): string {
  return e instanceof PinError ? e.code.replace(/_/g, '-') : errorMessage(e);
}

/** "Move to version n" (D75): under the caller's own client, so the audit names them. */
export async function moveAssignmentAction(
  _prev: VersionActionState,
  formData: FormData,
): Promise<VersionActionState> {
  const locale = String(formData.get('locale') ?? 'th');
  const userId = String(formData.get('userId') ?? '');
  const assignmentId = String(formData.get('assignmentId') ?? '');
  const versionId = String(formData.get('versionId') ?? '');
  await requireManageable(locale, userId);
  try {
    const moved = await moveAssignmentToVersion(await createSupabaseServerClient(), {
      assignmentId,
      versionId,
    });
    revalidatePath(`/${locale}/admin/users/${userId}`);
    return { message: 'moved', n: moved.to, error: null };
  } catch (e) {
    return { message: null, n: null, error: pinErrorKey(e) };
  }
}

export async function confirmRoleAction(
  _prev: VersionActionState,
  formData: FormData,
): Promise<VersionActionState> {
  const locale = String(formData.get('locale') ?? 'th');
  const userId = String(formData.get('userId') ?? '');
  const assignmentId = String(formData.get('assignmentId') ?? '');
  const staff = await requireManageable(locale, userId);
  try {
    await confirmAssignmentRole(await createSupabaseServerClient(), {
      assignmentId,
      actorId: staff.id,
    });
    revalidatePath(`/${locale}/admin/users/${userId}`);
    return { message: 'role-confirmed', n: null, error: null };
  } catch (e) {
    return { message: null, n: null, error: pinErrorKey(e) };
  }
}
```

In `updateAssignmentRoleAction`, after the `parsed` check and before `try`, add the refusal (plan decision 4):

```ts
  const db = await createSupabaseServerClient();
  const { data: current } = await db
    .from('user_dbd_assignments')
    .select('role_confirmed_at')
    .eq('id', assignmentId)
    .maybeSingle();
  if (current?.role_confirmed_at && (await evaluationInProgress(db, userId))) {
    return { message: null, error: 'evaluation-in-progress' };
  }
```

and use `db` in the `updateAssignmentRole(db, assignmentId, parsed.data)` call below.

- [ ] **Step 3: The panel**

```tsx
// app/[locale]/(admin)/admin/users/[id]/version-panel.tsx
'use client';

import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { confirmRoleAction, moveAssignmentAction, type VersionActionState } from './actions';

const initial: VersionActionState = { message: null, n: null, error: null };

/** The learner's pinned version and role confirmation (spec §5.6, D75). */
export function VersionPanel({
  userId,
  assignmentId,
  pinned,
  newest,
  roleConfirmedAt,
}: {
  userId: string;
  assignmentId: string;
  pinned: { n: number } | null;
  newest: { id: string; n: number } | null;
  roleConfirmedAt: string | null;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.users.version');
  const format = useFormatter();
  const [moveState, moveAction, moving] = useActionState(moveAssignmentAction, initial);
  const [roleState, roleAction, confirming] = useActionState(confirmRoleAction, initial);
  const state = moveState.message || moveState.error ? moveState : roleState;
  const canMove = newest !== null && pinned?.n !== newest.n;
  return (
    <section
      className="staff-card grid max-w-md gap-3"
      data-testid="version-panel"
      data-pinned={pinned?.n ?? ''}
    >
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <p className="text-sm" data-testid="version-pinned">
        {pinned ? t('pinned', { n: pinned.n }) : t('none')}
      </p>
      {newest && (
        <p className="text-sm text-ink-500" data-testid="version-newest">
          {canMove ? t('newer', { n: newest.n }) : t('current')}
        </p>
      )}
      {canMove && (
        <form action={moveAction} className="grid gap-1">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <input type="hidden" name="versionId" value={newest.id} />
          <button type="submit" disabled={moving} className="staff-btn justify-self-start" data-testid="version-move">
            {t('move', { n: newest.n })}
          </button>
          <p className="text-sm text-ink-500">{t('moveHint')}</p>
        </form>
      )}
      <p className="text-sm" data-testid="role-confirmation">
        {roleConfirmedAt
          ? t('roleConfirmed', {
              date: format.dateTime(new Date(roleConfirmedAt), { dateStyle: 'medium' }),
            })
          : t('roleUnconfirmed')}
      </p>
      {!roleConfirmedAt && pinned && (
        <form action={roleAction}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <button type="submit" disabled={confirming} className="staff-btn-ghost" data-testid="role-confirm">
            {t('confirmRole')}
          </button>
        </form>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-bad-600" data-testid="version-error">
          {t.has(`errors.${state.error}`) ? t(`errors.${state.error}` as 'errors.not-found') : state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-sm text-ok-600" data-testid="version-message">
          {t(`messages.${state.message}` as 'messages.moved', { n: state.n ?? 0 })}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: The page** — in `app/[locale]/(admin)/admin/users/[id]/page.tsx`:

Add the imports:

```ts
import { createSupabaseAdminClient } from '@/lib/db/admin';
import { pinnedFactsFor } from '@/lib/db/pinning';
import { getActiveVersion } from '@/lib/db/training-versions';
import { assignmentFacts } from '@/lib/domain/facts/snapshot';
import { VersionPanel } from './version-panel';
```

Replace the `coverage` block (from `// Assignment scope (spec §7.3)` to the closing `}` of `if (active) { … }`) with:

```ts
  // Assignment scope (spec §7.3) on the pinned version (D75): the company sheet as frozen, the
  // learner's role only once confirmed (plan decision 4). A record without a version yet is
  // read live, as before P17b.
  let coverage: Coverage | null = null;
  let pinned: Awaited<ReturnType<typeof pinnedFactsFor>> = null;
  let newest: { id: string; n: number } | null = null;
  if (active) {
    pinned = await pinnedFactsFor(createSupabaseAdminClient(), active);
    const activeVersion = await getActiveVersion(db, active.dbd_record_id);
    newest = activeVersion ? { id: activeVersion.id, n: activeVersion.version_no } : null;
    if (pinned) {
      coverage = conceptCoverage(
        assignmentFacts(pinned.snapshot, pinned.roleConfirmed ? pinned.role : null),
        'assignment',
      );
    } else {
      const structured = readStructuredData(active.dbd_records.structured_data);
      coverage = conceptCoverage(
        buildFactSheet({
          record: active.dbd_records,
          structured,
          address: await currentAddress(db, active.dbd_records, structured),
          role: {
            holder_name: active.holder_name,
            position: active.position,
            responsibilities: active.responsibilities,
            relationship_to_shareholders: active.relationship_to_shareholders,
          },
        }),
        'assignment',
      );
    }
  }
```

and render, directly after the `{active && (<RoleForm … />)}` block:

```tsx
      {active && (
        <VersionPanel
          userId={user.id}
          assignmentId={active.id}
          pinned={pinned ? { n: pinned.version.version_no } : null}
          newest={newest}
          roleConfirmedAt={active.role_confirmed_at}
        />
      )}
```

In `role-form.tsx`, where `state.error` is rendered, show the translated refusal when it is `evaluation-in-progress`: replace `{state.error}` with

```tsx
          {state.error === 'evaluation-in-progress'
            ? tv('errors.evaluation-in-progress')
            : state.error}
```

with `const tv = useTranslations('admin.users.version');` added beside the existing `useTranslations` call.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add "app/[locale]/(admin)/admin/users/[id]" messages
git commit -m "feat(versions): the user page pins, moves and confirms the role (P17b, D75)"
```

---

## Task 9: End to end

**Files:**
- Modify: `tests/e2e/seed.ts` (a complete company; an in-progress attempt)
- Create: `tests/e2e/training-versions.spec.ts`

- [ ] **Step 1: Seeds** — append to `tests/e2e/seed.ts`:

```ts
/** A learner on a confirmed, complete company (every company-level concept resolvable). */
export async function seedLearnerWithCompleteCompany(companyNameTh: string): Promise<string> {
  // Issued after registration (dbd_issue_not_before_registration).
  return seedLearnerWithCompany(companyNameTh, '2026-08-05', {
    company_name_en: 'COMPLETE CO., LTD.',
    registered_on: '2026-04-16',
    registered_capital: 2_000_000,
    directors: [{ name_th: 'นางสาวกุลธิดา พลเยี่ยม', name_en: null }],
    signing_authority: 'กรรมการหนึ่งคนลงลายมือชื่อและประทับตราสำคัญของบริษัท',
    head_office_address: 'เลขที่ 87 หมู่ที่ 9 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด',
    structured_data: {
      business: {
        shareholders: [
          { name: 'นางสาวกุลธิดา พลเยี่ยม', nationality: 'ไทย', shares: 18000, percent: null },
          { name: 'นายสมชาย ใจดี', nationality: 'ไทย', shares: 2000, percent: null },
        ],
        share_structure: { total_shares: 20000, par_value: 100, paid_up_capital: null, share_type: null },
      },
      interview: {
        nature_of_business: 'ค้าส่งและค้าปลีกเสื้อผ้า',
        products_services: 'ชุดเดรส เสื้อ กระโปรงสตรี',
        business_purpose: 'จำหน่ายเสื้อผ้าสตรีในภาคอีสาน',
        main_clients: 'ร้านค้าปลีกเสื้อผ้า',
        client_origin: 'หน้าร้านและออนไลน์',
        main_suppliers: 'โรงงานตัดเย็บในกรุงเทพฯ',
        business_address: 'ร้อยเอ็ด',
        monthly_revenue: '300,000 บาท',
        revenue_basis: 'ลูกค้า 30 ราย เฉลี่ย 10,000 บาท',
        average_transaction: '10,000 บาท',
        monthly_transactions: '30',
        source_of_funds: 'เงินออมของกรรมการ',
        first_incoming_funds: 'ทุนจดทะเบียนจากผู้ถือหุ้น',
        account_purpose: 'รับชำระค่าสินค้า',
        promptpay_qr_purpose: 'ให้ลูกค้าชำระเงินสะดวก',
        customer_examples: 'ร้านบุษบา ร้อยเอ็ด',
        customer_profile: 'ร้านค้าปลีกในประเทศ',
        transaction_details: 'โอนผ่านบัญชีบริษัท',
        operations_started: 'yes',
        has_existing_customers: 'yes',
        has_completed_transactions: 'yes',
        has_regular_suppliers: 'yes',
      },
    },
  });
}

/** An unfinished quiz for the learner, which blocks a version move; returns its id. */
export async function seedInProgressAttempt(loginId: string): Promise<string> {
  const admin = svc();
  const { data: profile } = await admin.from('profiles').select('id').eq('login_id', loginId).single();
  const { data: assignment } = await admin
    .from('user_dbd_assignments')
    .select('dbd_record_id')
    .eq('user_id', profile!.id)
    .eq('active', true)
    .single();
  const { data, error } = await admin
    .from('assessment_attempts')
    .insert({
      user_id: profile!.id,
      dbd_record_id: assignment!.dbd_record_id,
      kind: 'quiz',
      language: 'th',
      attempt_no: 1,
      question_ids: [],
      shuffle_seed: 'e2e',
      status: 'in_progress',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function submitAttempt(attemptId: string): Promise<void> {
  const { error } = await svc()
    .from('assessment_attempts')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', attemptId);
  if (error) throw error;
}
```

- [ ] **Step 2: The spec**

```ts
// tests/e2e/training-versions.spec.ts
import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs, switchTo } from './helpers';
import { seedInProgressAttempt, seedLearnerWithCompleteCompany, submitAttempt } from './seed';

test('a learner is pinned to version 1, stays there when the facts change, and is moved on purpose', async ({
  page,
}) => {
  // Three pages, four reloads and a seeded attempt: more than the default budget.
  test.setTimeout(90_000);
  const company = `บริษัท รุ่น ${Date.now()} จำกัด`;
  const learner = await seedLearnerWithCompleteCompany(company);

  // The learner's first look pins version 1 (plan decision 2).
  await loginAs(page, learner, E2E_PASSWORD);
  await expect(page.getByTestId('company-nature')).toContainText('เสื้อผ้า');

  await switchTo(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/learners');
  await page.getByRole('link', { name: learner }).click();
  await page.waitForURL(/\/th\/admin\/users\/[0-9a-f-]{36}$/);
  const userUrl = page.url();
  await expect(page.getByTestId('version-panel')).toHaveAttribute('data-pinned', '1');
  await expect(page.getByTestId('version-newest')).toContainText('ปัจจุบัน');
  // Complete company, but the role is not confirmed: 29/30 and 12/13 (plan decision 4).
  await expect(page.getByTestId('coverage-mcq')).toHaveAttribute('data-ready', '29');
  await expect(page.getByTestId('coverage-interview')).toHaveAttribute('data-ready', '12');

  // Confirm the role of a shareholder: everything resolves.
  await page.getByTestId('role-holder').fill('นางสาวกุลธิดา พลเยี่ยม');
  await page.locator('input[name="position"]').fill('กรรมการ');
  await page.getByTestId('role-form').getByRole('button', { name: 'บันทึก' }).click();
  await expect(page.getByTestId('role-saved')).toBeVisible();
  await page.getByTestId('role-confirm').click();
  await expect(page.getByTestId('version-message')).toContainText('ยืนยันบทบาทแล้ว');
  await page.reload();
  await expect(page.getByTestId('coverage-mcq')).toHaveAttribute('data-ready', '30');
  await expect(page.getByTestId('coverage-interview')).toHaveAttribute('data-ready', '13');

  // A fact changes on the record: version 2, and the learner stays on 1.
  await page.goto('/th/admin/dbd-records');
  await page.getByRole('link', { name: company }).first().click();
  await page.waitForURL(/\/th\/admin\/dbd-records\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('training-versions')).toHaveAttribute('data-active', '1');
  await expect(page.getByTestId('version-complete')).toBeVisible();
  const answers = page.getByTestId('interview-answers');
  await answers.locator('[name="interview_monthly_revenue"]').fill('350,000 บาท');
  await page.getByTestId('save-interview').click();
  await expect(page.getByTestId('interview-saved')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('training-versions')).toHaveAttribute('data-active', '2');
  await expect(page.getByTestId('version-behind')).toHaveAttribute('data-count', '1');

  // The move is refused while a quiz is open, then done, audited, and the role survives.
  const attemptId = await seedInProgressAttempt(learner);
  await page.goto(userUrl);
  await expect(page.getByTestId('version-panel')).toHaveAttribute('data-pinned', '1');
  await expect(page.getByTestId('version-newest')).toContainText('รุ่นที่ 2');
  await page.getByTestId('version-move').click();
  await expect(page.getByTestId('version-error')).toContainText('กำลังทำแบบทดสอบ');
  await submitAttempt(attemptId);
  await page.getByTestId('version-move').click();
  await expect(page.getByTestId('version-message')).toContainText('ย้ายไปรุ่นที่ 2');
  await page.reload();
  await expect(page.getByTestId('version-panel')).toHaveAttribute('data-pinned', '2');
  await expect(page.getByTestId('role-confirmation')).toContainText('ยืนยันบทบาทเมื่อ');
  await expect(page.getByTestId('coverage-mcq')).toHaveAttribute('data-ready', '30');
});
```

(If the record page's `interview_monthly_revenue` field is a textarea, `[name=…]` still finds it. If `assigned-company` has no link, the `.catch` swallows the miss and the `dbd-records` list route is used.)

- [ ] **Step 3: Run it, then the specs that touch the same pages**

Run: `pnpm exec playwright test tests/e2e/training-versions.spec.ts --reporter=line`
Expected: 1 passed.

Run: `pnpm exec playwright test tests/e2e/admin-assign.spec.ts tests/e2e/admin-reassign.spec.ts tests/e2e/bank-interview.spec.ts tests/e2e/facts-and-concepts.spec.ts tests/e2e/learner-dashboard.spec.ts tests/e2e/quiz.spec.ts tests/e2e/exam.spec.ts tests/e2e/interview.spec.ts tests/e2e/name-card.spec.ts --reporter=line`
Expected: all pass (use the spec names that exist; `ls tests/e2e` lists them).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/seed.ts tests/e2e/training-versions.spec.ts
git commit -m "test(versions): pinned, moved on purpose, role confirmed, blocked mid-quiz (P17b)"
```

---

## Task 10: Documentation and the full gate

**Files:**
- Modify: `docs/decisions-log.md`, `docs/security-checklist.md`, `docs/runbooks/operations.md`, `docs/runbooks/production-setup.md`, `docs/uat-script.md`

- [ ] **Step 1: Decisions** — at the end of the D75 row's decision text add: "Implemented in P17b: `company_training_versions` (frozen by trigger, one active per record, a new one on every change of a confirmed record's sheet), `user_dbd_assignments.training_version_id` + `role_snapshot` (explicit *Confirm role*), *Move to version n* on the user page (refused mid-evaluation, audited under the mover's session); quiz, exam, the D64 interview, study cards, the dashboard and the name card read the pinned version." Add to the D74 row: "P17b: an assignment's readiness is computed from its pinned version and its confirmed role."

- [ ] **Step 2: Security checklist** — append:

```markdown
| 29 | Training versions are written only by the service role after checks in code and frozen by a trigger once active; the Owner and the owning manager read a record's versions, a learner reads only the version pinned to their own active assignment; the pin and the role confirmation are written under the staff member's own session so the audit names them | ✅ | `tests/integration/training-versions.db.test.ts`, `tests/integration/pinning.test.ts`, `tests/e2e/training-versions.spec.ts` |
```

- [ ] **Step 3: Runbooks and UAT**

- `docs/runbooks/operations.md`, Incidents: `| A learner sees old company facts | the record page's *Training versions* panel: which version is active and how many learners are behind; the learner page: *On version n* | *Move to version n* on the learner page (not while a quiz, exam or interview is open); the facts a learner studies never change without that move (D75) |`
- `docs/runbooks/production-setup.md` §1: "Migration `20261002010000` adds training versions; existing assignments get their version on the learner's next visit or the record's next save — no data step."
- `docs/uat-script.md` section A: `| A14 | Training versions | Open a confirmed record, note *Version n — active*; change an answer and save; open one of its learners | The record shows the next version active and "1 learner on an older version"; the learner page still says the old version and offers *Move to version n*; the move is refused while that learner has a quiz open, and succeeds after; *Confirm role* turns 29/12 into 30/13 | DBD-001..004 |`

- [ ] **Step 4: Full gate**

Run each and expect success: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test:unit`, `pnpm test:integration`, `pnpm build`, `pnpm check:secrets`, `pnpm test:e2e` (port 3000 free first: `netstat -ano | grep ":3000 "`).

- [ ] **Step 5: Commit**

```bash
git add docs
git commit -m "docs: D75 implemented, checklist row 29, runbooks and UAT A14 (P17b)"
```

---

## Self-review against the spec

| Spec item | Task |
| --- | --- |
| §5.6 `company_training_versions` holds the whole sheet with provenance, frozen once active, one active per record | 1, 3 |
| §5.6 editing a fact makes a new version; created automatically (exception gate is P17c) | 3, 4 |
| §5.6 complete at company scope when 29/12 resolve | 3 (`company_complete`, `coverage`) |
| §5.6 an assignment pins `training_version_id` plus a `role_snapshot`; ready when its ROLE concepts resolve | 1, 5, 8 |
| §5.6 learners never move automatically; "Move to version n", refused mid-evaluation, audited | 5, 8, 9 |
| §6 `user_dbd_assignments` + `training_version_id`, `role_snapshot`, `role_confirmed_*` | 1 |
| §6 `assessment_attempts.training_version_id` (brought forward, decision 8) | 1, 6 |
| §7.2 P17b freezes exactly the fact sheet | 2, 3 |
| §10 all live readers moved to the pinned version | 6 |
| §11 `toTemplateRecord` superseded by the fact sheet | 2, 6 |
| §12.4 record and user pages show "newer version available" | 7, 8 |
| D75 pinned even when a newer version's answers are identical | 3 (hash: only a changed sheet makes a version; an identical sheet is `unchanged`) |

---

## Review fixes (PR #6)

- **Atomic activation.** `syncTrainingVersion` calls `activate_training_version(...)` (in the migration): supersede, insert and first pins happen in one serialized step under a lock on the record row, so a failure leaves the previous version active and two syncs of one record take turns.
- **Attempt-time role.** `assessment_attempts.role_snapshot` holds the role an attempt was rendered with; reviews read it instead of the assignment's current snapshot, which a move re-derives.
- **Early end.** `endInterview` closes with the pinned facts (`factsFor`), the same the session was built on.
- **Wording.** The move hint says the learner is studied and evaluated on the new version from now on; version-scoped progression and grandfathering are P17e (spec §10), not claimed here.
