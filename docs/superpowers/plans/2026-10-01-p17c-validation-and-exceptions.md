# P17c — Validation and Exceptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean DBD records are accepted and versioned without anyone touching them; everything else becomes a precise exception for the owning manager or the Owner, and a training version activates only when no blocking exception is open (spec 2026-09-30 §5.5, §5.6, §6, §10; decision D74).

**Architecture:** Deterministic validators (`lib/domain/validation/`) run after every extraction and every edit, from the same hooks that derive facts and sync versions. Each problem becomes a `training_fact_exceptions` row (missing, low_confidence, conflict, invalid, geo_mismatch, category_review, render_failure) with a tier: it blocks *acceptance*, blocks the *version*, or blocks nothing. `validateRecord` upserts the open exceptions, auto-resolves the ones that vanished, accepts the record when nothing blocks acceptance and the reading has finished, and then syncs the version — which from now on waits as a `draft` while any blocking exception is open and activates when the last one is resolved. Staff resolve exceptions on the record page under their own session (audited) or from a queue page scoped by RLS; the manual *Confirm* button and D80's auto-confirm are replaced by validation.

**Tech Stack:** Next.js 16 App Router, React 19 `useActionState`, next-intl (th/en/zh), Supabase Postgres with RLS + triggers, Vitest, Playwright.

**Branch:** `p17c/validation-and-exceptions` from `main` at `b1da109` (P17b merged), worktree `../portal-p17a`, second local stack (`thailand-training-portal-p17a`, API 55321). Migration timestamp `20261003010000`.

---

## Decisions taken in this plan — Owner: say if any is wrong

1. **Two blocking tiers.** *Acceptance* (the record becomes `confirmed`, assignable) is blocked by hard-rule failures and by missing `company_name_th`, a valid `juristic_id` and the four D58 answers — today's bar plus validation. The *version* is additionally blocked by every other missing company-level concept fact (D74's "every MCQ concept resolvable") and a missing issue date. So assignment keeps working as today, while evaluations wait for a complete, clean sheet — the exception list says exactly what to supply.
2. **Confidence bands** (`training_auto_accept_confidence_percent` 95, `training_review_confidence_percent` 75), applied only to extracted fields the sheet reads: at or above 95 nothing is raised; between 75 and 95 a non-blocking `low_confidence` for review; below 75 a `low_confidence` that blocks acceptance until a person confirms the value. A hard-rule failure always beats a high confidence.
3. **The check digit is a hard rule** (`invalid`, blocks acceptance). Thai 13-digit registration numbers carry a mod-11 check digit; 20 of the fictional ids in the test suite — the fake extractor's included — fail it, so a script gives every fictional id a valid digit, and the fake extractor gets a real, resolvable Roi Et address (its fictional province can never resolve) with an address confidence of 0.78 so the existing low-confidence hint still shows.
4. **Reconciliation rules.** Shares summing *over* the total or percents over 100 block acceptance; *under* is a non-blocking "the list may be partial" (big บอจ.5 lists are often cut). Total shares × par value ≠ registered capital blocks acceptance when all three are present. An objectives count that differs from the listed objectives is non-blocking. A signing authority naming a person who is not among the directors is non-blocking.
5. **Address.** A printed address that does not resolve to the subdistrict is `geo_mismatch` and blocks acceptance; no printed address at all is `missing` (version tier), as for any other fact.
6. **Resolutions:** `fixed` (automatic, when re-validation no longer finds the problem), `confirmed` (a person says the value is right), `dismissed` (a person says it does not apply; a note is required). `missing` can only be fixed by supplying the fact. A resolved exception does not reopen while its signature (the value or confidence it was raised on) is unchanged; a changed value reopens it. Resolved rows are kept as labelled data (§5.5).
7. **Routing** is the in-app queue (`/admin/exceptions`, RLS-scoped: a manager sees their team's records, the Owner all) plus a count on the staff home. No Telegram/email for exceptions in P17c.
8. **Confirmation replaced.** The manual *Confirm* button goes; *Check again* re-runs validation; acceptance is automatic the moment nothing blocks it. D80's `autoConfirmIfClean` and its tests are replaced by `validateRecord`; `confirmed_automatically` now means "accepted with no person acting" (a cron read, as opposed to a staff save). The two DB confirm constraints stay as a belt. `confirmDbdRecord`, `IncompleteRecordError`, `missingFieldsForConfirmation` and `CONFIRMATION_REQUIRED_FIELDS` are removed.
9. **Gating applies to new activations.** A record's existing active version stays active; a changed sheet with open blockers waits as a `draft` and learners stay on the old version. A record that has never had a version — including any production record not visited since P17b — now needs a complete, clean sheet before its learners can start a quiz, exam or interview; the queue lists what each one lacks. (This is the behaviour D74 asks for; it is the one consequence you may feel in the pilot.)
10. **`render_failure`** exists in the table's kinds for P17d/P17e; nothing raises it yet.

**Out of scope:** the new flow and readiness gates (P17e), notifications for exceptions, tuning extraction from the labelled data.

**Merge note:** PRs #4 (D82) and #5 (D83) are open; P17c touches the staff nav, the hub, messages, the record page and the companies table, so whichever lands second needs a merge.

---

## File map

| File | Responsibility |
| --- | --- |
| `supabase/migrations/20261003010000_training_fact_exceptions.sql` | The exception table, RLS, audit; the two policy keys; `activate_training_version` drops a draft before activating |
| `lib/domain/validation/juristic-id.ts` | Check digit: validate, compute, `withCheckDigit` |
| `lib/domain/validation/validators.ts` | `validateFacts` — pure: findings from a record, its structured data, address, sheet, provenance and thresholds |
| `lib/db/validation.ts` | `validateRecord` (upsert / auto-resolve / accept / sync), `resolveException`, `validateAfterChange`, `listOpenExceptions`, `listExceptionQueue`, `readingFinished` |
| `lib/db/training-versions.ts` | `countOpenBlockers`, the draft path in `syncTrainingVersion` |
| `lib/db/pinning.ts` | The lazy first pin validates (and so syncs) instead of syncing blind |
| `lib/config/policy-defaults.ts`, `policy-schema.ts` | The two thresholds |
| `app/[locale]/(admin)/admin/dbd-records/actions.ts`, `app/api/cron/index/route.ts` | Hooks: validate after every change; *Check again*; resolve actions |
| `app/[locale]/(admin)/admin/dbd-records/[id]/exceptions-panel.tsx`, `record-tools.tsx`, `page.tsx`, `training-versions-panel.tsx` | Record page: the exceptions, the acceptance state, "waiting on n" |
| `app/[locale]/(admin)/admin/exceptions/page.tsx` | The queue |
| `components/staff/staff-nav.tsx`, `app/[locale]/(admin)/admin/page.tsx` | Nav item and hub card with the count |
| `lib/integrations/extraction/fake.ts`, `scripts/fix-fixture-ids.mjs`, test helpers | Fixtures: valid ids, resolvable address |
| Removed | `lib/db/auto-confirm.ts`, `tests/integration/auto-confirm.test.ts`; `autoConfirmVerdict` from `lib/domain/auto-confirm.ts` |
| Tests | `tests/unit/domain/validation/*.test.ts`, `tests/integration/exceptions.db.test.ts`, `tests/integration/validation.test.ts`, `tests/e2e/validation.spec.ts`; P17b suites adapted |

---

## Task 1: The exception table, the policy keys, the draft-aware activation

**Files:**
- Create: `supabase/migrations/20261003010000_training_fact_exceptions.sql`
- Modify: `lib/db/database.types.ts` (regenerated), `lib/config/policy-defaults.ts`, `lib/config/policy-schema.ts`, `messages/{th,en,zh}.json`
- Test: `tests/integration/exceptions.db.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/exceptions.db.test.ts
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

const ROW = {
  kind: 'low_confidence',
  field: 'registered_capital',
  blocks: 'acceptance',
  detail: { confidence: 0.6, signature: 'registered_capital:0.6' },
};

/** The exception queue's own rules (spec §5.5, §6): one open row per problem, resolutions are explicit. */
describe('training_fact_exceptions', () => {
  let team: Team;
  let other: Team;
  let rowId: string;
  beforeAll(async () => {
    [team, other] = await Promise.all([seedTeam('ข้อยกเว้น'), seedTeam('ทีมอื่นข้อยกเว้น')]);
    await confirmRecord(team.recordId, team.manager.id);
  });
  afterAll(async () => {
    await svc.from('training_fact_exceptions').delete().eq('dbd_record_id', team.recordId);
    await Promise.all([deleteTeam(team), deleteTeam(other)]);
  });

  it('holds one open row per record, kind and field', async () => {
    const { data, error } = await svc
      .from('training_fact_exceptions')
      .insert({ ...ROW, dbd_record_id: team.recordId } as never)
      .select('id')
      .single();
    if (error) throw error;
    rowId = data.id;
    const dup = await svc
      .from('training_fact_exceptions')
      .insert({ ...ROW, dbd_record_id: team.recordId } as never);
    expect(dup.error?.code).toBe('23505');
    const badKind = await svc
      .from('training_fact_exceptions')
      .insert({ ...ROW, kind: 'typo', field: 'x', dbd_record_id: team.recordId } as never);
    expect(badKind.error?.code).toBe('23514');
  });

  it('is resolved only with a resolution and a time', async () => {
    const half = await svc
      .from('training_fact_exceptions')
      .update({ status: 'resolved' })
      .eq('id', rowId);
    expect(half.error?.code).toBe('23514');
    const full = await svc
      .from('training_fact_exceptions')
      .update({ status: 'resolved', resolution: 'confirmed', resolved_at: new Date().toISOString() })
      .eq('id', rowId);
    expect(full.error).toBeNull();
    // A resolved row no longer holds the slot: the same problem may open again.
    const again = await svc
      .from('training_fact_exceptions')
      .insert({ ...ROW, dbd_record_id: team.recordId } as never)
      .select('id')
      .single();
    expect(again.error).toBeNull();
  });

  it('is read and resolved by the Owner and the owning manager, never by learners or anonymous', async () => {
    const mine = await team.asManager
      .from('training_fact_exceptions')
      .select('id')
      .eq('dbd_record_id', team.recordId);
    expect(mine.data!.length).toBe(2);
    const theirs = await other.asManager
      .from('training_fact_exceptions')
      .select('id')
      .eq('dbd_record_id', team.recordId);
    expect(theirs.data).toEqual([]);
    const learner = await (await clientFor(team.learner)).from('training_fact_exceptions').select('id');
    expect(learner.data).toEqual([]);
    expect((await anonClient().from('training_fact_exceptions').select('id')).data).toEqual([]);
    const insert = await team.asManager
      .from('training_fact_exceptions')
      .insert({ ...ROW, field: 'other', dbd_record_id: team.recordId } as never);
    expect(insert.error?.code).toBe('42501');
    const resolve = await team.asManager
      .from('training_fact_exceptions')
      .update({
        status: 'resolved',
        resolution: 'dismissed',
        note: 'ไม่เกี่ยว',
        resolved_by: team.manager.id,
        resolved_at: new Date().toISOString(),
      })
      .eq('dbd_record_id', team.recordId)
      .eq('status', 'open')
      .select('id');
    expect(resolve.error).toBeNull();
    expect(resolve.data).toHaveLength(1);
  });

  it('seeds the two thresholds', async () => {
    const { data } = await svc
      .from('policy_config')
      .select('key, value')
      .in('key', ['training_auto_accept_confidence_percent', 'training_review_confidence_percent'])
      .order('key');
    expect(data).toEqual([
      { key: 'training_auto_accept_confidence_percent', value: 95 },
      { key: 'training_review_confidence_percent', value: 75 },
    ]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/exceptions.db.test.ts`
Expected: FAIL — `training_fact_exceptions` does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20261003010000_training_fact_exceptions.sql
-- P17c: the exception queue (spec 2026-09-30 §5.5, §6; decision D74). Validators raise a row per
-- problem; a person resolves it under their own session (audited); a training version activates
-- only while nothing blocking is open. Resolved rows stay as labelled data.

create table public.training_fact_exceptions (
  id uuid primary key default gen_random_uuid(),
  dbd_record_id uuid not null references public.dbd_records (id) on delete cascade,
  kind text not null check (kind in
    ('missing', 'low_confidence', 'conflict', 'invalid', 'geo_mismatch', 'category_review', 'render_failure')),
  -- The fact, column or concept concerned, e.g. `juristic_id`, `shareholders.shares`.
  field text not null check (field ~ '^[a-z][a-z0-9_.:-]{0,79}$'),
  -- What the open row holds back (plan decision 1).
  blocks text not null check (blocks in ('acceptance', 'version', 'none')),
  detail jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolution text check (resolution in ('fixed', 'confirmed', 'dismissed')),
  note text check (note is null or char_length(note) <= 1000),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'resolved') = (resolution is not null)),
  check (status <> 'resolved' or resolved_at is not null),
  check (resolution is distinct from 'dismissed' or note is not null)
);

create unique index training_fact_exceptions_one_open
  on public.training_fact_exceptions (dbd_record_id, kind, field) where status = 'open';
create index training_fact_exceptions_record_idx
  on public.training_fact_exceptions (dbd_record_id, status);
create index training_fact_exceptions_open_idx
  on public.training_fact_exceptions (status, blocks, created_at) where status = 'open';

create trigger training_fact_exceptions_set_updated_at
  before update on public.training_fact_exceptions
  for each row execute function public.set_updated_at();
create trigger training_fact_exceptions_audit
  after insert or update or delete on public.training_fact_exceptions
  for each row execute function public.audit_row_change();

alter table public.training_fact_exceptions enable row level security;

-- The Owner and the owning team's manager read and resolve; validators insert with the service
-- role; learners see nothing (spec §6).
create policy "fact exceptions: admins and owning managers read"
  on public.training_fact_exceptions
  for select to authenticated
  using (
    exists (
      select 1 from public.dbd_records r
      where r.id = dbd_record_id
        and (public.is_admin() or (public.is_manager() and r.team_id = public.my_team()))
    )
  );
create policy "fact exceptions: admins and owning managers resolve"
  on public.training_fact_exceptions
  for update to authenticated
  using (
    exists (
      select 1 from public.dbd_records r
      where r.id = dbd_record_id
        and (public.is_admin() or (public.is_manager() and r.team_id = public.my_team()))
    )
  )
  with check (
    exists (
      select 1 from public.dbd_records r
      where r.id = dbd_record_id
        and (public.is_admin() or (public.is_manager() and r.team_id = public.my_team()))
    )
  );

-- The thresholds (spec §6): silent at or above the first, blocking below the second.
insert into public.policy_config (key, value)
values
  ('training_auto_accept_confidence_percent', '95'::jsonb),
  ('training_review_confidence_percent', '75'::jsonb)
on conflict (key) do nothing;

-- A sheet that waits on exceptions is kept as the record's draft (P17b's `draft` status);
-- activation replaces it. Same body as P17b's function, plus the draft deletion.
create or replace function public.activate_training_version(
  p_record_id uuid,
  p_facts jsonb,
  p_extras jsonb,
  p_provenance jsonb,
  p_coverage jsonb,
  p_complete boolean,
  p_hash text,
  p_source_updated_at timestamptz,
  p_actor uuid default null,
  p_at timestamptz default now()
)
returns uuid
language plpgsql
as $$
declare
  v_active uuid;
  v_active_hash text;
  v_no integer;
  v_id uuid;
begin
  perform 1 from public.dbd_records where id = p_record_id for update;
  select id, facts_hash into v_active, v_active_hash
    from public.company_training_versions
    where dbd_record_id = p_record_id and status = 'active';
  if v_active is not null and v_active_hash = p_hash then
    delete from public.company_training_versions
      where dbd_record_id = p_record_id and status = 'draft';
    return null;
  end if;
  if v_active is not null then
    update public.company_training_versions
      set status = 'superseded', superseded_at = p_at
      where id = v_active;
  end if;
  delete from public.company_training_versions
    where dbd_record_id = p_record_id and status = 'draft';
  select coalesce(max(version_no), 0) + 1 into v_no
    from public.company_training_versions
    where dbd_record_id = p_record_id;
  insert into public.company_training_versions (
    dbd_record_id, version_no, status, facts, extras, provenance, coverage,
    company_complete, facts_hash, source_updated_at, created_by, activated_at
  ) values (
    p_record_id, v_no, 'active', p_facts, p_extras, p_provenance, p_coverage,
    p_complete, p_hash, p_source_updated_at, p_actor, p_at
  ) returning id into v_id;
  update public.user_dbd_assignments
    set training_version_id = v_id
    where dbd_record_id = p_record_id and active and training_version_id is null;
  return v_id;
end;
$$;
```

(Only the function body changes; its grants from `20261002010000` stay in force.)

- [ ] **Step 4: The policy keys in code and in Settings**

`lib/config/policy-defaults.ts` — after `business_category_min_confidence_percent: 85 as number,` add:

```ts
  training_auto_accept_confidence_percent: 95 as number,
  training_review_confidence_percent: 75 as number,
```

`lib/config/policy-schema.ts` — copy the `business_category_min_confidence_percent` entry twice, renamed `training_auto_accept_confidence_percent` and `training_review_confidence_percent`, same shape (an integer 50–100).

`messages/*.json`, under `admin.settings.keys`:

- en: `"training_auto_accept_confidence_percent": { "label": "Training facts: confidence read as certain (%)", "help": "An extracted fact at or above this raises nothing. Below it, a low-confidence exception is listed for review." }`, `"training_review_confidence_percent": { "label": "Training facts: confidence below which a person must confirm (%)", "help": "Below this, the exception blocks acceptance of the record until a person confirms the value." }`
- th: `"training_auto_accept_confidence_percent": { "label": "ข้อมูลสำหรับฝึก: ความมั่นใจที่ถือว่าแน่นอน (%)", "help": "ข้อมูลที่อ่านได้ตั้งแต่ระดับนี้ขึ้นไปจะไม่แจ้งอะไร ต่ำกว่านี้จะเป็นข้อยกเว้นให้ตรวจ" }`, `"training_review_confidence_percent": { "label": "ข้อมูลสำหรับฝึก: ความมั่นใจต่ำกว่านี้ต้องให้คนยืนยัน (%)", "help": "ต่ำกว่าระดับนี้ ข้อยกเว้นจะกันไม่ให้รับรองข้อมูลจนกว่าจะมีคนยืนยันค่า" }`
- zh: `"training_auto_accept_confidence_percent": { "label": "培训信息：视为确定的置信度（%）", "help": "提取结果达到或高于此值不会提示；低于此值会列为待复核的例外。" }`, `"training_review_confidence_percent": { "label": "培训信息：低于此置信度须人工确认（%）", "help": "低于此值的例外会阻止记录被接受，直到有人确认该值。" }`

- [ ] **Step 5: Apply, regenerate, test**

Run: `pnpm db:reset && pnpm db:types && pnpm exec prettier --write lib/db/database.types.ts messages && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/exceptions.db.test.ts tests/integration/settings.test.ts && pnpm exec vitest run --config vitest.config.ts tests/unit/messages.test.ts && pnpm typecheck`
Expected: 4 passed; settings and messages pass; clean.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261003010000_training_fact_exceptions.sql lib/db/database.types.ts lib/config messages tests/integration/exceptions.db.test.ts
git commit -m "feat(validation): the exception queue, the two thresholds, draft-aware activation (P17c, D74)"
```

---

## Task 2: The check digit, and every fictional id made valid

**Files:**
- Create: `lib/domain/validation/juristic-id.ts`, `scripts/fix-fixture-ids.mjs`
- Modify: every test and fixture holding an invalid id (the script lists them), `lib/integrations/extraction/fake.ts`, `tests/integration/helpers.ts`
- Test: `tests/unit/domain/validation/juristic-id.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/domain/validation/juristic-id.test.ts
import { describe, expect, it } from 'vitest';
import {
  isValidJuristicId,
  juristicIdCheckDigit,
  withCheckDigit,
} from '@/lib/domain/validation/juristic-id';

describe('Thai registration numbers (spec §5.5)', () => {
  it('computes the mod-11 check digit', () => {
    expect(juristicIdCheckDigit('010556823370')).toBe(4);
    expect(juristicIdCheckDigit('045556900080')).toBe(8);
    expect(withCheckDigit('010556900012')).toBe('0105569000126');
  });

  it('accepts a correct digit and refuses everything else', () => {
    expect(isValidJuristicId('0105568233704')).toBe(true);
    expect(isValidJuristicId('0105568233705')).toBe(false);
    expect(isValidJuristicId('010556823370')).toBe(false);
    expect(isValidJuristicId('0105568233704 ')).toBe(false);
    expect(isValidJuristicId(null)).toBe(false);
  });

  it('refuses to extend anything but twelve digits', () => {
    expect(() => withCheckDigit('123')).toThrow();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/validation/juristic-id.test.ts`
Expected: FAIL — cannot resolve `@/lib/domain/validation/juristic-id`.

- [ ] **Step 3: The module**

```ts
// lib/domain/validation/juristic-id.ts
/**
 * Thai 13-digit registration numbers — juristic persons and citizens alike — end in a mod-11
 * check digit over the first twelve, weighted 13 down to 2 (spec §5.5: "format and check digit").
 */
export function juristicIdCheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) throw new Error('A check digit needs exactly twelve digits');
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (13 - i);
  return (11 - (sum % 11)) % 10;
}

export function isValidJuristicId(id: string | null | undefined): boolean {
  if (!id || !/^\d{13}$/.test(id)) return false;
  return juristicIdCheckDigit(id.slice(0, 12)) === Number(id[12]);
}

/** A valid id from any twelve digits (fixtures and tests). */
export function withCheckDigit(first12: string): string {
  return first12 + juristicIdCheckDigit(first12);
}
```

- [ ] **Step 4: The fixture script**

```js
// scripts/fix-fixture-ids.mjs
// Gives every fictional 13-digit id in tests and the fake extractor a valid check digit (P17c).
// Keeps the first twelve digits where possible; when the valid id would collide with another id
// in use, bumps the twelfth digit until it is unique. Idempotent. Run: node scripts/fix-fixture-ids.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const check = (first12) => {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (13 - i);
  return (11 - (sum % 11)) % 10;
};
const valid = (id) => check(id.slice(0, 12)) === Number(id[12]);
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
// The validators' own tests hold deliberately invalid ids: leave them alone.
const files = [...walk('tests'), ...walk('lib/integrations/extraction')].filter(
  (f) => /.(ts|tsx|mts)$/.test(f) && !f.includes(join('tests', 'unit', 'domain', 'validation')),
);
const used = new Set();
const invalid = new Set();
for (const f of files) {
  for (const m of readFileSync(f, 'utf8').matchAll(/\b(\d{13})\b/g)) {
    used.add(m[1]);
    if (!valid(m[1])) invalid.add(m[1]);
  }
}
const mapping = new Map();
for (const id of invalid) {
  let prefix = BigInt(id.slice(0, 12));
  let candidate;
  do {
    const p = prefix.toString().padStart(12, '0');
    candidate = p + check(p);
    prefix += 1n;
  } while (used.has(candidate) || [...mapping.values()].includes(candidate));
  mapping.set(id, candidate);
}
for (const f of files) {
  let s = readFileSync(f, 'utf8');
  let changed = false;
  for (const [from, to] of mapping) {
    if (s.includes(from)) {
      s = s.split(from).join(to);
      changed = true;
    }
  }
  if (changed) {
    writeFileSync(f, s);
    console.log('fixed', relative('.', f));
  }
}
for (const [from, to] of mapping) console.log(`${from} -> ${to}`);
```

Run: `node scripts/fix-fixture-ids.mjs`
Expected: a line per changed file and the mapping (20 ids). Running it again prints nothing.

Then in `tests/integration/helpers.ts`, `confirmRecord` mints a valid id: add `import { withCheckDigit } from '@/lib/domain/validation/juristic-id';` and replace

```ts
      juristic_id: String(Date.now()).padStart(13, '0').slice(-13),
```

with

```ts
      juristic_id: withCheckDigit(String(Date.now()).padStart(12, '0').slice(-12)),
```

- [ ] **Step 5: The fake extractor's company is real enough to resolve**

In `lib/integrations/extraction/fake.ts`:

- `head_office_address.value` → `'เลขที่ 99/9 หมู่ที่ 1 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด'`, `confidence: 0.78`, `source_text: 'สำนักงานแห่งใหญ่ ตั้งอยู่เลขที่ 99/9 หมู่ที่ 1'`.
- `province` → `{ value: 'ร้อยเอ็ด', confidence: 0.7, source_text: 'จังหวัดร้อยเอ็ด', ...at(1) }`.
- In `fakePageText(1)` the address line → `'สำนักงานแห่งใหญ่ ตั้งอยู่เลขที่ 99/9 หมู่ที่ 1 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด'`.

(The juristic id was already rewritten by the script, in both `SAMPLE_EXTRACTION` and `fakePageText`.)

- [ ] **Step 6: Run the suites the fixtures touch**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/validation/juristic-id.test.ts tests/unit/domain/extraction-merge.test.ts tests/unit/domain/assessment.test.ts tests/unit/domain/name-card.test.ts && pnpm test:integration && pnpm typecheck && pnpm lint`
Expected: all pass (the ids changed value only; `lowConfidence` still lists `head_office_address` and `province`).

- [ ] **Step 7: Commit**

```bash
git add lib/domain/validation/juristic-id.ts scripts/fix-fixture-ids.mjs lib/integrations/extraction/fake.ts tests
git commit -m "feat(validation): the registration-number check digit; every fictional id made valid (P17c)"
```

---

## Task 3: The validators

**Files:**
- Create: `lib/domain/validation/validators.ts`
- Test: `tests/unit/domain/validation/validators.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/domain/validation/validators.test.ts
import { describe, expect, it } from 'vitest';
import { EMPTY_INTERVIEW_PROFILE } from '@/lib/domain/bank-interview';
import { EMPTY_BUSINESS_PROFILE, type StructuredData } from '@/lib/domain/dbd-profile';
import { buildFactSheet } from '@/lib/domain/facts/fact-sheet';
import type { RegisteredAddress } from '@/lib/domain/geo/resolve';
import {
  validateFacts,
  type Finding,
  type ValidationRecord,
} from '@/lib/domain/validation/validators';

const resolved: RegisteredAddress = {
  full: 'เลขที่ 87 หมู่ที่ 9 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด',
  house_no: '87',
  moo: '9',
  road: null,
  subdistrict: 'หนองใหญ่',
  district: 'โพนทอง',
  province: 'ร้อยเอ็ด',
  postcode: '45110',
  province_id: 33,
  district_id: 4507,
  subdistrict_id: 450705,
  postcode_source: 'geography',
  status: 'resolved',
  issues: [],
};

const record: ValidationRecord = {
  company_name_th: 'บริษัท ตรวจสอบ จำกัด',
  company_name_en: null,
  juristic_id: '0105568233704',
  registered_on: '2026-04-16',
  issued_on: '2026-08-05',
  registered_capital: 2_000_000,
  objectives_count: 3,
  directors: [{ name_th: 'นางสาวกุลธิดา พลเยี่ยม', name_en: null }],
  signing_authority: 'กรรมการหนึ่งคนลงลายมือชื่อและประทับตราสำคัญของบริษัท',
  head_office_address: resolved.full,
};

const structured: StructuredData = {
  business: {
    ...EMPTY_BUSINESS_PROFILE,
    objectives: [
      { no: 1, text: 'ค้าเสื้อผ้า' },
      { no: 2, text: 'นำเข้า' },
      { no: 3, text: 'ที่ปรึกษา' },
    ],
    shareholders: [
      { name: 'นางสาวกุลธิดา พลเยี่ยม', nationality: null, shares: 18_000, percent: 90 },
      { name: 'นายสมชาย ใจดี', nationality: null, shares: 2_000, percent: 10 },
    ],
    share_structure: { total_shares: 20_000, par_value: 100, paid_up_capital: null, share_type: null },
  },
  interview: {
    ...EMPTY_INTERVIEW_PROFILE,
    contact_email: 'info@x.co.th',
    contact_phone: '02-000-0000',
    nature_of_business: 'ค้าส่งเสื้อผ้า',
    products_services: 'เสื้อผ้าสตรี',
    business_purpose: 'จำหน่ายเสื้อผ้า',
    main_clients: 'ร้านค้าปลีก',
    client_origin: 'ออนไลน์',
    main_suppliers: 'โรงงาน',
    business_address: 'ร้อยเอ็ด',
    monthly_revenue: '300,000',
    revenue_basis: 'ลูกค้า 30 ราย',
    average_transaction: '10,000',
    monthly_transactions: '30',
    source_of_funds: 'เงินออม',
    first_incoming_funds: 'ทุนจดทะเบียน',
    account_purpose: 'รับชำระ',
    promptpay_qr_purpose: 'สะดวก',
    customer_examples: 'ร้านบุษบา',
    customer_profile: 'ค้าปลีก',
    transaction_details: 'โอน',
    operations_started: 'yes',
    has_existing_customers: 'yes',
    has_completed_transactions: 'yes',
    has_regular_suppliers: 'yes',
  },
  category: {
    key: 'clothing_fashion',
    candidate_key: null,
    confidence: 0.95,
    source: 'auto',
    status: 'mapped',
    model: null,
    input_hash: 'h',
    error: null,
    decided_at: null,
  },
  provenance: {},
  address: resolved,
};

const thresholds = { autoAcceptPercent: 95, reviewPercent: 75 };
const TODAY = '2026-10-01';

function run(patch: {
  record?: Partial<typeof record>;
  structured?: Partial<StructuredData>;
  address?: RegisteredAddress;
}): Finding[] {
  const r = { ...record, ...patch.record };
  const s = { ...structured, ...patch.structured };
  const a = patch.address ?? resolved;
  return validateFacts({
    record: r,
    structured: s,
    address: a,
    facts: buildFactSheet({ record: r, structured: s, address: a, role: null }),
    thresholds,
    today: TODAY,
  });
}
const keys = (f: Finding[]) => f.map((x) => `${x.kind}:${x.field}:${x.blocks}`).sort();

describe('validateFacts (spec §5.5)', () => {
  it('finds nothing wrong with a clean, complete record', () => {
    expect(run({})).toEqual([]);
  });

  it('refuses a bad check digit and dates out of order or in the future', () => {
    expect(keys(run({ record: { juristic_id: '0105568233705' } }))).toEqual([
      'invalid:juristic_id:acceptance',
    ]);
    expect(keys(run({ record: { issued_on: '2026-04-01' } }))).toEqual([
      'invalid:issued_on:acceptance',
    ]);
    expect(keys(run({ record: { issued_on: '2027-01-01' } }))).toEqual([
      'invalid:issued_on:acceptance',
    ]);
  });

  it('reconciles shares, percents and capital; a short list is only a note', () => {
    const over = run({
      structured: {
        business: {
          ...structured.business!,
          shareholders: [
            { name: 'ก', nationality: null, shares: 15_000, percent: 60 },
            { name: 'ข', nationality: null, shares: 15_000, percent: 60 },
          ],
        },
      },
    });
    expect(keys(over)).toEqual([
      'conflict:shareholders.percent:acceptance',
      'conflict:shareholders.shares:acceptance',
    ]);
    const under = run({
      structured: {
        business: {
          ...structured.business!,
          shareholders: [{ name: 'ก', nationality: null, shares: 15_000, percent: 75 }],
        },
      },
    });
    expect(keys(under)).toEqual(['conflict:shareholders.percent:none', 'conflict:shareholders.shares:none']);
    expect(keys(run({ record: { registered_capital: 1_500_000 } }))).toEqual([
      'conflict:registered_capital:acceptance',
    ]);
    expect(run({ record: { registered_capital: 1_500_000 } })[0]!.detail).toMatchObject({
      expected: 2_000_000,
      actual: 1_500_000,
    });
  });

  it('notes an objectives count that differs from the list, and a signer who is no director', () => {
    expect(keys(run({ record: { objectives_count: 14 } }))).toEqual(['conflict:objectives_count:none']);
    expect(
      keys(run({ record: { signing_authority: 'นายสมชาย ใจดี ลงลายมือชื่อและประทับตรา' } })),
    ).toEqual(['conflict:signing_authority:none']);
    expect(
      run({ record: { signing_authority: 'นางสาวกุลธิดา พลเยี่ยม ลงลายมือชื่อ' } }),
    ).toEqual([]);
  });

  it('blocks acceptance on an address that does not resolve, and the version on a missing one', () => {
    const partial = { ...resolved, status: 'partial' as const, issues: ['district_not_found' as const] };
    expect(keys(run({ address: partial }))).toEqual(['geo_mismatch:head_office_address:acceptance']);
    const none: RegisteredAddress = {
      ...resolved,
      full: '',
      house_no: null,
      moo: null,
      subdistrict: null,
      district: null,
      province: null,
      postcode: null,
      province_id: null,
      district_id: null,
      subdistrict_id: null,
      postcode_source: null,
      status: 'unresolved',
      issues: ['no_address'],
    };
    expect(keys(run({ record: { head_office_address: null }, address: none }))).toEqual([
      'missing:address:version',
    ]);
  });

  it('tiers missing facts: the certificate facts and the four answers block acceptance, the rest the version', () => {
    const f = run({
      record: { juristic_id: null, issued_on: null },
      structured: {
        interview: { ...structured.interview!, contact_phone: null, products_services: null, monthly_revenue: null, has_existing_customers: null },
      },
    });
    expect(keys(f)).toEqual([
      'missing:contact_phone:acceptance',
      'missing:has_existing_customers:version',
      'missing:issued_on:version',
      'missing:juristic_id:acceptance',
      'missing:monthly_revenue:version',
      'missing:products_services:acceptance',
    ]);
    expect(f.find((x) => x.field === 'monthly_revenue')!.detail).toMatchObject({
      concepts: ['monthly_revenue'],
    });
  });

  it('weighs extraction confidence on the fields the sheet reads: silent, review, or a person', () => {
    const f = run({
      structured: {
        provenance: {
          juristic_id: { confidence: 0.98, source_page: 1, source_document: 1 },
          registered_capital: { confidence: 0.9, source_page: 1, source_document: 1 },
          directors: { confidence: 0.6, source_page: 1, source_document: 1 },
          registrar_name: { confidence: 0.1, source_page: 1, source_document: 1 },
        },
      },
    });
    expect(keys(f)).toEqual(['low_confidence:directors:acceptance', 'low_confidence:registered_capital:none']);
    expect(f.find((x) => x.field === 'directors')!.detail).toMatchObject({
      confidence: 0.6,
      signature: 'directors:0.6',
    });
  });

  it('flags a category that needs a person, never blocking', () => {
    const f = run({
      structured: {
        category: { ...structured.category!, status: 'needs_review', key: null, candidate_key: 'furniture_home', confidence: 0.6 },
      },
    });
    expect(keys(f)).toEqual(['category_review:business_category:none']);
    expect(run({ structured: { category: null } })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/validation/validators.test.ts`
Expected: FAIL — cannot resolve `@/lib/domain/validation/validators`.

- [ ] **Step 3: The module**

```ts
// lib/domain/validation/validators.ts
import { REQUIRED_INTERVIEW_FIELDS, EMPTY_INTERVIEW_PROFILE } from '@/lib/domain/bank-interview';
import { conceptCoverage } from '@/lib/domain/concepts/resolve';
import { EMPTY_BUSINESS_PROFILE, type StructuredData } from '@/lib/domain/dbd-profile';
import type { Director } from '@/lib/domain/dbd-record';
import type { FactKey, FactSheet } from '@/lib/domain/facts/fact-sheet';
import type { RegisteredAddress } from '@/lib/domain/geo/resolve';
import { isValidJuristicId } from './juristic-id';

export const EXCEPTION_KINDS = [
  'missing',
  'low_confidence',
  'conflict',
  'invalid',
  'geo_mismatch',
  'category_review',
  'render_failure',
] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

/** What an open exception holds back (plan decision 1). */
export type Blocks = 'acceptance' | 'version' | 'none';

export type Finding = {
  kind: ExceptionKind;
  field: string;
  blocks: Blocks;
  /** Always carries `signature`: the value the problem was raised on, so a resolution sticks to it. */
  detail: Record<string, unknown> & { signature: string };
};

export type ValidationThresholds = { autoAcceptPercent: number; reviewPercent: number };

export type ValidationRecord = {
  company_name_th: string | null;
  company_name_en: string | null;
  juristic_id: string | null;
  registered_on: string | null;
  issued_on: string | null;
  registered_capital: number | null;
  objectives_count: number | null;
  directors: unknown;
  signing_authority: string | null;
  head_office_address: string | null;
};

export type ValidationInput = {
  record: ValidationRecord;
  structured: StructuredData;
  address: RegisteredAddress;
  /** The company-scope sheet (`buildFactSheet` with no role). */
  facts: FactSheet;
  thresholds: ValidationThresholds;
  /** ISO date in Bangkok. */
  today: string;
};

/** Extracted fields whose confidence is weighed: the ones the sheet reads (plan decision 2). */
export const CONFIDENCE_FIELDS = [
  'company_name_th',
  'company_name_en',
  'juristic_id',
  'registered_on',
  'issued_on',
  'registered_capital',
  'directors',
  'signing_authority',
  'head_office_address',
  'shareholders',
  'share_structure',
  'objectives',
] as const;

/** Missing facts that hold back acceptance — today's bar (D58); every other missing fact holds back the version. */
const ACCEPTANCE_FACTS: ReadonlySet<string> = new Set<FactKey | string>([
  'company_name_th',
  'juristic_id',
  'nature_of_business',
  'products_services',
]);

const TITLE = /^(นางสาว|นาง|นาย)\s*/;

/**
 * The deterministic validators (spec §5.5): hard rules first, then resolvability, then the
 * extraction's own confidence, then the category. Pure; the caller stores the findings.
 */
export function validateFacts(input: ValidationInput): Finding[] {
  const { record, structured, address, facts, thresholds, today } = input;
  const business = structured.business ?? EMPTY_BUSINESS_PROFILE;
  const interview = structured.interview ?? EMPTY_INTERVIEW_PROFILE;
  const out: Finding[] = [];
  const push = (kind: ExceptionKind, field: string, blocks: Blocks, detail: Record<string, unknown>, signature: string) =>
    out.push({ kind, field, blocks, detail: { ...detail, signature } });

  // 1. The registration number carries a check digit.
  if (record.juristic_id && !isValidJuristicId(record.juristic_id)) {
    push('invalid', 'juristic_id', 'acceptance', { rule: 'check_digit', value: record.juristic_id }, record.juristic_id);
  }

  // 2. Registration ≤ issue ≤ today.
  if (record.registered_on && record.registered_on > today) {
    push('invalid', 'registered_on', 'acceptance', { rule: 'in_future', value: record.registered_on }, record.registered_on);
  }
  if (record.issued_on && record.registered_on && record.issued_on < record.registered_on) {
    push('invalid', 'issued_on', 'acceptance', { rule: 'before_registration', value: record.issued_on, registered_on: record.registered_on }, `${record.issued_on}<${record.registered_on}`);
  } else if (record.issued_on && record.issued_on > today) {
    push('invalid', 'issued_on', 'acceptance', { rule: 'in_future', value: record.issued_on }, record.issued_on);
  }

  // 3. Shares and percents reconcile where the list is complete; a short list is only a note.
  const holders = business.shareholders;
  const total = business.share_structure.total_shares;
  if (holders.length > 0 && total !== null && holders.every((h) => h.shares !== null)) {
    const sum = holders.reduce((s, h) => s + (h.shares ?? 0), 0);
    if (sum > total) push('conflict', 'shareholders.shares', 'acceptance', { rule: 'shares_over_total', sum, total }, `${sum}/${total}`);
    else if (sum < total) push('conflict', 'shareholders.shares', 'none', { rule: 'shares_under_total', sum, total }, `${sum}/${total}`);
  }
  if (holders.length > 0 && holders.every((h) => h.percent !== null)) {
    const pct = Math.round(holders.reduce((s, h) => s + (h.percent ?? 0), 0) * 1000) / 1000;
    if (pct > 100.01) push('conflict', 'shareholders.percent', 'acceptance', { rule: 'percent_over_100', percent: pct }, String(pct));
    else if (pct < 99.99) push('conflict', 'shareholders.percent', 'none', { rule: 'percent_under_100', percent: pct }, String(pct));
  }

  // 4. Shares × par value is the registered capital.
  const par = business.share_structure.par_value;
  if (total !== null && par !== null && record.registered_capital !== null) {
    const expected = total * par;
    if (Math.abs(expected - record.registered_capital) > 0.5) {
      push('conflict', 'registered_capital', 'acceptance', { rule: 'shares_times_par', expected, actual: record.registered_capital }, `${expected}/${record.registered_capital}`);
    }
  }

  // 5. The objectives count against the list (lists are often partial: a note).
  if (record.objectives_count !== null && business.objectives.length > 0 && business.objectives.length !== record.objectives_count) {
    push('conflict', 'objectives_count', 'none', { rule: 'count_vs_list', count: record.objectives_count, listed: business.objectives.length }, `${record.objectives_count}/${business.objectives.length}`);
  }

  // 6. A signing authority that names someone names a director.
  const directors = Array.isArray(record.directors) ? (record.directors as Director[]) : [];
  if (record.signing_authority && directors.length > 0) {
    const named = record.signing_authority.match(/(นางสาว|นาง|นาย)\s*\S+/g) ?? [];
    const firstNames = directors.map((d) => d.name_th.replace(TITLE, '').split(/\s+/)[0]).filter(Boolean);
    if (named.length > 0 && !firstNames.some((n) => record.signing_authority!.includes(n))) {
      push('conflict', 'signing_authority', 'none', { rule: 'names_not_directors', named }, record.signing_authority);
    }
  }

  // 7. A printed address resolves to the subdistrict, or a person looks at it.
  const printed = record.head_office_address?.trim() ?? '';
  const addressUnresolved = printed.length > 0 && address.status !== 'resolved';
  if (addressUnresolved) {
    push('geo_mismatch', 'head_office_address', 'acceptance', { status: address.status, issues: address.issues }, printed);
  }

  // 8. Every company-level concept resolvable (§7.3), tiered (plan decision 1).
  const coverage = conceptCoverage(facts, 'company');
  for (const fact of coverage.missingFacts) {
    if (fact === 'address' && addressUnresolved) continue; // already a geo_mismatch
    const concepts = coverage.concepts.filter((c) => c.missing.includes(fact)).map((c) => c.key);
    push('missing', fact, ACCEPTANCE_FACTS.has(fact) ? 'acceptance' : 'version', { concepts }, 'missing');
  }
  for (const field of REQUIRED_INTERVIEW_FIELDS) {
    if (!interview[field]?.trim() && !coverage.missingFacts.includes(field as FactKey)) {
      push('missing', field, 'acceptance', { concepts: [] }, 'missing');
    }
  }
  if (!record.issued_on) push('missing', 'issued_on', 'version', { concepts: [] }, 'missing');

  // 9. The extraction's own confidence on the fields the sheet reads (plan decision 2).
  const provenance = structured.provenance ?? {};
  for (const field of CONFIDENCE_FIELDS) {
    const p = provenance[field];
    if (!p) continue;
    const percent = p.confidence * 100;
    if (percent >= thresholds.autoAcceptPercent) continue;
    push('low_confidence', field, percent < thresholds.reviewPercent ? 'acceptance' : 'none', { confidence: p.confidence, source_page: p.source_page, source_document: p.source_document }, `${field}:${p.confidence}`);
  }

  // 10. A category that needs a person: never blocking (D73).
  const category = structured.category ?? null;
  if (category && (category.status === 'needs_review' || (category.status === 'unmapped' && interview.nature_of_business))) {
    push('category_review', 'business_category', 'none', { status: category.status, candidate_key: category.candidate_key, confidence: category.confidence, error: category.error }, `${category.status}:${category.candidate_key ?? ''}:${category.input_hash ?? ''}`);
  }

  return out;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/validation/validators.test.ts && pnpm typecheck && pnpm lint`
Expected: 8 passed; clean. (If a `missing` ordering differs, the test sorts keys — only the set matters.)

- [ ] **Step 5: Commit**

```bash
git add lib/domain/validation/validators.ts tests/unit/domain/validation/validators.test.ts
git commit -m "feat(validation): the deterministic validators and their tiers (P17c, spec §5.5)"
```

---

## Task 4: `validateRecord` — exceptions, acceptance, the gated version

**Files:**
- Create: `lib/db/validation.ts`
- Modify: `lib/db/training-versions.ts` (`countOpenBlockers`, the draft path), `lib/db/pinning.ts` (lazy pin validates), `tests/integration/helpers.ts` (`COMPLETE_RECORD` gains `issued_on`)
- Test: `tests/integration/validation.test.ts`; `tests/integration/training-versions.test.ts` and `tests/integration/pinning.test.ts` adapted

- [ ] **Step 1: `COMPLETE_RECORD` gets an issue date** — in `tests/integration/helpers.ts` add `issued_on: '2026-08-05',` after `registered_on: '2026-04-16',`.

- [ ] **Step 2: Write the failing test**

```ts
// tests/integration/validation.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assignDbdRecord, getActiveAssignmentForUser } from '@/lib/db/assignments';
import { pinnedFactsFor } from '@/lib/db/pinning';
import { getActiveVersion, listVersions } from '@/lib/db/training-versions';
import {
  ValidationError,
  listOpenExceptions,
  resolveException,
  validateRecord,
} from '@/lib/db/validation';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import {
  COMPLETE_RECORD,
  COMPLETE_STRUCTURED,
  adminClient,
  completeRecord,
  deleteTeam,
  seedTeam,
  type Team,
} from './helpers';

const svc = adminClient();

async function record(id: string) {
  const { data } = await svc.from('dbd_records').select('*').eq('id', id).single();
  return data!;
}
const open = async (id: string) =>
  (await listOpenExceptions(svc, id)).map((e) => `${e.kind}:${e.field}:${e.blocks}`).sort();

describe('validateRecord (spec §5.5–5.6, D74)', () => {
  let team: Team;
  beforeAll(async () => {
    team = await seedTeam('ตรวจสอบ');
  });
  afterAll(async () => {
    await svc.from('user_dbd_assignments').delete().eq('dbd_record_id', team.recordId);
    await svc.from('company_training_versions').delete().eq('dbd_record_id', team.recordId);
    await svc.from('training_fact_exceptions').delete().eq('dbd_record_id', team.recordId);
    await deleteTeam(team);
  });

  it('lists what blocks acceptance on a bare record and accepts nothing', async () => {
    const result = (await validateRecord(svc, team.recordId, team.manager.id))!;
    expect(result.accepted).toBe(false);
    expect(result.version).toBe('blocked');
    const list = await open(team.recordId);
    expect(list).toContain('missing:juristic_id:acceptance');
    expect(list).toContain('missing:contact_email:acceptance');
    expect(list).toContain('missing:registered_on:version');
    expect((await record(team.recordId)).extraction_status).not.toBe('confirmed');
  });

  it('accepts the record once nothing blocks acceptance, and keeps the version as a draft', async () => {
    await svc
      .from('dbd_records')
      .update({
        juristic_id: '0105568233704',
        structured_data: {
          interview: {
            contact_email: 'info@x.co.th',
            contact_phone: '02-000-0000',
            nature_of_business: 'ค้าส่งเสื้อผ้า',
            products_services: 'เสื้อผ้าสตรี',
          },
        } as never,
      })
      .eq('id', team.recordId);
    const result = (await validateRecord(svc, team.recordId, team.manager.id))!;
    expect(result.accepted).toBe(true);
    expect(result.version).toBe('draft');
    const r = await record(team.recordId);
    expect(r.extraction_status).toBe('confirmed');
    expect(r.confirmed_by).toBe(team.manager.id);
    expect(r.confirmed_automatically).toBe(false);
    expect(await getActiveVersion(svc, team.recordId)).toBeNull();
    expect((await listVersions(svc, team.recordId)).map((v) => v.status)).toEqual(['draft']);
    const list = await open(team.recordId);
    expect(list.every((k) => k.endsWith(':version') || k.endsWith(':none'))).toBe(true);
    // The problems that went away were closed as fixed, and stay as data.
    const { data: fixed } = await svc
      .from('training_fact_exceptions')
      .select('field, resolution')
      .eq('dbd_record_id', team.recordId)
      .eq('status', 'resolved');
    expect(fixed).toContainEqual({ field: 'juristic_id', resolution: 'fixed' });
  });

  it('activates version 1 when the last blocking exception is resolved, and pins the waiting learner', async () => {
    await assignDbdRecord(team.asManager, { userId: team.learner.id, dbdRecordId: team.recordId });
    await completeRecord(team.recordId);
    const result = (await validateRecord(svc, team.recordId, null))!;
    expect(result.version).toBe('activated');
    expect(await open(team.recordId)).toEqual([]);
    const v1 = (await getActiveVersion(svc, team.recordId))!;
    expect(v1).toMatchObject({ version_no: 1, company_complete: true });
    expect((await listVersions(svc, team.recordId)).map((v) => v.status)).toEqual(['active']);
    const a = (await getActiveAssignmentForUser(svc, team.learner.id))!;
    expect(a.training_version_id).toBe(v1.id);
  });

  it('holds a changed sheet as a draft while a hard rule fails, and the learner stays on version 1', async () => {
    await svc.from('dbd_records').update({ registered_capital: 1_500_000 }).eq('id', team.recordId);
    const result = (await validateRecord(svc, team.recordId, null))!;
    expect(result.version).toBe('draft');
    expect(await open(team.recordId)).toEqual(['conflict:registered_capital:acceptance']);
    expect((await listVersions(svc, team.recordId)).map((v) => v.status).sort()).toEqual(['active', 'draft']);
    expect((await getActiveVersion(svc, team.recordId))!.version_no).toBe(1);
    const pinned = (await pinnedFactsFor(svc, (await getActiveAssignmentForUser(svc, team.learner.id))!))!;
    expect(pinned.snapshot.facts.registered_capital).toBe(COMPLETE_RECORD.registered_capital);
  });

  it('a person confirms the value: the exception closes, the draft becomes version 2, and it does not reopen', async () => {
    const [exception] = await listOpenExceptions(svc, team.recordId);
    const resolved = await resolveException(team.asManager, {
      exceptionId: exception!.id,
      resolution: 'confirmed',
      note: 'ตรวจกับหนังสือรับรองแล้ว',
      actorId: team.manager.id,
    });
    expect(resolved).toMatchObject({ status: 'resolved', resolution: 'confirmed', resolved_by: team.manager.id });
    expect((await validateRecord(svc, team.recordId, null))!.version).toBe('activated');
    expect((await getActiveVersion(svc, team.recordId))!.version_no).toBe(2);
    expect(await open(team.recordId)).toEqual([]);
    // Same value again: the confirmed resolution holds.
    expect((await validateRecord(svc, team.recordId, null))!.version).toBe('unchanged');
    expect(await open(team.recordId)).toEqual([]);
    // A different wrong value is a new problem.
    await svc.from('dbd_records').update({ registered_capital: 1_000_000 }).eq('id', team.recordId);
    await validateRecord(svc, team.recordId, null);
    expect(await open(team.recordId)).toEqual(['conflict:registered_capital:acceptance']);
    await svc.from('dbd_records').update({ registered_capital: COMPLETE_RECORD.registered_capital }).eq('id', team.recordId);
    await validateRecord(svc, team.recordId, null);
  });

  it('never lets a missing fact be dismissed', async () => {
    await svc
      .from('dbd_records')
      .update({
        structured_data: {
          ...COMPLETE_STRUCTURED,
          interview: { ...COMPLETE_STRUCTURED.interview, monthly_revenue: null },
        } as never,
      })
      .eq('id', team.recordId);
    await validateRecord(svc, team.recordId, null);
    const [missing] = await listOpenExceptions(svc, team.recordId);
    expect(missing).toMatchObject({ kind: 'missing', field: 'monthly_revenue' });
    await expect(
      resolveException(team.asManager, { exceptionId: missing!.id, resolution: 'dismissed', note: 'x', actorId: team.manager.id }),
    ).rejects.toBeInstanceOf(ValidationError);
    const structured = readStructuredData((await record(team.recordId)).structured_data);
    expect(structured.interview?.monthly_revenue).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/validation.test.ts`
Expected: FAIL — cannot resolve `@/lib/db/validation`.

- [ ] **Step 4: Versions wait on open blockers**

In `lib/db/training-versions.ts`:

Add after `countAssignmentsBehind`:

```ts
/** Open exceptions that hold back the version (plan decision 1): both tiers count. */
export async function countOpenBlockers(
  db: Db,
  recordId: string,
): Promise<{ acceptance: number; version: number }> {
  const { data, error } = await db
    .from('training_fact_exceptions')
    .select('blocks')
    .eq('dbd_record_id', recordId)
    .eq('status', 'open')
    .in('blocks', ['acceptance', 'version']);
  if (error) throw error;
  return {
    acceptance: data.filter((e) => e.blocks === 'acceptance').length,
    version: data.filter((e) => e.blocks === 'version').length,
  };
}
```

Change `export type SyncResult = 'not_found' | 'unconfirmed' | 'unchanged' | 'activated';` to include `| 'draft'`, and in `syncTrainingVersion`, between `if (active && active.facts_hash === hash) return 'unchanged';` and `const coverage = …`, insert:

```ts
  // A sheet with an open blocking exception waits as the record's draft (spec §5.6); the
  // learners stay on the active version until the last one is resolved.
  const blockers = await countOpenBlockers(admin, recordId);
  const coverage = conceptCoverage(snapshot.facts, 'company');
  if (blockers.acceptance + blockers.version > 0) {
    await upsertDraft(admin, recordId, {
      facts: snapshot.facts as unknown as Json,
      extras: snapshot.extras as unknown as Json,
      provenance: (structured.provenance ?? {}) as unknown as Json,
      coverage: { mcq: coverage.mcq, interview: coverage.interview, missingFacts: coverage.missingFacts } as unknown as Json,
      company_complete: isComplete(coverage),
      facts_hash: hash,
      source_updated_at: record.updated_at,
      created_by: actorId,
    });
    return 'draft';
  }
```

and delete the original `const coverage = conceptCoverage(snapshot.facts, 'company');` line that followed. Add the helper after `syncAfterChange`:

```ts
type DraftColumns = Pick<
  Database['public']['Tables']['company_training_versions']['Insert'],
  'facts' | 'extras' | 'provenance' | 'coverage' | 'company_complete' | 'facts_hash' | 'source_updated_at' | 'created_by'
>;

/** The record's one draft: the sheet as it would be activated, kept current for the panels. */
async function upsertDraft(admin: Db, recordId: string, columns: DraftColumns): Promise<void> {
  const { data: draft } = await admin
    .from('company_training_versions')
    .select('id')
    .eq('dbd_record_id', recordId)
    .eq('status', 'draft')
    .maybeSingle();
  if (draft) {
    const { error } = await admin.from('company_training_versions').update(columns).eq('id', draft.id);
    if (error) throw error;
    return;
  }
  const { data: last } = await admin
    .from('company_training_versions')
    .select('version_no')
    .eq('dbd_record_id', recordId)
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await admin.from('company_training_versions').insert({
    ...columns,
    dbd_record_id: recordId,
    version_no: (last?.version_no ?? 0) + 1,
    status: 'draft',
  });
  if (error) throw error;
}
```

Update the doc comment of `syncTrainingVersion`: replace "No blocking-exception gate yet — P17c adds it in front of the activation; the `draft` status waits for it." with "An open blocking exception keeps the sheet as a draft (P17c)."

- [ ] **Step 5: `lib/db/validation.ts`**

```ts
// lib/db/validation.ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPolicy } from '@/lib/config/policy';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import { buildFactSheet } from '@/lib/domain/facts/fact-sheet';
import { directReadMaxPages } from '@/lib/domain/rag/jobs';
import { todayInBangkok } from '@/lib/domain/thai-date';
import { validateFacts, type Finding } from '@/lib/domain/validation/validators';
import { createSupabaseAdminClient } from './admin';
import type { Database, Json } from './database.types';
import { getDbdRecord, listDbdDocuments } from './dbd-records';
import { currentAddress } from './derived-facts';
import { syncTrainingVersion, type SyncResult } from './training-versions';

type Db = SupabaseClient<Database>;
export type ExceptionRow = Database['public']['Tables']['training_fact_exceptions']['Row'];

export class ValidationError extends Error {
  constructor(public readonly code: 'not_found' | 'not_dismissable' | 'already_resolved' | 'note_required') {
    super(code);
    this.name = 'ValidationError';
  }
}

export type ValidateResult = {
  findings: number;
  opened: number;
  closed: number;
  accepted: boolean;
  version: SyncResult | 'blocked';
};

const signatureOf = (e: Pick<ExceptionRow, 'detail'>): string =>
  String((e.detail as { signature?: string } | null)?.signature ?? '');

/** The reading has finished: no extract/transcript job open, no oversized document still indexing (D80's rule). */
export async function readingFinished(db: Db, recordId: string): Promise<boolean> {
  const { count, error } = await db
    .from('index_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('record_id', recordId)
    .in('kind', ['extract', 'transcript'])
    .in('status', ['queued', 'running']);
  if (error) throw error;
  if ((count ?? 0) > 0) return false;
  const maxPages = directReadMaxPages();
  const indexing = (await listDbdDocuments(db, recordId)).filter(
    (d) => d.page_count !== null && d.page_count > maxPages && !['ready', 'failed', 'skipped'].includes(d.index_status),
  );
  return indexing.length === 0;
}

export async function listOpenExceptions(db: Db, recordId: string): Promise<ExceptionRow[]> {
  const { data, error } = await db
    .from('training_fact_exceptions')
    .select('*')
    .eq('dbd_record_id', recordId)
    .eq('status', 'open')
    .order('blocks')
    .order('created_at');
  if (error) throw error;
  return data;
}

/**
 * Runs the validators and keeps the queue true to them (spec §5.5): a new problem opens a row,
 * a vanished one closes as `fixed`, a resolved one stays closed while its signature holds. Then
 * accepts the record when nothing blocks acceptance and the reading has finished, and syncs the
 * version, which waits as a draft while anything blocking is open (§5.6). `admin` is the
 * service role; `actorId` names the staff member whose save this was, or null for the cron.
 */
export async function validateRecord(
  admin: Db,
  recordId: string,
  actorId: string | null,
  now: Date = new Date(),
): Promise<ValidateResult | null> {
  const record = await getDbdRecord(admin, recordId);
  if (!record) return null;
  const structured = readStructuredData(record.structured_data);
  const address = await currentAddress(admin, record, structured);
  const [autoAcceptPercent, reviewPercent] = await Promise.all([
    getPolicy('training_auto_accept_confidence_percent'),
    getPolicy('training_review_confidence_percent'),
  ]);
  const findings = validateFacts({
    record,
    structured,
    address,
    facts: buildFactSheet({ record, structured, address, role: null }),
    thresholds: { autoAcceptPercent, reviewPercent },
    today: todayInBangkok(now),
  });

  const { data: rows, error } = await admin
    .from('training_fact_exceptions')
    .select('*')
    .eq('dbd_record_id', recordId);
  if (error) throw error;
  const at = now.toISOString();
  const key = (kind: string, field: string) => `${kind}\u0000${field}`;
  const openByKey = new Map(rows.filter((r) => r.status === 'open').map((r) => [key(r.kind, r.field), r]));
  const settled = new Set(
    rows
      .filter((r) => r.status === 'resolved' && r.resolution !== 'fixed')
      .map((r) => `${key(r.kind, r.field)}\u0000${signatureOf(r)}`),
  );

  let opened = 0;
  const kept = new Set<string>();
  for (const f of findings) {
    const k = key(f.kind, f.field);
    const existing = openByKey.get(k);
    if (existing) {
      kept.add(k);
      if (signatureOf(existing) !== f.detail.signature || existing.blocks !== f.blocks) {
        const { error: updateError } = await admin
          .from('training_fact_exceptions')
          .update({ detail: f.detail as unknown as Json, blocks: f.blocks })
          .eq('id', existing.id);
        if (updateError) throw updateError;
      }
      continue;
    }
    if (f.kind !== 'missing' && settled.has(`${k}\u0000${f.detail.signature}`)) continue;
    const { error: insertError } = await admin.from('training_fact_exceptions').insert({
      dbd_record_id: recordId,
      kind: f.kind,
      field: f.field,
      blocks: f.blocks,
      detail: f.detail as unknown as Json,
    });
    if (insertError) throw insertError;
    opened += 1;
  }
  let closed = 0;
  for (const [k, row] of openByKey) {
    if (kept.has(k)) continue;
    const { error: closeError } = await admin
      .from('training_fact_exceptions')
      .update({ status: 'resolved', resolution: 'fixed', resolved_at: at })
      .eq('id', row.id);
    if (closeError) throw closeError;
    closed += 1;
  }

  // Acceptance (plan decision 8): nothing blocking, the reading done, someone to confirm on behalf of.
  const blocking = findings.filter((f) => f.blocks === 'acceptance');
  const stillOpen = [...openByKey.entries()].filter(([k, r]) => kept.has(k) && r.blocks === 'acceptance');
  let accepted = false;
  if (record.extraction_status !== 'confirmed' && blocking.length === 0 && stillOpen.length === 0) {
    const confirmedBy = actorId ?? record.created_by;
    if (confirmedBy && (await readingFinished(admin, recordId))) {
      const { data: updated, error: acceptError } = await admin
        .from('dbd_records')
        .update({
          extraction_status: 'confirmed',
          confirmed_by: confirmedBy,
          confirmed_at: at,
          confirmed_automatically: actorId === null,
        })
        .eq('id', recordId)
        .neq('extraction_status', 'confirmed')
        .select('id');
      if (acceptError) throw acceptError;
      accepted = (updated?.length ?? 0) > 0;
    }
  }

  const confirmed = accepted || record.extraction_status === 'confirmed';
  const version: ValidateResult['version'] = confirmed
    ? await syncTrainingVersion(admin, recordId, actorId, now)
    : 'blocked';
  return { findings: findings.length, opened, closed, accepted, version };
}

/** After a change that may have altered the facts: validation never fails the change itself. */
export async function validateAfterChange(recordId: string, actorId: string | null): Promise<void> {
  try {
    await validateRecord(createSupabaseAdminClient(), recordId, actorId);
  } catch (e) {
    console.error('validation', recordId, e);
  }
}

/**
 * A person settles an exception under their own client (RLS: the Owner or the owning manager;
 * the audit names them). A missing fact is supplied, never dismissed (plan decision 6).
 */
export async function resolveException(
  db: Db,
  args: { exceptionId: string; resolution: 'confirmed' | 'dismissed'; note: string | null; actorId: string; now?: Date },
): Promise<ExceptionRow> {
  const { data: row, error } = await db
    .from('training_fact_exceptions')
    .select('*')
    .eq('id', args.exceptionId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new ValidationError('not_found');
  if (row.status !== 'open') throw new ValidationError('already_resolved');
  if (row.kind === 'missing') throw new ValidationError('not_dismissable');
  const note = args.note?.trim() || null;
  if (args.resolution === 'dismissed' && !note) throw new ValidationError('note_required');
  const { data: updated, error: updateError } = await db
    .from('training_fact_exceptions')
    .update({
      status: 'resolved',
      resolution: args.resolution,
      note,
      resolved_by: args.actorId,
      resolved_at: (args.now ?? new Date()).toISOString(),
    })
    .eq('id', row.id)
    .select('*')
    .single();
  if (updateError) throw updateError;
  return updated;
}

export type QueueRow = ExceptionRow & {
  dbd_records: { company_name_th: string | null; team_id: string | null; extraction_status: string } | null;
};

/** Every open exception the caller may see (RLS), acceptance blockers first, oldest first. */
export async function listExceptionQueue(db: Db): Promise<QueueRow[]> {
  const { data, error } = await db
    .from('training_fact_exceptions')
    .select('*, dbd_records(company_name_th, team_id, extraction_status)')
    .eq('status', 'open')
    .order('blocks')
    .order('created_at');
  if (error) throw error;
  return data as QueueRow[];
}
```

- [ ] **Step 6: The lazy first pin validates**

In `lib/db/pinning.ts`, replace `import { getVersion, readSnapshot, syncTrainingVersion, type TrainingVersionRow } from './training-versions';` with

```ts
import { getVersion, readSnapshot, type TrainingVersionRow } from './training-versions';
import { validateRecord } from './validation';
```

and in `pinnedFactsFor` replace `await syncTrainingVersion(admin, assignment.dbd_record_id, null);` with `await validateRecord(admin, assignment.dbd_record_id, null);` and extend its comment: "…made now if the record is confirmed and nothing blocks its version (P17c)".

- [ ] **Step 7: Adapt the P17b suites to the gate**

`tests/integration/training-versions.test.ts` — the suite calls `syncTrainingVersion` on records with no exception rows, so the gate never fires there; only the fixture changed: `completeRecord` now sets `issued_on`. Run it unchanged.

`tests/integration/pinning.test.ts` — unchanged (`completeRecord` before any pin).

- [ ] **Step 8: Run**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/validation.test.ts tests/integration/training-versions.test.ts tests/integration/pinning.test.ts tests/integration/exceptions.db.test.ts && pnpm typecheck && pnpm lint`
Expected: validation 6 passed; the P17b suites pass; clean.

- [ ] **Step 9: Commit**

```bash
git add lib/db/validation.ts lib/db/training-versions.ts lib/db/pinning.ts tests/integration/helpers.ts tests/integration/validation.test.ts
git commit -m "feat(validation): validateRecord — exceptions kept true, acceptance when clean, versions wait as drafts (P17c, D74)"
```

---

## Task 5: Validation after every change; confirmation replaced

**Files:**
- Modify: `app/[locale]/(admin)/admin/dbd-records/actions.ts`, `app/api/cron/index/route.ts`
- Remove: `lib/db/auto-confirm.ts`, `tests/integration/auto-confirm.test.ts`; `autoConfirmVerdict`, `ReadingSnapshot`, `AutoConfirmVerdict` from `lib/domain/auto-confirm.ts` and their tests in `tests/unit/domain/auto-confirm.test.ts`
- Modify: `lib/db/dbd-records.ts` (remove `confirmDbdRecord`, `IncompleteRecordError`), `lib/domain/dbd-record.ts` (remove `CONFIRMATION_REQUIRED_FIELDS`, `missingFieldsForConfirmation`), `tests/integration/dbd-records.db.test.ts`, `tests/integration/dbd-records.rls.test.ts`

- [ ] **Step 1: The record actions** — in `app/[locale]/(admin)/admin/dbd-records/actions.ts`:

Replace `import { syncAfterChange } from '@/lib/db/training-versions';` with `import { ValidationError, resolveException, validateAfterChange, validateRecord } from '@/lib/db/validation';` and remove `confirmDbdRecord` from the `@/lib/db/dbd-records` import and `missingFieldsForConfirmation` from the `@/lib/domain/dbd-record` import.

In `deriveAfterSave`, replace `await syncAfterChange(id, actorId);` with `await validateAfterChange(id, actorId);` and update its comment: "…(spec §5.5): the exceptions follow, and so does acceptance and the version."

Replace the whole of `confirmDbdRecordAction` with:

```ts
/** "Check again" (plan decision 8): validation runs, and acceptance follows by itself when nothing blocks it. */
export async function recheckRecordAction(
  _prev: ToolState,
  formData: FormData,
): Promise<ToolState> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  const admin = await requireStaff(locale);
  const db = await createSupabaseServerClient();
  const record = await getDbdRecord(db, id);
  if (!record) return { ok: false, error: 'not-found' };
  try {
    const result = await validateRecord(createSupabaseAdminClient(), id, admin.id);
    revalidatePath(`/${locale}/admin/dbd-records/${id}`);
    if (!result) return { ok: false, error: 'not-found' };
    if (!result.accepted && record.extraction_status !== 'confirmed') {
      return { ok: false, error: 'blocked' };
    }
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** A person settles an exception on the record page (spec §5.5); the record is checked again at once. */
export async function resolveExceptionAction(
  _prev: ToolState,
  formData: FormData,
): Promise<ToolState> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  const exceptionId = String(formData.get('exceptionId') ?? '');
  const resolution = formData.get('resolution') === 'dismissed' ? 'dismissed' : 'confirmed';
  const note = String(formData.get('note') ?? '');
  const staff = await requireStaff(locale);
  try {
    await resolveException(await createSupabaseServerClient(), {
      exceptionId,
      resolution,
      note,
      actorId: staff.id,
    });
    await validateAfterChange(id, staff.id);
    revalidatePath(`/${locale}/admin/dbd-records/${id}`);
    revalidatePath(`/${locale}/admin/exceptions`);
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: e instanceof ValidationError ? e.code.replace(/_/g, '-') : errorMessage(e) };
  }
}
```

Add `import { createSupabaseAdminClient } from '@/lib/db/admin';` to the imports. In `setBusinessCategoryAction` and `remapBusinessCategoryAction`, replace `await syncAfterChange(id, staff.id);` with `await validateAfterChange(id, staff.id);`. Remove the `errorMessage` special case for `dbd_confirmed_requires_business_answers` only if nothing else can hit it — it can (the constraint stays), so leave it.

- [ ] **Step 2: The cron** — in `app/api/cron/index/route.ts`: replace the `autoConfirmIfClean` import with nothing, replace the `syncAfterChange` import with `import { validateAfterChange } from '@/lib/db/validation';`, replace both `await syncAfterChange(..., null);` calls with `await validateAfterChange(..., null);`, and replace the `afterReading` line with:

```ts
      // A record whose reading just finished is validated and, when clean, accepted (P17c).
      afterReading: (recordId) => validateAfterChange(recordId, null),
```

- [ ] **Step 3: Remove what validation replaces**

- Delete `lib/db/auto-confirm.ts` and `tests/integration/auto-confirm.test.ts`.
- In `lib/domain/auto-confirm.ts` keep only `CompanyStatus` and `companyStatus` (delete `ReadingSnapshot`, `RecordFacts`, `AutoConfirmVerdict`, `autoConfirmVerdict` and the `missingFieldsForConfirmation` import); in `tests/unit/domain/auto-confirm.test.ts` keep only the two `companyStatus` tests.
- In `lib/domain/dbd-record.ts` delete `CONFIRMATION_REQUIRED_FIELDS` and `missingFieldsForConfirmation` (and the now-unused `missingBusinessAnswers`/`InterviewProfile` imports if nothing else uses them).
- In `lib/db/dbd-records.ts` delete `IncompleteRecordError` and `confirmDbdRecord`.
- `tests/integration/dbd-records.db.test.ts` — replace the test `refuses confirmation naming what is missing, then confirms` with:

```ts
  it('is accepted by validation once the certificate facts and the four answers are there', async () => {
    const { validateRecord } = await import('@/lib/db/validation');
    const before = (await validateRecord(svc, recordId, admin.id))!;
    expect(before.accepted).toBe(false);
    await svc
      .from('dbd_records')
      .update({ juristic_id: '0105568233704', structured_data: CONFIRMED_ANSWERS as never })
      .eq('id', recordId);
    const after = (await validateRecord(svc, recordId, admin.id))!;
    expect(after.accepted).toBe(true);
  });
```

  (read the test's setup first: `svc`, `recordId`, `admin` and `CONFIRMED_ANSWERS` are the names it already uses or imports; adjust to what is there).
- `tests/integration/dbd-records.rls.test.ts` — `refuses confirmation while core fields are missing` tests the DB constraint directly (an update to `confirmed` without core fields → `23514`); keep it, it still holds.

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm exec vitest run --config vitest.config.ts tests/unit/domain/auto-confirm.test.ts && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/dbd-records.db.test.ts tests/integration/dbd-records.rls.test.ts tests/integration/extraction.test.ts tests/integration/transcript-extraction.test.ts tests/integration/validation.test.ts`
Expected: clean; all pass.

- [ ] **Step 5: Commit**

```bash
git add -A -- lib app tests
git commit -m "feat(validation): every change validates; acceptance by validation replaces confirmation (P17c, D74)"
```

---

## Task 6: The record page — exceptions, acceptance state, "waiting on"

**Files:**
- Create: `app/[locale]/(admin)/admin/dbd-records/[id]/exceptions-panel.tsx`
- Modify: `app/[locale]/(admin)/admin/dbd-records/[id]/record-tools.tsx`, `page.tsx`, `training-versions-panel.tsx`, `messages/{th,en,zh}.json`

- [ ] **Step 1: Messages** — add `exceptions` to `admin.dbd` (and replace `confirm`, `missingForConfirmation`, `answersMissing` with the new acceptance strings):

`messages/en.json` (in `admin.dbd`):
```json
"recheck": "Check again",
"acceptance": {
  "accepted": "Accepted by {name}",
  "acceptedAuto": "Accepted automatically: the reading was clean and the four details were there.",
  "waiting": "{count, plural, one {# exception} other {# exceptions}} blocking acceptance",
  "blocked": "Not accepted yet — settle the exceptions below."
},
"exceptions": {
  "title": "Exceptions",
  "intro": "What the validators found. A record is accepted when nothing blocks acceptance; its training version activates when nothing blocks the version. Notes are for review only.",
  "none": "Nothing open: the record is clean.",
  "groups": { "acceptance": "Blocking acceptance", "version": "Blocking the training version", "none": "For review" },
  "kinds": {
    "missing": "Missing",
    "low_confidence": "Low confidence",
    "conflict": "Does not reconcile",
    "invalid": "Invalid",
    "geo_mismatch": "Address not resolved",
    "category_review": "Category to review",
    "render_failure": "Question could not be rendered"
  },
  "rules": {
    "check_digit": "The check digit does not match ({value}).",
    "in_future": "The date is in the future ({value}).",
    "before_registration": "Issued ({value}) before the registration date ({registered_on}).",
    "shares_over_total": "The holders' shares add up to {sum}, more than the total of {total}.",
    "shares_under_total": "The holders' shares add up to {sum} of {total}; the list may be partial.",
    "percent_over_100": "The percentages add up to {percent}%.",
    "percent_under_100": "The percentages add up to {percent}%; the list may be partial.",
    "shares_times_par": "Shares × par value gives {expected}, the capital says {actual}.",
    "count_vs_list": "The certificate says {count} objectives; {listed} are listed.",
    "names_not_directors": "The signing authority names someone who is not a listed director.",
    "confidence": "Read with {confidence}% confidence (page {page}).",
    "geo": "{issues}",
    "missing": "Needed by: {concepts}",
    "category": "Best match {candidate} at {confidence}%; choose or map again on the category panel."
  },
  "confirmValue": "The value is right",
  "dismiss": "Does not apply",
  "note": "Note (required to dismiss)",
  "errors": {
    "not-dismissable": "A missing fact is supplied, not dismissed.",
    "already-resolved": "Already settled.",
    "note-required": "Write a note first.",
    "not-found": "Not found."
  }
}
```
`messages/th.json`:
```json
"recheck": "ตรวจอีกครั้ง",
"acceptance": {
  "accepted": "รับรองโดย {name}",
  "acceptedAuto": "รับรองอัตโนมัติ: การอ่านไม่พบปัญหาและมีข้อมูล 4 รายการครบ",
  "waiting": "มีข้อยกเว้น {count} รายการที่กันไม่ให้รับรอง",
  "blocked": "ยังไม่รับรอง — กรุณาจัดการข้อยกเว้นด้านล่าง"
},
"exceptions": {
  "title": "ข้อยกเว้น",
  "intro": "สิ่งที่ระบบตรวจพบ ข้อมูลจะได้รับการรับรองเมื่อไม่มีอะไรกันการรับรอง และรุ่นข้อมูลสำหรับฝึกจะใช้งานได้เมื่อไม่มีอะไรกันรุ่น หมายเหตุมีไว้เพื่อตรวจทานเท่านั้น",
  "none": "ไม่มีข้อยกเว้นค้าง: ข้อมูลเรียบร้อย",
  "groups": { "acceptance": "กันการรับรอง", "version": "กันรุ่นข้อมูลสำหรับฝึก", "none": "เพื่อตรวจทาน" },
  "kinds": {
    "missing": "ยังขาด",
    "low_confidence": "ความมั่นใจต่ำ",
    "conflict": "ไม่สอดคล้องกัน",
    "invalid": "ไม่ถูกต้อง",
    "geo_mismatch": "ที่อยู่ระบุไม่ได้",
    "category_review": "หมวดธุรกิจต้องตรวจ",
    "render_failure": "สร้างคำถามไม่ได้"
  },
  "rules": {
    "check_digit": "เลขตรวจสอบไม่ตรง ({value})",
    "in_future": "วันที่อยู่ในอนาคต ({value})",
    "before_registration": "ออกให้ ({value}) ก่อนวันจดทะเบียน ({registered_on})",
    "shares_over_total": "หุ้นของผู้ถือหุ้นรวม {sum} หุ้น มากกว่าทั้งหมด {total} หุ้น",
    "shares_under_total": "หุ้นของผู้ถือหุ้นรวม {sum} จาก {total} หุ้น รายการอาจไม่ครบ",
    "percent_over_100": "สัดส่วนรวม {percent}%",
    "percent_under_100": "สัดส่วนรวม {percent}% รายการอาจไม่ครบ",
    "shares_times_par": "หุ้น × มูลค่าหุ้น ได้ {expected} แต่ทุนจดทะเบียนระบุ {actual}",
    "count_vs_list": "หนังสือรับรองระบุวัตถุประสงค์ {count} ข้อ แต่มีในรายการ {listed} ข้อ",
    "names_not_directors": "อำนาจกรรมการระบุชื่อบุคคลที่ไม่อยู่ในรายชื่อกรรมการ",
    "confidence": "อ่านได้ด้วยความมั่นใจ {confidence}% (หน้า {page})",
    "geo": "{issues}",
    "missing": "ใช้โดย: {concepts}",
    "category": "ใกล้ที่สุดคือ {candidate} ที่ {confidence}% เลือกหรือจับคู่อีกครั้งในแผงหมวดธุรกิจ"
  },
  "confirmValue": "ค่านี้ถูกต้อง",
  "dismiss": "ไม่เกี่ยวข้อง",
  "note": "หมายเหตุ (จำเป็นเมื่อระบุว่าไม่เกี่ยวข้อง)",
  "errors": {
    "not-dismissable": "ข้อมูลที่ขาดต้องกรอก ไม่ใช่ตัดออก",
    "already-resolved": "จัดการแล้ว",
    "note-required": "กรุณาเขียนหมายเหตุก่อน",
    "not-found": "ไม่พบข้อมูล"
  }
}
```
`messages/zh.json`:
```json
"recheck": "重新检查",
"acceptance": {
  "accepted": "由 {name} 接受",
  "acceptedAuto": "自动接受：读取无问题且四项详情齐全。",
  "waiting": "{count} 个例外阻止接受",
  "blocked": "尚未接受——请处理下方的例外。"
},
"exceptions": {
  "title": "例外",
  "intro": "校验发现的问题。没有任何阻止接受的例外时记录即被接受；没有任何阻止版本的例外时培训版本即生效。备注仅供复核。",
  "none": "无待处理例外：记录无问题。",
  "groups": { "acceptance": "阻止接受", "version": "阻止培训版本", "none": "待复核" },
  "kinds": {
    "missing": "缺少",
    "low_confidence": "置信度低",
    "conflict": "不一致",
    "invalid": "无效",
    "geo_mismatch": "地址无法解析",
    "category_review": "类别待复核",
    "render_failure": "题目无法生成"
  },
  "rules": {
    "check_digit": "校验位不匹配（{value}）。",
    "in_future": "日期在未来（{value}）。",
    "before_registration": "签发日（{value}）早于注册日（{registered_on}）。",
    "shares_over_total": "股东持股合计 {sum}，超过总数 {total}。",
    "shares_under_total": "股东持股合计 {sum}，总数 {total}；名单可能不完整。",
    "percent_over_100": "比例合计 {percent}%。",
    "percent_under_100": "比例合计 {percent}%；名单可能不完整。",
    "shares_times_par": "股数 × 面值为 {expected}，注册资本为 {actual}。",
    "count_vs_list": "证明记载 {count} 项经营目的，列出 {listed} 项。",
    "names_not_directors": "签字权提及的人不在董事名单中。",
    "confidence": "读取置信度 {confidence}%（第 {page} 页）。",
    "geo": "{issues}",
    "missing": "所需概念：{concepts}",
    "category": "最接近 {candidate}，置信度 {confidence}%；请在类别面板选择或重新匹配。"
  },
  "confirmValue": "该值正确",
  "dismiss": "不适用",
  "note": "备注（标记不适用时必填）",
  "errors": {
    "not-dismissable": "缺少的信息需要补充，不能忽略。",
    "already-resolved": "已处理。",
    "note-required": "请先填写备注。",
    "not-found": "未找到。"
  }
}
```
In all three, delete `admin.dbd.confirm`, `admin.dbd.missingForConfirmation` and `admin.dbd.answersMissing` (grep first: nothing else may use them). In `admin.dbd.versions.none` change the text to mention the gate: en `"No version yet — it activates when nothing blocks it (see Exceptions)."`, th `"ยังไม่มีรุ่นข้อมูล — จะใช้งานได้เมื่อไม่มีอะไรกัน (ดูข้อยกเว้น)"`, zh `"尚无版本——没有阻止项时即生效（见例外）。"`.

- [ ] **Step 2: The panel**

```tsx
// app/[locale]/(admin)/admin/dbd-records/[id]/exceptions-panel.tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import type { ExceptionRow } from '@/lib/db/validation';
import { resolveExceptionAction, type ToolState } from '../actions';

const initial: ToolState = { ok: false, error: null };
const GROUPS = ['acceptance', 'version', 'none'] as const;

type Detail = Record<string, unknown> & { rule?: string; concepts?: string[]; confidence?: number; issues?: string[] };

/** What the validators found (spec §5.5), by what it holds back; a person settles what they can. */
export function ExceptionsPanel({
  recordId,
  exceptions,
}: {
  recordId: string;
  exceptions: ExceptionRow[];
}) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd.exceptions');
  const tf = useTranslations('admin.dbd.facts');
  const ti = useTranslations('admin.dbd.interviewFields');
  const tg = useTranslations('admin.dbd.address.issues');
  const [state, action, pending] = useActionState(resolveExceptionAction, initial);

  const fieldLabel = (field: string) => {
    const base = field.split('.')[0]!;
    if (tf.has(base as 'address')) return tf(base as 'address');
    if (ti.has(base as 'account_purpose')) return ti(base as 'account_purpose');
    return field;
  };
  const describe = (e: ExceptionRow) => {
    const d = (e.detail ?? {}) as Detail;
    if (e.kind === 'missing') return t('rules.missing', { concepts: (d.concepts ?? []).join(', ') || '—' });
    if (e.kind === 'low_confidence')
      return t('rules.confidence', { confidence: Math.round(((d.confidence as number) ?? 0) * 100), page: String(d.source_page ?? '—') });
    if (e.kind === 'geo_mismatch') return t('rules.geo', { issues: ((d.issues ?? []) as string[]).map((i) => tg(i as 'no_address')).join(', ') });
    if (e.kind === 'category_review')
      return t('rules.category', { candidate: String(d.candidate_key ?? '—'), confidence: Math.round(((d.confidence as number) ?? 0) * 100) });
    const rule = d.rule as string | undefined;
    return rule && t.has(`rules.${rule}` as 'rules.check_digit')
      ? t(`rules.${rule}` as 'rules.check_digit', d as Record<string, string | number>)
      : '';
  };

  const groups = GROUPS.map((g) => ({ g, rows: exceptions.filter((e) => e.blocks === g) })).filter((x) => x.rows.length > 0);
  return (
    <section className="staff-card grid max-w-2xl gap-3" data-testid="exceptions-panel" data-open={exceptions.length}>
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <p className="text-sm text-ink-500">{t('intro')}</p>
      {exceptions.length === 0 && (
        <p className="staff-notice-ok" data-testid="exceptions-none">
          {t('none')}
        </p>
      )}
      {groups.map(({ g, rows }) => (
        <div key={g} className="grid gap-2" data-testid={`exceptions-${g}`}>
          <h3 className="text-sm font-semibold text-ink-700">{t(`groups.${g}`)}</h3>
          <ul className="grid gap-2">
            {rows.map((e) => (
              <li key={e.id} className="grid gap-1 border-t pt-2 text-sm" data-testid={`exception-${e.kind}-${e.field}`} data-kind={e.kind}>
                <p>
                  <span className="staff-tag">{t(`kinds.${e.kind as 'missing'}`)}</span> <strong>{fieldLabel(e.field)}</strong>
                </p>
                <p className="text-ink-700">{describe(e)}</p>
                {e.kind !== 'missing' && (
                  <form action={action} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="id" value={recordId} />
                    <input type="hidden" name="exceptionId" value={e.id} />
                    <label className="grid min-w-0 flex-1 gap-1 text-sm">
                      {t('note')}
                      <input name="note" className="staff-input" maxLength={1000} />
                    </label>
                    <button type="submit" name="resolution" value="confirmed" disabled={pending} className="staff-btn staff-btn-sm" data-testid="exception-confirm">
                      {t('confirmValue')}
                    </button>
                    <button type="submit" name="resolution" value="dismissed" disabled={pending} className="staff-btn-ghost staff-btn-sm" data-testid="exception-dismiss">
                      {t('dismiss')}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {state.error && (
        <p role="alert" className="text-sm text-bad-600" data-testid="exception-error">
          {t.has(`errors.${state.error}` as 'errors.not-found') ? t(`errors.${state.error}` as 'errors.not-found') : state.error}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 3: RecordTools shows the acceptance state** — in `record-tools.tsx`:

- Replace the `confirmDbdRecordAction` import with `recheckRecordAction`, and `useActionState(confirmDbdRecordAction, initial)` with `useActionState(recheckRecordAction, initial)` (rename `confirmState/confirmAction/confirming` to `recheckState/recheckAction/rechecking`).
- Replace the `missing: string[]` prop with `acceptance: { blockers: number; confirmedByName: string | null; automatic: boolean }` (and drop the `missing` doc comment and the `refused` computation).
- Replace the confirm card's body (from the `{t('status')}: …` line to the submit button) with:

```tsx
        <p className="text-sm">
          {t('status')}: <span data-testid="record-status">{status}</span>
        </p>
        {locked ? (
          <p className="staff-notice-ok text-sm" data-testid="acceptance-state">
            {acceptance.automatic ? t('acceptance.acceptedAuto') : t('acceptance.accepted', { name: acceptance.confirmedByName ?? '—' })}
          </p>
        ) : (
          <p className="staff-notice-warn text-sm" data-testid="acceptance-state" data-blockers={acceptance.blockers}>
            {acceptance.blockers > 0 ? t('acceptance.waiting', { count: acceptance.blockers }) : t('acceptance.blocked')}
          </p>
        )}
        {recheckState.error && recheckState.error !== 'blocked' && (
          <p role="alert" data-testid="recheck-error" className="text-sm text-bad-600">
            {recheckState.error}
          </p>
        )}
        {!locked && (
          <button type="submit" disabled={rechecking} data-testid="recheck-button" className="staff-btn-ghost justify-self-start">
            {t('recheck')}
          </button>
        )}
```

(the surrounding `<form action={recheckAction} …>` with its hidden `locale`/`id` inputs stays).

- [ ] **Step 4: The page** — in `page.tsx`:

- Remove the `missingFieldsForConfirmation` import; add `import { listOpenExceptions } from '@/lib/db/validation';` and `import { ExceptionsPanel } from './exceptions-panel';`.
- After `const versions = …` add:

```ts
  const exceptions = await listOpenExceptions(db, record.id);
  const blockers = exceptions.filter((e) => e.blocks === 'acceptance').length;
  const { data: confirmer } = record.confirmed_by
    ? await db.from('profiles').select('display_name, login_id').eq('id', record.confirmed_by).maybeSingle()
    : { data: null };
```

- Replace `missing={missingFieldsForConfirmation(record, structured.interview ?? null)}` with `acceptance={{ blockers, confirmedByName: confirmer?.display_name ?? confirmer?.login_id ?? null, automatic: record.confirmed_automatically }}`.
- Render `<ExceptionsPanel recordId={record.id} exceptions={exceptions} />` directly after `<RecordTools … />` (before `<CoveragePanel>`).
- The `TrainingVersionsPanel` keeps its props; its `none` text now reads as changed in Step 1.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm exec vitest run --config vitest.config.ts tests/unit/messages.test.ts`
Expected: clean (typecheck will name any other use of the deleted message keys — remove those uses).

- [ ] **Step 6: Commit**

```bash
git add "app/[locale]/(admin)/admin/dbd-records/[id]" messages
git commit -m "feat(validation): the record page lists its exceptions and its acceptance state (P17c)"
```

---

## Task 7: The queue, the nav, the hub count

**Files:**
- Create: `app/[locale]/(admin)/admin/exceptions/page.tsx`
- Modify: `components/staff/staff-nav.tsx`, `app/[locale]/(admin)/admin/page.tsx`, `messages/{th,en,zh}.json`

- [ ] **Step 1: Messages** — `admin.nav.exceptions` and a new `admin.exceptions` namespace:

- en: `"nav": { "exceptions": "Exceptions" }`, `"exceptions": { "title": "Exceptions", "intro": "Every open exception on the companies you look after, the ones blocking acceptance first. Open a company to settle them.", "empty": "Nothing open.", "columns": { "company": "Company", "team": "Team", "kind": "Kind", "field": "Field", "blocks": "Holds back", "since": "Since" }, "blocks": { "acceptance": "acceptance", "version": "version", "none": "—" }, "count": "{count, plural, =0 {No open exceptions} one {# open exception} other {# open exceptions}}" }`
- th: `"nav": { "exceptions": "ข้อยกเว้น" }`, `"exceptions": { "title": "ข้อยกเว้น", "intro": "ข้อยกเว้นที่ค้างอยู่ของบริษัทที่คุณดูแล เรียงให้ที่กันการรับรองขึ้นก่อน เปิดบริษัทเพื่อจัดการ", "empty": "ไม่มีรายการค้าง", "columns": { "company": "บริษัท", "team": "ทีม", "kind": "ประเภท", "field": "รายการ", "blocks": "กัน", "since": "ตั้งแต่" }, "blocks": { "acceptance": "การรับรอง", "version": "รุ่นข้อมูล", "none": "—" }, "count": "{count, plural, =0 {ไม่มีข้อยกเว้นค้าง} other {ข้อยกเว้นค้าง # รายการ}}" }`
- zh: `"nav": { "exceptions": "例外" }`, `"exceptions": { "title": "例外", "intro": "您负责的公司的所有待处理例外，阻止接受的排在前面。打开公司以处理。", "empty": "无待处理项。", "columns": { "company": "公司", "team": "团队", "kind": "类型", "field": "项目", "blocks": "阻止", "since": "自" }, "blocks": { "acceptance": "接受", "version": "版本", "none": "—" }, "count": "{count, plural, =0 {无待处理例外} other {# 个待处理例外}}" }`

- [ ] **Step 2: The page**

```tsx
// app/[locale]/(admin)/admin/exceptions/page.tsx
import { getFormatter, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireStaff } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/db/server';
import { listExceptionQueue } from '@/lib/db/validation';

/** The exception queue (spec §5.5): RLS scopes it to the viewer's companies. */
export default async function ExceptionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireStaff(locale);
  const db = await createSupabaseServerClient();
  const [rows, t, tk, format] = await Promise.all([
    listExceptionQueue(db),
    getTranslations('admin.exceptions'),
    getTranslations('admin.dbd.exceptions.kinds'),
    getFormatter(),
  ]);
  return (
    <section className="grid gap-5">
      <div>
        <h1 className="staff-title">{t('title')}</h1>
        <p className="staff-intro mt-1">{t('intro')}</p>
      </div>
      <p className="text-sm" data-testid="exceptions-count" data-count={rows.length}>
        {t('count', { count: rows.length })}
      </p>
      {rows.length === 0 ? (
        <p className="staff-notice-ok max-w-2xl" data-testid="exceptions-empty">
          {t('empty')}
        </p>
      ) : (
        <div className="staff-table-wrap">
          <table className="staff-table" data-testid="exceptions-table">
            <thead>
              <tr>
                <th>{t('columns.company')}</th>
                <th>{t('columns.kind')}</th>
                <th>{t('columns.field')}</th>
                <th>{t('columns.blocks')}</th>
                <th>{t('columns.since')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-testid={`queue-${r.dbd_record_id}`} data-kind={r.kind} data-blocks={r.blocks}>
                  <td>
                    <Link href={`/admin/dbd-records/${r.dbd_record_id}`} className="staff-link">
                      {r.dbd_records?.company_name_th ?? '—'}
                    </Link>
                  </td>
                  <td>{tk(r.kind as 'missing')}</td>
                  <td className="font-mono text-sm">{r.field}</td>
                  <td>{t(`blocks.${r.blocks as 'acceptance'}`)}</td>
                  <td className="whitespace-nowrap tabular-nums">
                    {format.dateTime(new Date(r.created_at), { dateStyle: 'medium' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Nav and hub**

`components/staff/staff-nav.tsx` — in the `content` group, after `{ href: '/admin/dbd-records', key: 'dbdRecords' },` add `{ href: '/admin/exceptions', key: 'exceptions' },`.

`app/[locale]/(admin)/admin/page.tsx` — add `['/admin/exceptions', 'exceptions'],` to `STAFF_LINKS` after the dbd-records entry (or after `learners` if dbd-records is not listed), and show the count on that card: load `const openExceptions = (await listExceptionQueue(db)).length;` (import `listExceptionQueue`; the page already has `db` or creates one with `createSupabaseServerClient`) and, in the card render, append `{key === 'exceptions' && openExceptions > 0 && <span className="staff-tag" data-testid="exceptions-badge">{openExceptions}</span>}` next to the label (read the card markup first and place the badge inside the link).

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm exec vitest run --config vitest.config.ts tests/unit/messages.test.ts`
Expected: clean. The sidebar e2e (`staff-shell.spec.ts`: "the admin sees every section in the sidebar") may list sections by name — run it in Task 9.

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/(admin)/admin/exceptions" components/staff/staff-nav.tsx "app/[locale]/(admin)/admin/page.tsx" messages
git commit -m "feat(validation): the exception queue for the owning manager and the Owner (P17c)"
```

---

## Task 8: End to end, and the specs confirmation used to carry

**Files:**
- Modify: `tests/e2e/helpers.ts` (`createConfirmedRecord`), `tests/e2e/admin-dbd.spec.ts`, `tests/e2e/extraction.spec.ts`, `tests/e2e/seed.ts`
- Create: `tests/e2e/validation.spec.ts`

- [ ] **Step 1: Acceptance is automatic** — in `tests/e2e/helpers.ts`, `createConfirmedRecord`: delete the line `await page.getByRole('button', { name: 'ยืนยันข้อมูล' }).click();` — the answers save validates and accepts; the next line's `record-status` expectation stays. Same deletion in `tests/e2e/extraction.spec.ts` (the line after `await fillBusinessAnswers(page);`, with its comment).

- [ ] **Step 2: Rewrite the "holds Confirm" test** in `tests/e2e/admin-dbd.spec.ts` as:

```ts
test('the record lists what blocks acceptance, and accepts itself the moment it is done', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await openManualRecordForm(page);
  await page.locator('input[name="company_name_th"]').fill('บริษัท ไม่ครบ จำกัด');
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await page.waitForURL(/\/th\/admin\/dbd-records\/[0-9a-f-]{36}$/);

  // The certificate fact and the four answers are listed as blocking acceptance, in Thai.
  const blocking = page.getByTestId('exceptions-acceptance');
  await expect(blocking).toContainText('เลขทะเบียนนิติบุคคล');
  await expect(blocking).toContainText('อีเมลของบริษัท');
  await expect(blocking).toContainText('สินค้าหรือบริการที่จะขาย');
  await expect(page.getByTestId('record-status')).not.toHaveText('confirmed');

  // The answers alone are not enough: the registration number is still missing.
  await fillBusinessAnswers(page);
  await expect(blocking).toContainText('เลขทะเบียนนิติบุคคล');
  await expect(blocking).not.toContainText('อีเมลของบริษัท');

  // A number with a wrong check digit is an exception of its own, not accepted.
  await page.locator('input[name="juristic_id"]').fill('0105568233705');
  const level1 = page.locator('form:has(input[name="juristic_id"])');
  await level1.getByRole('button', { name: 'บันทึก' }).click();
  await expect(level1.getByRole('status')).toContainText('บันทึกแล้ว');
  await expect(page.getByTestId('exception-invalid-juristic_id')).toBeVisible();
  await expect(page.getByTestId('record-status')).not.toHaveText('confirmed');

  await page.locator('input[name="juristic_id"]').fill('0105568233704');
  await level1.getByRole('button', { name: 'บันทึก' }).click();
  await expect(page.getByTestId('record-status')).toHaveText('confirmed');
  await expect(page.getByTestId('exceptions-acceptance')).toHaveCount(0);
  // The version waits for the rest of the sheet.
  await expect(page.getByTestId('exceptions-version')).toBeVisible();
  await expect(page.getByTestId('training-versions')).toHaveAttribute('data-active', '');
});
```

- [ ] **Step 3: The new spec**

```ts
// tests/e2e/validation.spec.ts
import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { createManager, loginAs, switchTo } from './helpers';
import { seedLearnerWithCompleteCompany, setProvenance } from './seed';

test('a low-confidence fact waits for a person; confirming it accepts the record and the queue empties', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const company = `บริษัท ความมั่นใจต่ำ ${Date.now()} จำกัด`;
  const learner = await seedLearnerWithCompleteCompany(company);
  // The seeded record is confirmed; make its capital look read with low confidence and unconfirm it.
  const recordId = await setProvenance(learner, { registered_capital: 0.6 });

  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto(`/th/admin/dbd-records/${recordId}`);
  await page.getByTestId('recheck-button').click();
  await expect(page.getByTestId('exception-low_confidence-registered_capital')).toBeVisible();
  await expect(page.getByTestId('acceptance-state')).toHaveAttribute('data-blockers', '1');

  await page.goto('/th/admin/exceptions');
  await expect(page.getByTestId(`queue-${recordId}`)).toHaveAttribute('data-kind', 'low_confidence');

  await page.goto(`/th/admin/dbd-records/${recordId}`);
  const row = page.getByTestId('exception-low_confidence-registered_capital');
  await row.locator('input[name="note"]').fill('ตรงกับหนังสือรับรอง');
  await row.getByTestId('exception-confirm').click();
  await expect(page.getByTestId('record-status')).toHaveText('confirmed');
  await expect(page.getByTestId('exceptions-none')).toBeVisible();
  await expect(page.getByTestId('training-versions')).toHaveAttribute('data-active', '1');

  await page.goto('/th/admin/exceptions');
  await expect(page.getByTestId(`queue-${recordId}`)).toHaveCount(0);
});

test('a manager sees only their own team in the queue', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const company = `บริษัท ทีมอื่น ${Date.now()} จำกัด`;
  const learner = await seedLearnerWithCompleteCompany(company);
  const recordId = await setProvenance(learner, { registered_capital: 0.6 });
  await page.goto(`/th/admin/dbd-records/${recordId}`);
  await page.getByTestId('recheck-button').click();
  await expect(page.getByTestId('exceptions-count')).not.toHaveAttribute('data-count', '0');

  const code = await createManager(page, 'ผู้จัดการคิวข้อยกเว้น', 'Manager-Password-1!');
  await switchTo(page, code.toLowerCase(), 'Manager-Password-1!');
  await page.goto('/th/admin/exceptions');
  await expect(page.getByTestId(`queue-${recordId}`)).toHaveCount(0);
});
```

- [ ] **Step 4: The seed helper** — append to `tests/e2e/seed.ts`:

```ts
/**
 * Marks fields of the learner's company as read with the given confidences and unconfirms the
 * record, so validation has a low-confidence exception to raise. Returns the record id.
 */
export async function setProvenance(
  loginId: string,
  confidences: Record<string, number>,
): Promise<string> {
  const admin = svc();
  const { data: profile } = await admin.from('profiles').select('id').eq('login_id', loginId).single();
  const { data: assignment } = await admin
    .from('user_dbd_assignments')
    .select('dbd_record_id')
    .eq('user_id', profile!.id)
    .eq('active', true)
    .single();
  const recordId = assignment!.dbd_record_id;
  const { data: record } = await admin.from('dbd_records').select('structured_data').eq('id', recordId).single();
  const structured = (record!.structured_data as Record<string, unknown>) ?? {};
  const provenance = Object.fromEntries(
    Object.entries(confidences).map(([field, confidence]) => [field, { confidence, source_page: 1, source_document: 1 }]),
  );
  const { error } = await admin
    .from('dbd_records')
    .update({
      structured_data: { ...structured, provenance: { ...((structured.provenance as object) ?? {}), ...provenance } },
      extraction_status: 'extracted',
      confirmed_by: null,
      confirmed_at: null,
      confirmed_automatically: false,
    })
    .eq('id', recordId);
  if (error) throw error;
  return recordId;
}
```

(An unconfirmed record cannot hold an assignment? It can — the `assignment_before_insert` trigger checks at insert; the existing assignment stays. If the trigger also guards updates, seed the record unconfirmed before assigning instead: read `20260911000003` first.)

- [ ] **Step 5: Run**

Run: `pnpm exec playwright test tests/e2e/validation.spec.ts tests/e2e/admin-dbd.spec.ts tests/e2e/extraction.spec.ts tests/e2e/create-learner-and-dbd.spec.ts tests/e2e/staff-shell.spec.ts tests/e2e/training-versions.spec.ts tests/e2e/facts-and-concepts.spec.ts --reporter=line`
Expected: all pass. `create-learner-and-dbd` still ends `confirmed_auto`: the fake read is clean now (valid id, resolvable address, reconciled shares), and the four details come with the form.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e
git commit -m "test(validation): exceptions block, a person settles them, the queue is team-scoped (P17c)"
```

---

## Task 9: Documentation and the full gate

**Files:**
- Modify: `docs/decisions-log.md`, `docs/security-checklist.md`, `docs/runbooks/operations.md`, `docs/runbooks/production-setup.md`, `docs/uat-script.md`

- [ ] **Step 1: Decisions** — at the end of the D74 row's decision text add: "Implemented in P17c: deterministic validators after every change (`lib/domain/validation/`), `training_fact_exceptions` with three tiers (blocks acceptance / blocks the version / review), acceptance by validation replacing D58's manual confirmation and D80's auto-confirm, a training version held as a draft while anything blocking is open, the queue at `/admin/exceptions`." Add to D58's row: "Superseded by P17c: the four answers are now `missing` exceptions that block acceptance; the DB constraint stays." Add to D80's row: "Superseded by P17c: a clean reading is accepted by validation; `confirmed_automatically` means accepted with no person acting."

- [ ] **Step 2: Security checklist** — append:

```markdown
| 30 | Exceptions are raised only by validators under the service role and resolved only by the Owner or the owning manager under their own session (audited); learners see none; a missing fact can be supplied, never dismissed; a dismissal needs a note | ✅ | `tests/integration/exceptions.db.test.ts`, `tests/integration/validation.test.ts`, `tests/e2e/validation.spec.ts` |
```

- [ ] **Step 3: Runbooks and UAT**

- `operations.md`, Incidents: `| A record is not accepted / a company has no training version | the record page's *Exceptions* panel (what blocks acceptance, what blocks the version); the queue at Admin → Exceptions | supply the missing fact, correct the value, or settle the exception with a note; acceptance and the version follow by themselves; the thresholds are in Settings (default 95 / 75) |`
- `production-setup.md` §1: "Migration `20261003010000` adds the exception queue and the two thresholds. Existing confirmed records keep their status; their exceptions appear on the next save or the next learner visit."
- `uat-script.md` A15: `| A15 | Validation and exceptions | Create a record with a wrong check digit and the four answers; then fix the number; then open Admin → Exceptions | The record lists *Invalid — registration number* under *Blocking acceptance* and stays unaccepted; after the fix it is accepted at once and lists what still blocks the version; the queue shows the open exceptions of your companies only | DBD-001..004 |`

- [ ] **Step 4: Full gate**

Run, each expected to succeed: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test:unit`, `pnpm test:integration`, `pnpm build`, `pnpm check:secrets`, `pnpm test:e2e` (port 3000 free).

- [ ] **Step 5: Commit**

```bash
git add docs
git commit -m "docs: D74 implemented, D58/D80 superseded, checklist row 30, runbooks and UAT A15 (P17c)"
```

---

## Self-review against the spec

| Spec item | Task |
| --- | --- |
| §5.5 deterministic validators after every extraction and edit: check digit, dates, shares/percents, capital, objectives count, directors vs signing authority, address, resolvability | 3, 5 |
| §5.5 a hard-rule failure beats a high confidence | 3 (ordering and tiers), 4 |
| §5.5 `training_fact_exceptions` rows of the seven kinds, routed to the owning manager and the Owner | 1, 4, 7 |
| §5.5 KYC_POLICY concepts never produce one | 3 (coverage marks them `policy`) |
| §5.5 `category_review` never blocks (D73) | 3 |
| §5.5 resolved exceptions kept as labelled data | 1, 4 |
| §5.6 a version is created when no blocking exception is open, otherwise when the last is resolved | 1 (draft-aware activation), 4 |
| §6 thresholds 95 / 75 | 1, 3 |
| §6 Owner; owning manager read; same, own session, audited | 1 |
| §10 "confirmation rules replaced" | 5, 6, 8 |
| D74 clean records accepted automatically; a missing business fact supplied by a person, never generated | 4, 6 |
| §12.1 the exceptions say exactly what is missing | 3 (`detail.concepts`), 6 |
