# P17d — MCQ Bank and Recipes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Owner keeps a concept-first bank of MCQ variants — one or more per concept, each rendered from a company's pinned facts by controlled recipes — and can see, for any company, exactly what each variant would ask before a learner ever meets it (spec 2026-09-30 §6, §8, §10; decisions D76, D77).

**Architecture:** A variant is a `questions` row that names a concept (`concept_key`, `correct_option_key`, `option_recipes`, `applies_when`); the earlier free-form questions stay beside it, untouched, for the quiz and exam that P17e replaces. Everything about a variant's meaning is pure code in `lib/domain/mcq/`: a placeholder grammar (`{fact}`, `{fact|recipe(args)}`), a validator the editor runs on every save, a seeded renderer that draws alternates without replacement and shows the same draws in Thai, English and Chinese, and a preflight that demands four unique, non-empty options with the correct one built only from the concept's own facts. The database enforces what must hold whoever writes: only the Owner writes the bank (D76), a variant is approved on its Thai text alone, and an approved variant whose Thai text or structure changes goes back to draft. The screens are Owner-only: the bank by concept with coverage, a variant editor with a live preview against a sample company or any company with a training version, and "Check a company", which runs the whole approved bank against one company's facts.

**Tech Stack:** Next.js 16 App Router, React 19 `useActionState`, next-intl (th/en/zh), Supabase Postgres with RLS + triggers, Vitest, Playwright.

**Branch:** `p17d/mcq-bank-and-recipes` from `main` at `437330d` (P17c and D85 merged), worktree `../portal-p17a`, second local stack (`thailand-training-portal-p17a`, API 55321). Migration timestamp `20261004010000`.

**Formatting:** after a step creates or edits a file, run `pnpm exec prettier --write <file>` before the step's check. The pure code of Tasks 3–5 and 7 is printed here already formatted and was run once as written (34 unit tests green).

---

## Decisions taken in this plan — Owner: say if any is wrong

1. **Variants live in the existing `questions` table.** A question that names a concept is a *variant*; one that does not is an *earlier question*. Earlier questions keep feeding today's quiz and exam until P17e replaces those; variants never enter them (their `pools` is empty). Nothing is migrated or deleted.
2. **Only the Owner writes the bank, from now (D76).** Managers lose write access to questions, their texts and generation batches at the database, and the bank leaves their sidebar and home page. They can still read it at the database level, as D76 says.
3. **AI generation is hidden, not removed.** The *Generate with AI* button goes and its address sends the Owner back to the bank; the code stays until P17i. *Fill missing languages* stays on earlier questions only. A variant's English and Chinese are typed by hand (a blank English or Chinese option takes the Thai option when that option is placeholders only).
4. **Approval is on the Thai text alone** (spec §8). English and Chinese are optional reference translations that must use the same placeholders. Changing an approved variant's Thai text, correct option, recipes or status condition returns it to draft; changing a translation does not. A draft is always valid: the editor refuses to save text that breaks the grammar or the rules below.
5. **Exactly four options, A–D.** The earlier questions keep their 2–6.
6. **Placeholders** (what a variant may name): `company_name_th`, `company_name_en`, `juristic_id`, `registered_on`, `registered_capital`, `directors`, `director_count`, `signing_authority`, `address`, `province`, `district`, `subdistrict`, `postcode`, `shareholders`, `shareholder_count`, `total_shares`, `my_shares`, `my_share_percent`, `holder_name`, `position`, `business_category`, and the business-profile texts (`nature_of_business`, `products_services`, `business_purpose`, `main_clients`, `client_origin`, `main_suppliers`, `business_address`, `monthly_revenue`, `revenue_basis`, `average_transaction`, `monthly_transactions`, `source_of_funds`, `first_incoming_funds`, `account_purpose`, `promptpay_qr_purpose`). Money prints with its currency word (`2,000,000 บาท` / `2,000,000 THB` / `2,000,000 泰铢`), dates in each language's form (Thai in the Buddhist era), counts and share numbers as plain numbers, percents with `%`, names and the printed address exactly as on the record.
7. **Recipes and their arguments (D77):**
   - `{fact}` — DIRECT_FACT.
   - `{registered_capital|numeric(x0.5)}`, `numeric(x2)`, `numeric(+1000)`, `numeric(-1000)` — NUMERIC_VARIATION, on money, share numbers and percents. A result of zero or less (or a percent above 100) fails the variant for that company.
   - `{director_count|count(+1)}`, `count(-1)` — COUNT_VARIATION. A result below 1 fails the variant for that company.
   - `{registered_on|date(-1y)}`, `date(+3m)`, `date(-10d)` — DATE_VARIATION.
   - `{juristic_id|id_mutation}` — ID_MUTATION: one or two digits changed, never the first, and **the check digit recomputed**, so a wrong number cannot be told from the right one by its form.
   - `{province|geo_alt(region)}`, `{district|geo_alt(province)}`, `{subdistrict|geo_alt(district)}` — GEOGRAPHY_ALTERNATIVE, drawn only from the Thai geography tables.
   - `{business_category|business_alt}` — BUSINESS_ALTERNATIVE: another active category from your dictionary. Unavailable for a company with no mapped category (D73).
   - No placeholder — STATIC. Text around a placeholder, or several placeholders — COMPOSITE_TEMPLATE.
   Each option declares its recipe; the editor refuses a declaration that does not match the text. The prompt and the explanation may only use `{fact}`.
8. **The correct option** uses no varying recipe and only placeholders that belong to the concept's own facts, so `business_category` can never be a correct answer and a KYC concept's correct option is static text. A concept that reads facts needs at least one of them in the correct option, unless the variant is for one status (for example "not a shareholder": the correct answer is the static "holds no shares").
9. **Geography in Chinese.** The geography tables have Thai and English names only, so the Chinese view shows `ร้อยเอ็ด (Roi Et)`. Thai and English show their own names. All three languages show the same drawn places.
10. **Preflight in P17d is on demand.** The variant page previews one variant; *Check a company* runs every approved variant against one company and says, per concept, which variant would be asked or why none can be. Raising a `render_failure` exception when a learner's attempt is blocked belongs to the attempt engine (P17e).
11. **The preview company.** A built-in, plainly fictional sample company (always available, also what the tests use) and any real company that has a training version.
12. **Starter drafts: eleven worked examples, one for every recipe**, loaded by a button as drafts for you to edit, approve or retire — capital (numeric), director count (count), registration date (date), registration number (id mutation), head-office province (geography), actual business (business alternative), internet-banking control (static), your shareholding as a shareholder and as a non-shareholder (composite, status), main clients with and without existing customers (status). **The other concepts are not written in this phase.** The bank's coverage count shows what is missing (30 concepts, 39 cases); writing them is yours in the editor, or a follow-up I can draft for your review before P17e's UAT.

**Out of scope:** the attempt engine, scoring, PASS/RETEST/FAIL and progression (P17e); raising `render_failure`; removing AI generation and the earlier bank (P17i); AI translation of variants.

**Merge note:** another session is shipping account changes (D82–D85) to `main` at the same time; P17d touches the staff nav, the hub, the three message files and the docs' append points, so whichever lands second needs a merge.

---

## File map

| File | Responsibility |
| --- | --- |
| `supabase/migrations/20261004010000_mcq_bank.sql` | Variant columns and shape; the concept/status guard; Thai-only approval; back-to-draft triggers; Owner-only write policies |
| `lib/domain/mcq/tokens.ts` | The placeholder vocabulary, the recipe names, which recipe fits which placeholder |
| `lib/domain/mcq/grammar.ts` | `parseTemplate`, `placeholdersOf`, `classify`, `signature`, `GrammarError` |
| `lib/domain/mcq/variant.ts` | `Variant`, `VariantText`, `AppliesWhen`, `OPTION_KEYS`, `inheritPlaceholders` |
| `lib/domain/mcq/context.ts` | `RenderContext`, `GeoName`, `CategoryLabel` |
| `lib/domain/mcq/format.ts` | Money, numbers, percents, geography and category labels per language; `normalizeOption` |
| `lib/domain/mcq/render.ts` | `renderVariant` — seeded, draws without replacement, the same draws in every language |
| `lib/domain/mcq/validate.ts` | `validateVariant` — every rule the editor and the approval enforce |
| `lib/domain/mcq/preflight.ts` | `preflightVariant`, `pickVariant`, `checkBank` |
| `lib/domain/mcq/coverage.ts` | `bankCoverage` — which concept cases have an approved variant |
| `lib/domain/mcq/sample.ts` | `SAMPLE_CONTEXT` — the fictional preview company |
| `lib/content/mcq-starter.ts` | The eleven starter drafts |
| `lib/db/geo.ts` | `geoNeighbours` — a resolved address's own names and its siblings |
| `lib/db/mcq-context.ts` | `loadRenderContext`, `listVersionedCompanies`, `listRecordLearners`, `contextForRecord` |
| `lib/db/mcq-bank.ts` | `listVariants`, `getVariant`, `saveVariant`, `setVariantStatus`, `loadStarterVariants`, `VariantError` |
| `lib/db/questions.ts` | `listQuestions(db, { legacyOnly })` |
| `lib/domain/generation-limits.ts` | `AI_QUESTION_GENERATION_VISIBLE = false` |
| `app/[locale]/(admin)/admin/questions/page.tsx` | The bank by concept, coverage, starter button |
| `…/questions/legacy/page.tsx` | The earlier questions list (the old page, Owner-only, no generate link) |
| `…/questions/concepts/[key]/page.tsx` | One concept: its facts, placeholders and variants |
| `…/questions/variants/new/page.tsx`, `variants/[id]/page.tsx`, `variant-form.tsx`, `bank-actions.ts` | The variant editor, status buttons, preview |
| `…/questions/check/page.tsx` | Check a company |
| `…/questions/actions.ts`, `new/page.tsx`, `[id]/page.tsx`, `generate/page.tsx`, `generate/actions.ts` | Owner-only guards; generation hidden |
| `components/staff/staff-nav.tsx`, `app/[locale]/(admin)/admin/page.tsx` | The bank is the Owner's |
| `messages/{th,en,zh}.json` | `admin.bank` |
| Tests | `tests/unit/domain/mcq/*.test.ts`, `tests/integration/mcq-bank.db.test.ts`, `tests/integration/mcq-bank.test.ts`, `tests/e2e/mcq-bank.spec.ts`; adapted: `team-isolation`, `team-shared-content`, `manager-manages`, `ai-questions`, `rag-consumers`, `tests/e2e/seed.ts` |

---

## Task 1: The variant columns, the guards, Owner-only writes

**Files:**
- Create: `supabase/migrations/20261004010000_mcq_bank.sql`
- Modify: `lib/db/database.types.ts` (regenerated), `tests/integration/team-isolation.test.ts`, `tests/integration/team-shared-content.test.ts`
- Test: `tests/integration/mcq-bank.db.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/mcq-bank.db.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  clientFor,
  createTestUser,
  deleteTeam,
  deleteTestUser,
  seedTeam,
  type Client,
  type Team,
  type TestUser,
} from './helpers';

const svc = adminClient();
const RECIPES = {
  A: 'DIRECT_FACT',
  B: 'NUMERIC_VARIATION',
  C: 'NUMERIC_VARIATION',
  D: 'NUMERIC_VARIATION',
};
const OPTIONS = [
  { key: 'A', text: '{registered_capital}' },
  { key: 'B', text: '{registered_capital|numeric(x0.5)}' },
  { key: 'C', text: '{registered_capital|numeric(x2)}' },
  { key: 'D', text: '{registered_capital|numeric(x10)}' },
];

describe('the MCQ bank tables (P17d)', () => {
  let team: Team;
  let owner: TestUser;
  let asOwner: Client;
  let asLearner: Client;
  const keys: string[] = [];
  const key = (label: string) => {
    const k = `t-${label}-${Date.now()}-${keys.length}`;
    keys.push(k);
    return k;
  };
  const variant = (over: Record<string, unknown> = {}) => ({
    question_key: key('variant'),
    kind: 'concept',
    concept_key: 'registered_capital',
    correct_option_key: 'A',
    option_recipes: RECIPES,
    pools: [] as string[],
    ...over,
  });
  const thai = (questionId: string, prompt = 'ทุนจดทะเบียนคือเท่าใด') => ({
    question_id: questionId,
    language: 'th',
    prompt,
    options: OPTIONS,
    correct_key: 'A',
  });
  const statusOf = async (id: string) =>
    (await svc.from('questions').select('approval_status').eq('id', id).single()).data!
      .approval_status;

  beforeAll(async () => {
    team = await seedTeam('คลังข้อสอบ');
    owner = await createTestUser('admin');
    asOwner = await clientFor(owner);
    asLearner = await clientFor(team.learner);
  });

  afterAll(async () => {
    await svc.from('questions').delete().in('question_key', keys);
    await deleteTeam(team);
    await deleteTestUser(owner.id);
  });

  it('lets a manager read the bank and write nothing (D76)', async () => {
    const { data: row } = await svc.from('questions').insert(variant()).select().single();
    const { data: seen } = await team.asManager.from('questions').select('id').eq('id', row!.id);
    expect(seen).toHaveLength(1);

    const { error: inserted } = await team.asManager.from('questions').insert(variant());
    expect(inserted).not.toBeNull();
    const { data: updated } = await team.asManager
      .from('questions')
      .update({ active: false })
      .eq('id', row!.id)
      .select();
    expect(updated).toEqual([]);
    const { error: localized } = await team.asManager
      .from('question_localizations')
      .insert(thai(row!.id));
    expect(localized).not.toBeNull();
    const { error: batch } = await team.asManager
      .from('question_generation_batches')
      .insert({ provider: 'fake', material_summary: 'x', requested: 1 });
    expect(batch).not.toBeNull();
  });

  it('shows a learner nothing', async () => {
    const { data } = await asLearner.from('questions').select('id');
    expect(data).toEqual([]);
    const { data: texts } = await asLearner.from('question_localizations').select('id');
    expect(texts).toEqual([]);
  });

  it('lets the Owner write a variant, audited as the Owner', async () => {
    const { data: row, error } = await asOwner.from('questions').insert(variant()).select().single();
    expect(error).toBeNull();
    const { error: localized } = await asOwner.from('question_localizations').insert(thai(row!.id));
    expect(localized).toBeNull();
    const { data: audit } = await svc
      .from('audit_logs')
      .select('actor_id, action')
      .eq('entity_type', 'questions')
      .eq('entity_id', row!.id);
    expect(audit).toEqual([{ actor_id: owner.id, action: 'questions.insert' }]);
  });

  it('refuses a row that is half a variant', async () => {
    const attempts = [
      variant({ correct_option_key: null }),
      variant({ option_recipes: null }),
      variant({ option_recipes: { A: 'DIRECT_FACT' } }),
      variant({ pools: ['quiz'] }),
      variant({ kind: 'generic' }),
      variant({ applies_when: { fact: 'operations_started' } }),
      { question_key: key('legacy'), kind: 'generic', correct_option_key: 'A' },
      { question_key: key('legacy'), kind: 'concept' },
    ];
    for (const row of attempts) {
      const { error } = await svc.from('questions').insert(row as never);
      expect(error?.code, JSON.stringify(row)).toBe('23514');
    }
  });

  it('refuses a concept the MCQ does not ask, and a status the concept does not turn on', async () => {
    // `registered_address` is a chatbot-only concept.
    const chatbot = await svc.from('questions').insert(variant({ concept_key: 'registered_address' }));
    expect(chatbot.error?.code).toBe('23514');
    const wrongStatus = await svc
      .from('questions')
      .insert(variant({ applies_when: { fact: 'operations_started', value: true } }));
    expect(wrongStatus.error?.code).toBe('23514');
    const right = await svc.from('questions').insert(
      variant({
        concept_key: 'main_clients',
        applies_when: { fact: 'has_existing_customers', value: false },
      }),
    );
    expect(right.error).toBeNull();
  });

  it('approves a variant on its Thai text alone, and an earlier question only with three languages', async () => {
    const { data: row } = await svc.from('questions').insert(variant()).select().single();
    const bare = await asOwner
      .from('questions')
      .update({ approval_status: 'approved' })
      .eq('id', row!.id);
    expect(bare.error?.code).toBe('23514');
    await svc.from('question_localizations').insert(thai(row!.id));
    const withThai = await asOwner
      .from('questions')
      .update({ approval_status: 'approved' })
      .eq('id', row!.id);
    expect(withThai.error).toBeNull();
    expect(await statusOf(row!.id)).toBe('approved');

    const { data: legacy } = await svc
      .from('questions')
      .insert({ question_key: key('legacy'), kind: 'generic' })
      .select()
      .single();
    await svc.from('question_localizations').insert({ ...thai(legacy!.id), options: OPTIONS });
    const legacyApproval = await asOwner
      .from('questions')
      .update({ approval_status: 'approved' })
      .eq('id', legacy!.id);
    expect(legacyApproval.error?.code).toBe('23514');
  });

  it('returns an approved variant to draft when its Thai text or its structure changes, not when a translation does', async () => {
    const { data: row } = await svc.from('questions').insert(variant()).select().single();
    const id = row!.id;
    await svc.from('question_localizations').insert(thai(id));
    const approve = () => svc.from('questions').update({ approval_status: 'approved' }).eq('id', id);
    await approve();

    // A translation arrives, then changes: still approved.
    await asOwner
      .from('question_localizations')
      .insert({ ...thai(id, 'What is the registered capital?'), language: 'en' });
    await asOwner
      .from('question_localizations')
      .update({ prompt: 'How much is the registered capital?' })
      .eq('question_id', id)
      .eq('language', 'en');
    expect(await statusOf(id)).toBe('approved');

    // Saving the Thai text unchanged: still approved.
    await asOwner
      .from('question_localizations')
      .update({ prompt: 'ทุนจดทะเบียนคือเท่าใด' })
      .eq('question_id', id)
      .eq('language', 'th');
    expect(await statusOf(id)).toBe('approved');

    // The Thai text changes: draft.
    await asOwner
      .from('question_localizations')
      .update({ prompt: 'บริษัทมีทุนจดทะเบียนเท่าใด' })
      .eq('question_id', id)
      .eq('language', 'th');
    expect(await statusOf(id)).toBe('draft');

    // The structure changes: draft.
    await approve();
    await asOwner
      .from('questions')
      .update({ option_recipes: { ...RECIPES, D: 'STATIC' } })
      .eq('id', id);
    expect(await statusOf(id)).toBe('draft');

    // Retiring and other columns do not touch the status.
    await approve();
    await asOwner.from('questions').update({ active: false }).eq('id', id);
    expect(await statusOf(id)).toBe('approved');
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/mcq-bank.db.test.ts`
Expected: FAIL — `column "concept_key" of relation "questions" does not exist` (and the manager insert succeeds).

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20261004010000_mcq_bank.sql
-- P17d: the concept-first MCQ bank (spec 2026-09-30 §6, §8; decisions D76, D77).
-- A question that names a concept is a *variant* of it; the others are the earlier free-form
-- questions the quiz and exam keep using until P17e. Only the Owner writes either kind.

-- 1. A question may be a variant of a concept.
alter table public.questions
  add column concept_key text references public.evaluation_concepts(key),
  add column correct_option_key text check (correct_option_key in ('A', 'B', 'C', 'D')),
  add column option_recipes jsonb,
  add column applies_when jsonb;

comment on column public.questions.concept_key is
  'The MCQ concept this row is a variant of; null for an earlier free-form question.';
comment on column public.questions.option_recipes is
  'The recipe each option declares, {"A": "DIRECT_FACT", ...} (D77); the editor checks the text matches.';
comment on column public.questions.applies_when is
  'The status this variant is worded for, {"fact": "has_existing_customers", "value": false}; null = every company.';

alter table public.questions drop constraint questions_kind_check;
alter table public.questions
  add constraint questions_kind_check check (kind in ('generic', 'dbd_template', 'concept'));

-- A row is wholly a variant or wholly an earlier question. A variant never enters the old
-- quiz/exam pools: P17e reads it by concept.
alter table public.questions add constraint questions_variant_shape check (
  (
    concept_key is null
    and kind <> 'concept'
    and correct_option_key is null
    and option_recipes is null
    and applies_when is null
  )
  or (
    concept_key is not null
    and kind = 'concept'
    and correct_option_key is not null
    and option_recipes is not null
    and jsonb_typeof(option_recipes) = 'object'
    and option_recipes ?& array['A', 'B', 'C', 'D']
    and pools = '{}'
    and (
      applies_when is null
      -- `coalesce`: a missing key makes the comparison null, and a null check would pass.
      or coalesce(
        jsonb_typeof(applies_when) = 'object'
        and jsonb_typeof(applies_when -> 'fact') = 'string'
        and jsonb_typeof(applies_when -> 'value') = 'boolean',
        false
      )
    )
  )
);

create index questions_concept_idx on public.questions (concept_key)
  where concept_key is not null;

-- 2. A variant belongs to an MCQ concept, is worded only for a status that concept turns on,
--    and goes back to draft when its structure changes after approval (spec §8).
create function public.questions_variant_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_order smallint;
  v_alternate text[];
begin
  if new.concept_key is null then
    return new;
  end if;
  select mcq_order, alternate_when into v_order, v_alternate
  from public.evaluation_concepts where key = new.concept_key;
  if v_order is null then
    raise exception 'Concept % is not an MCQ concept', new.concept_key
      using errcode = 'check_violation';
  end if;
  if new.applies_when is not null
     and not ((new.applies_when ->> 'fact') = any (v_alternate)) then
    raise exception 'Concept % has no alternate wording for %',
      new.concept_key, new.applies_when ->> 'fact'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE'
     and old.approval_status = 'approved'
     and new.approval_status = 'approved'
     and (
       new.concept_key is distinct from old.concept_key
       or new.correct_option_key is distinct from old.correct_option_key
       or new.option_recipes is distinct from old.option_recipes
       or new.applies_when is distinct from old.applies_when
     ) then
    new.approval_status := 'draft';
  end if;
  return new;
end;
$$;

create trigger questions_variant_guard
  before insert or update on public.questions
  for each row execute function public.questions_variant_guard();

-- 3. Approval: a variant on its Thai text alone; an earlier question on all three languages.
create or replace function public.questions_check_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_langs integer;
begin
  if new.approval_status = 'approved' and (old.approval_status is distinct from 'approved') then
    if new.concept_key is not null then
      if not exists (
        select 1 from public.question_localizations l
        where l.question_id = new.id and l.language = 'th'
      ) then
        raise exception 'A variant needs its Thai text before approval'
          using errcode = 'check_violation';
      end if;
    else
      select count(distinct language) into v_langs
      from public.question_localizations where question_id = new.id;
      if v_langs < 3 then
        raise exception 'A question needs th, en and zh localizations before approval'
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- 4. An approved variant whose Thai text changes goes back to draft. English and Chinese are
--    reference translations: changing them does not.
create function public.question_localizations_unapprove()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question uuid;
  v_language text;
begin
  if tg_op = 'DELETE' then
    v_question := old.question_id;
    v_language := old.language;
  else
    v_question := new.question_id;
    v_language := new.language;
  end if;
  if v_language = 'th'
     and not (
       tg_op = 'UPDATE'
       and new.prompt is not distinct from old.prompt
       and new.options is not distinct from old.options
       and new.correct_key is not distinct from old.correct_key
       and new.explanation is not distinct from old.explanation
     ) then
    update public.questions
       set approval_status = 'draft'
     where id = v_question and concept_key is not null and approval_status = 'approved';
  end if;
  return null;
end;
$$;

create trigger question_localizations_unapprove
  after insert or update or delete on public.question_localizations
  for each row execute function public.question_localizations_unapprove();

revoke execute on function public.questions_variant_guard() from public, anon, authenticated;
revoke execute on function public.question_localizations_unapprove() from public, anon, authenticated;

-- 5. Only the Owner writes the bank (D76, superseding D54 for assessment content); staff read.
--    The helper calls are wrapped in a sub-select so each runs once per statement, not per row.
drop policy "questions: staff do everything" on public.questions;
create policy "questions: staff read" on public.questions
  for select to authenticated using ((select public.is_staff()));
create policy "questions: owner inserts" on public.questions
  for insert to authenticated with check ((select public.is_admin()));
create policy "questions: owner updates" on public.questions
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy "question loc: staff do everything" on public.question_localizations;
create policy "question loc: staff read" on public.question_localizations
  for select to authenticated using ((select public.is_staff()));
create policy "question loc: owner inserts" on public.question_localizations
  for insert to authenticated with check ((select public.is_admin()));
create policy "question loc: owner updates" on public.question_localizations
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "question loc: owner deletes" on public.question_localizations
  for delete to authenticated using ((select public.is_admin()));

drop policy "question batches: staff do everything" on public.question_generation_batches;
create policy "question batches: staff read" on public.question_generation_batches
  for select to authenticated using ((select public.is_staff()));
create policy "question batches: owner inserts" on public.question_generation_batches
  for insert to authenticated with check ((select public.is_admin()));
create policy "question batches: owner updates" on public.question_generation_batches
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
```

- [ ] **Step 4: Apply it and regenerate the types**

Run: `pnpm db:reset && pnpm db:types && pnpm exec prettier --write lib/db/database.types.ts`
Expected: `Finished supabase db reset`; `git diff --stat lib/db/database.types.ts` shows the four new `questions` columns.

- [ ] **Step 5: Run the test to see it pass**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/mcq-bank.db.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Bring the two tests that pinned D54 in line with D76**

In `tests/integration/team-isolation.test.ts`, replace the whole test `'lets a manager author and approve in the shared question bank'` with:

```ts
  it('gives a manager the question bank to read, not to write (D76)', async () => {
    const { error } = await team.asManager
      .from('questions')
      .insert({ question_key: `mgr-${Date.now()}`, kind: 'generic', approval_status: 'draft' });
    expect(error).not.toBeNull();
    const { error: read } = await team.asManager.from('questions').select('id').limit(1);
    expect(read).toBeNull();
  });
```

In `tests/integration/team-shared-content.test.ts` the batch is now generated by the Owner. Change the imports, the fixtures and the call:

```ts
import {
  adminClient,
  clientFor,
  confirmRecord,
  createTestUser,
  deleteTeam,
  deleteTestUser,
  seedTeam,
  type Team,
  type TestUser,
} from './helpers';
```

```ts
  let a: Team;
  let b: Team;
  let owner: TestUser;
  let batchId: string;
```

In `beforeAll`, after the two `confirmRecord` calls add `owner = await createTestUser('admin');`, and replace the first two arguments of `generateQuestionsIntoBank`:

```ts
    const result = await generateQuestionsIntoBank(
      await clientFor(owner),
      owner.id,
```

In `afterAll` add `await deleteTestUser(owner.id);` after the team deletions, and rename the test to `'lets every manager see the batch but not whose company it came from'` (its body is unchanged: team B's manager still reads the batch).

- [ ] **Step 7: Run the whole integration suite**

Run: `pnpm test:integration`
Expected: every file passes. If another test wrote questions through a manager's client, it fails here with an RLS error; change it to the Owner's client the same way.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20261004010000_mcq_bank.sql lib/db/database.types.ts tests/integration/mcq-bank.db.test.ts tests/integration/team-isolation.test.ts tests/integration/team-shared-content.test.ts
git commit -m "feat(bank): variant columns, Thai-only approval, back-to-draft triggers, Owner-only writes (P17d, D76)"
```

---

## Task 2: The bank is the Owner's; AI generation is hidden

**Files:**
- Modify: `lib/domain/generation-limits.ts`, `app/[locale]/(admin)/admin/questions/actions.ts`, `page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `generate/page.tsx`, `generate/actions.ts`, `components/staff/staff-nav.tsx`, `app/[locale]/(admin)/admin/page.tsx`
- Test: `tests/e2e/manager-manages.spec.ts`, `tests/e2e/ai-questions.spec.ts`, `tests/e2e/rag-consumers.spec.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/e2e/manager-manages.spec.ts`, replace the whole test `'a manager can open the AI generation screen and use it'` with:

```ts
test('a manager is sent back from the question bank and does not see it in the sidebar (D76)', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ผู้จัดการไม่เขียนข้อสอบ', MANAGER_PASSWORD);
  await switchTo(page, code.toLowerCase(), MANAGER_PASSWORD);
  for (const path of ['/th/admin/questions', '/th/admin/questions/new']) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/th\/admin$/);
  }
  await expect(page.getByTestId('staff-nav')).not.toContainText('คลังคำถาม');
  await expect(page.getByTestId('admin-nav')).not.toContainText('คลังคำถาม');
});
```

Remove the imports that test alone used (`createConfirmedRecord`, if nothing else in the file uses it — `pnpm lint` says).

In `tests/e2e/ai-questions.spec.ts`, replace the whole first test (`'admin generates DBD-grounded draft questions with AI (fake), reviews the list and approves one'`) with:

```ts
test('the AI generation screen is hidden: its address leads back to the bank', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/questions/generate');
  await expect(page).toHaveURL(/\/th\/admin\/questions$/);
  await expect(page.getByTestId('generate-link')).toHaveCount(0);
});
```

and drop `createConfirmedRecord` from that file's imports.

In `tests/e2e/rag-consumers.spec.ts`, rename the test to `'learners see passages from their own documents'`, and delete step 3 — from the comment `// 3. A batch modelled on that record cites its pages.` through the line `await expect(rows.first().getByTestId('question-sources')).toContainText('หน้า');` — keeping the sign-out line that follows it. Renumber the last comment to `// 3.`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `PLAYWRIGHT_PORT=3100 pnpm exec playwright test tests/e2e/manager-manages.spec.ts tests/e2e/ai-questions.spec.ts`
Expected: FAIL — the manager stays on `/th/admin/questions`; the generate address does not redirect.

- [ ] **Step 3: The switch**

Append to `lib/domain/generation-limits.ts`:

```ts
/**
 * AI question generation is hidden from P17d on (spec §10): the bank is written concept by
 * concept by the Owner. The code stays until P17i removes it.
 */
export const AI_QUESTION_GENERATION_VISIBLE = false;
```

- [ ] **Step 4: Owner-only guards**

In `app/[locale]/(admin)/admin/questions/actions.ts`: change the import `requireStaff` to `requireAdmin` and every call `requireStaff(locale)` to `requireAdmin(locale)` (five actions).

In `page.tsx`, `new/page.tsx` and `[id]/page.tsx` under `app/[locale]/(admin)/admin/questions/`: `requireStaff` → `requireAdmin` (import and call).

In `page.tsx` delete the *Generate with AI* link (the `<Link href="/admin/questions/generate" data-testid="generate-link" …>` element); the `div` keeps the *New* link.

- [ ] **Step 5: Hide generation**

`app/[locale]/(admin)/admin/questions/generate/page.tsx` — change the guard and send the Owner back:

```ts
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { AI_QUESTION_GENERATION_VISIBLE } from '@/lib/domain/generation-limits';
```

```ts
  const { locale } = await params;
  await requireAdmin(locale);
  if (!AI_QUESTION_GENERATION_VISIBLE) redirect(`/${locale}/admin/questions`);
```

(remove the `requireStaff` import; the rest of the page stays for P17i to delete.)

`generate/actions.ts` — the action refuses as well:

```ts
import { requireAdmin } from '@/lib/auth/session';
import { AI_QUESTION_GENERATION_VISIBLE } from '@/lib/domain/generation-limits';
```

```ts
  const locale = String(formData.get('locale') ?? 'th');
  // Only the Owner writes the bank (D76), and generation is hidden from P17d on.
  const admin = await requireAdmin(locale);
  if (!AI_QUESTION_GENERATION_VISIBLE) return { error: 'not_configured', rejected: [] };
```

- [ ] **Step 6: The sidebar and the home page**

`components/staff/staff-nav.tsx`:

```ts
      { href: '/admin/questions', key: 'questions', adminOnly: true },
```

`app/[locale]/(admin)/admin/page.tsx` — move the bank from `STAFF_LINKS` to `ADMIN_LINKS`:

```ts
const STAFF_LINKS = [
  // "Create learner & DBD" holds the companies list too (D80).
  ['/admin/users', 'users'],
  ['/admin/learners', 'learners'],
  ['/admin/exceptions', 'exceptions'],
  ['/admin/interviews', 'interviews'],
  ['/admin/appointments', 'appointments'],
] as const;

const ADMIN_LINKS = [
  ['/admin/managers', 'managers'],
  // Assessment content is the Owner's (D76).
  ['/admin/questions', 'questions'],
  ['/admin/notifications', 'notifications'],
  ['/admin/business-categories', 'businessCategories'],
  ['/admin/settings', 'settings'],
] as const;
```

- [ ] **Step 7: Run the tests**

Run: `pnpm lint && pnpm typecheck && PLAYWRIGHT_PORT=3100 pnpm exec playwright test tests/e2e/manager-manages.spec.ts tests/e2e/ai-questions.spec.ts tests/e2e/rag-consumers.spec.ts tests/e2e/quiz.spec.ts tests/e2e/staff-shell.spec.ts`
Expected: PASS. (`quiz.spec.ts` still authors an earlier question as the Owner; `staff-shell.spec.ts` still finds *คลังคำถาม* in the Owner's sidebar.)

- [ ] **Step 8: Commit**

```bash
git add lib/domain/generation-limits.ts "app/[locale]/(admin)/admin/questions" components/staff/staff-nav.tsx "app/[locale]/(admin)/admin/page.tsx" tests/e2e/manager-manages.spec.ts tests/e2e/ai-questions.spec.ts tests/e2e/rag-consumers.spec.ts
git commit -m "feat(bank): the question bank is the Owner's; AI generation hidden (P17d, D76)"
```

---

## Task 3: The placeholder grammar

**Files:**
- Create: `lib/domain/mcq/tokens.ts`, `lib/domain/mcq/grammar.ts`
- Test: `tests/unit/domain/mcq/grammar.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/domain/mcq/grammar.test.ts
import { describe, expect, it } from 'vitest';
import {
  classify,
  GrammarError,
  parseTemplate,
  placeholdersOf,
  signature,
} from '@/lib/domain/mcq/grammar';
import { RECIPES, TOKENS } from '@/lib/domain/mcq/tokens';

const code = (text: string) => {
  try {
    parseTemplate(text);
    return null;
  } catch (e) {
    if (e instanceof GrammarError) return e.code;
    throw e;
  }
};

describe('the placeholder grammar', () => {
  it('names the nine recipes of D77', () => {
    expect(RECIPES).toEqual([
      'DIRECT_FACT',
      'NUMERIC_VARIATION',
      'COUNT_VARIATION',
      'DATE_VARIATION',
      'ID_MUTATION',
      'GEOGRAPHY_ALTERNATIVE',
      'BUSINESS_ALTERNATIVE',
      'STATIC',
      'COMPOSITE_TEMPLATE',
    ]);
  });

  it('splits text and placeholders, keeping what was typed', () => {
    expect(parseTemplate('ทุน {registered_capital|numeric(x0.5)} บาท')).toEqual([
      { type: 'text', text: 'ทุน ' },
      {
        type: 'placeholder',
        placeholder: {
          raw: '{registered_capital|numeric(x0.5)}',
          token: 'registered_capital',
          fn: 'numeric',
          arg: 'x0.5',
          recipe: 'NUMERIC_VARIATION',
        },
      },
      { type: 'text', text: ' บาท' },
    ]);
    expect(placeholdersOf('{company_name_th}')[0]).toMatchObject({
      token: 'company_name_th',
      fn: null,
      arg: null,
      recipe: 'DIRECT_FACT',
    });
  });

  it('accepts every recipe in its own form', () => {
    const ok = [
      '{registered_capital|numeric(x2)}',
      '{registered_capital|numeric(+1000)}',
      '{my_share_percent|numeric(x0.5)}',
      '{director_count|count(+1)}',
      '{shareholder_count|count(-1)}',
      '{registered_on|date(-1y)}',
      '{registered_on|date(+3m)}',
      '{registered_on|date(-10d)}',
      '{juristic_id|id_mutation}',
      '{province|geo_alt(region)}',
      '{district|geo_alt(province)}',
      '{subdistrict|geo_alt(district)}',
      '{business_category|business_alt}',
    ];
    for (const text of ok) expect(code(text), text).toBeNull();
  });

  it('refuses what it does not know, by name', () => {
    expect(code('{capital}')).toBe('unknown_token');
    expect(code('{registered_capital|double}')).toBe('unknown_recipe');
    expect(code('{company_name_th|numeric(x2)}')).toBe('recipe_not_for_token');
    expect(code('{juristic_id|geo_alt(region)}')).toBe('recipe_not_for_token');
    expect(code('{registered_capital|numeric(x1)}')).toBe('bad_argument');
    expect(code('{registered_capital|numeric(twice)}')).toBe('bad_argument');
    expect(code('{director_count|count(0)}')).toBe('bad_argument');
    expect(code('{registered_on|date(1y)}')).toBe('bad_argument');
    expect(code('{province|geo_alt(district)}')).toBe('bad_argument');
    expect(code('{juristic_id|id_mutation(2)}')).toBe('bad_argument');
    expect(code('ทุน {registered_capital บาท')).toBe('unbalanced');
    expect(code('ทุน registered_capital} บาท')).toBe('unbalanced');
  });

  it('classifies an option by its text', () => {
    expect(classify('กรรมการผู้มีอำนาจเท่านั้น')).toBe('STATIC');
    expect(classify('{registered_capital}')).toBe('DIRECT_FACT');
    expect(classify(' {registered_capital|numeric(x2)} ')).toBe('NUMERIC_VARIATION');
    expect(classify('{director_count|count(+1)}')).toBe('COUNT_VARIATION');
    expect(classify('{registered_on|date(-1y)}')).toBe('DATE_VARIATION');
    expect(classify('{juristic_id|id_mutation}')).toBe('ID_MUTATION');
    expect(classify('{province|geo_alt(region)}')).toBe('GEOGRAPHY_ALTERNATIVE');
    expect(classify('{business_category|business_alt}')).toBe('BUSINESS_ALTERNATIVE');
    expect(classify('{my_shares} หุ้น ({my_share_percent})')).toBe('COMPOSITE_TEMPLATE');
    expect(classify('{director_count} คน')).toBe('COMPOSITE_TEMPLATE');
  });

  it('gives a translation the same signature when it keeps the placeholders', () => {
    const th = 'ทุนจดทะเบียนของ {company_name_th} คือ {registered_capital}';
    expect(signature(th)).toBe('{company_name_th} {registered_capital}');
    expect(signature('{company_name_th} has {registered_capital} of capital')).toBe(signature(th));
    expect(signature('The capital is {registered_capital}')).not.toBe(signature(th));
  });

  it('ties every placeholder to the facts it reads', () => {
    expect(TOKENS.province.facts).toEqual(['address']);
    expect(TOKENS.director_count.facts).toEqual(['directors']);
    expect(TOKENS.my_shares.facts).toEqual(['holder_name', 'shareholders']);
    expect(TOKENS.business_category.facts).toEqual(['business_category']);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/mcq/grammar.test.ts`
Expected: FAIL — `Cannot find module '@/lib/domain/mcq/grammar'`.

- [ ] **Step 3: The vocabulary**

```ts
// lib/domain/mcq/tokens.ts
import type { FactKey } from '@/lib/domain/facts/fact-sheet';

/** The controlled recipes of D77. An option declares one; the editor checks the text matches. */
export const RECIPES = [
  'DIRECT_FACT',
  'NUMERIC_VARIATION',
  'COUNT_VARIATION',
  'DATE_VARIATION',
  'ID_MUTATION',
  'GEOGRAPHY_ALTERNATIVE',
  'BUSINESS_ALTERNATIVE',
  'STATIC',
  'COMPOSITE_TEMPLATE',
] as const;
export type Recipe = (typeof RECIPES)[number];

/** How a placeholder's value is read and printed. */
export type TokenKind =
  | 'text'
  | 'names'
  | 'id'
  | 'date'
  | 'money'
  | 'number'
  | 'percent'
  | 'count'
  | 'province'
  | 'district'
  | 'subdistrict'
  | 'category';

export type TokenDef = { kind: TokenKind; facts: readonly FactKey[] };

const text = <K extends FactKey>(fact: K) => ({ kind: 'text', facts: [fact] }) as const;

/**
 * Everything a variant may name between braces, and the fact-sheet keys each one reads. A
 * correct option may only use placeholders whose facts all belong to its concept (spec §8).
 */
export const TOKENS = {
  company_name_th: text('company_name_th'),
  company_name_en: text('company_name_en'),
  juristic_id: { kind: 'id', facts: ['juristic_id'] },
  registered_on: { kind: 'date', facts: ['registered_on'] },
  registered_capital: { kind: 'money', facts: ['registered_capital'] },
  directors: { kind: 'names', facts: ['directors'] },
  director_count: { kind: 'count', facts: ['directors'] },
  signing_authority: text('signing_authority'),
  address: text('address'),
  province: { kind: 'province', facts: ['address'] },
  district: { kind: 'district', facts: ['address'] },
  subdistrict: { kind: 'subdistrict', facts: ['address'] },
  postcode: text('address'),
  shareholders: { kind: 'names', facts: ['shareholders'] },
  shareholder_count: { kind: 'count', facts: ['shareholders'] },
  total_shares: { kind: 'number', facts: ['total_shares'] },
  my_shares: { kind: 'number', facts: ['holder_name', 'shareholders'] },
  my_share_percent: { kind: 'percent', facts: ['holder_name', 'shareholders'] },
  holder_name: text('holder_name'),
  position: text('position'),
  business_category: { kind: 'category', facts: ['business_category'] },
  nature_of_business: text('nature_of_business'),
  products_services: text('products_services'),
  business_purpose: text('business_purpose'),
  main_clients: text('main_clients'),
  client_origin: text('client_origin'),
  main_suppliers: text('main_suppliers'),
  business_address: text('business_address'),
  monthly_revenue: text('monthly_revenue'),
  revenue_basis: text('revenue_basis'),
  average_transaction: text('average_transaction'),
  monthly_transactions: text('monthly_transactions'),
  source_of_funds: text('source_of_funds'),
  first_incoming_funds: text('first_incoming_funds'),
  account_purpose: text('account_purpose'),
  promptpay_qr_purpose: text('promptpay_qr_purpose'),
} as const satisfies Record<string, TokenDef>;
export type TokenName = keyof typeof TOKENS;

export const isTokenName = (name: string): name is TokenName => name in TOKENS;

/** The recipe functions of the grammar: `{fact|function(argument)}`. */
export const RECIPE_FUNCTIONS = {
  numeric: 'NUMERIC_VARIATION',
  count: 'COUNT_VARIATION',
  date: 'DATE_VARIATION',
  id_mutation: 'ID_MUTATION',
  geo_alt: 'GEOGRAPHY_ALTERNATIVE',
  business_alt: 'BUSINESS_ALTERNATIVE',
} as const satisfies Record<string, Recipe>;
export type RecipeFunction = keyof typeof RECIPE_FUNCTIONS;

export const isRecipeFunction = (name: string): name is RecipeFunction => name in RECIPE_FUNCTIONS;

/** Which kinds of placeholder a function may vary. */
export const FUNCTION_KINDS: Record<RecipeFunction, readonly TokenKind[]> = {
  numeric: ['money', 'number', 'percent'],
  count: ['count'],
  date: ['date'],
  id_mutation: ['id'],
  geo_alt: ['province', 'district', 'subdistrict'],
  business_alt: ['category'],
};

/** A geography alternate is drawn from the place's own parent (spec §5.2). */
export const GEO_SCOPES = {
  province: 'region',
  district: 'province',
  subdistrict: 'district',
} as const;
export type GeoKind = keyof typeof GEO_SCOPES;

/** Functions whose result is drawn, so the same text may appear in several options. */
export const DRAWING_FUNCTIONS: readonly RecipeFunction[] = [
  'id_mutation',
  'geo_alt',
  'business_alt',
];
```

- [ ] **Step 4: The parser**

```ts
// lib/domain/mcq/grammar.ts
import {
  FUNCTION_KINDS,
  GEO_SCOPES,
  isRecipeFunction,
  isTokenName,
  RECIPE_FUNCTIONS,
  TOKENS,
  type GeoKind,
  type Recipe,
  type RecipeFunction,
  type TokenName,
} from './tokens';

export type GrammarErrorCode =
  'unbalanced' | 'unknown_token' | 'unknown_recipe' | 'recipe_not_for_token' | 'bad_argument';

/** A placeholder the grammar does not accept; `raw` is what was typed. */
export class GrammarError extends Error {
  constructor(
    public readonly code: GrammarErrorCode,
    public readonly raw: string,
  ) {
    super(`${code}: ${raw}`);
    this.name = 'GrammarError';
  }
}

export type Placeholder = {
  raw: string;
  token: TokenName;
  fn: RecipeFunction | null;
  arg: string | null;
  recipe: Recipe;
};

export type Part =
  { type: 'text'; text: string } | { type: 'placeholder'; placeholder: Placeholder };

const BRACES = /\{([^{}]*)\}/g;
const INNER = /^([a-z_]+)(?:\|([a-z_]+)(?:\(([^()]*)\))?)?$/;

const ARGUMENTS: Record<RecipeFunction, (arg: string | null, token: TokenName) => boolean> = {
  // x<factor> (not 1) or +N / -N (not 0).
  numeric: (arg) =>
    arg !== null &&
    ((/^x\d+(\.\d+)?$/.test(arg) && Number(arg.slice(1)) > 0 && Number(arg.slice(1)) !== 1) ||
      (/^[+-]\d+$/.test(arg) && Number(arg) !== 0)),
  count: (arg) => arg !== null && /^[+-]\d+$/.test(arg) && Number(arg) !== 0,
  date: (arg) => arg !== null && /^[+-]\d+[dmy]$/.test(arg) && Number.parseInt(arg, 10) !== 0,
  id_mutation: (arg) => arg === null,
  geo_alt: (arg, token) => arg === GEO_SCOPES[TOKENS[token].kind as GeoKind],
  business_alt: (arg) => arg === null,
};

function parsePlaceholder(raw: string, inner: string): Placeholder {
  const m = INNER.exec(inner);
  if (!m) throw new GrammarError('unknown_token', raw);
  const [, token, fn, arg] = m;
  if (!isTokenName(token)) throw new GrammarError('unknown_token', raw);
  if (fn === undefined) return { raw, token, fn: null, arg: null, recipe: 'DIRECT_FACT' };
  if (!isRecipeFunction(fn)) throw new GrammarError('unknown_recipe', raw);
  if (!FUNCTION_KINDS[fn].includes(TOKENS[token].kind)) {
    throw new GrammarError('recipe_not_for_token', raw);
  }
  if (!ARGUMENTS[fn](arg ?? null, token)) throw new GrammarError('bad_argument', raw);
  return { raw, token, fn, arg: arg ?? null, recipe: RECIPE_FUNCTIONS[fn] };
}

/** Text and placeholders in the order written. Throws `GrammarError` on anything unknown. */
export function parseTemplate(text: string): Part[] {
  const parts: Part[] = [];
  let last = 0;
  for (const m of text.matchAll(BRACES)) {
    const at = m.index ?? 0;
    if (at > last) parts.push({ type: 'text', text: text.slice(last, at) });
    parts.push({ type: 'placeholder', placeholder: parsePlaceholder(m[0], m[1]) });
    last = at + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) });
  if (parts.some((p) => p.type === 'text' && /[{}]/.test(p.text))) {
    throw new GrammarError('unbalanced', text);
  }
  return parts;
}

export function placeholdersOf(text: string): Placeholder[] {
  return parseTemplate(text).flatMap((p) => (p.type === 'placeholder' ? [p.placeholder] : []));
}

/**
 * The recipe an option's text amounts to (D77): no placeholder is STATIC, one placeholder and
 * nothing else is that placeholder's recipe, anything more is a COMPOSITE_TEMPLATE.
 */
export function classify(text: string): Recipe {
  const parts = parseTemplate(text);
  const placeholders = parts.flatMap((p) => (p.type === 'placeholder' ? [p.placeholder] : []));
  if (placeholders.length === 0) return 'STATIC';
  const bare = parts.every((p) => p.type === 'placeholder' || p.text.trim() === '');
  return placeholders.length === 1 && bare ? placeholders[0].recipe : 'COMPOSITE_TEMPLATE';
}

/** The placeholders in order: a translation must have the same ones (spec §8). */
export function signature(text: string): string {
  return placeholdersOf(text)
    .map((p) => p.raw)
    .join(' ');
}
```

- [ ] **Step 5: Run the test to see it pass**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/mcq/grammar.test.ts && pnpm typecheck`
Expected: PASS, 7 tests; no type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/mcq/tokens.ts lib/domain/mcq/grammar.ts tests/unit/domain/mcq/grammar.test.ts
git commit -m "feat(bank): the placeholder grammar and the nine recipes (P17d, D77)"
```

---

## Task 4: Rendering — seeded, drawn without replacement, the same in three languages

**Files:**
- Create: `lib/domain/mcq/variant.ts`, `lib/domain/mcq/context.ts`, `lib/domain/mcq/format.ts`, `lib/domain/mcq/sample.ts`, `lib/domain/mcq/render.ts`
- Test: `tests/unit/domain/mcq/render.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/domain/mcq/render.test.ts
import { describe, expect, it } from 'vitest';
import type { RenderContext } from '@/lib/domain/mcq/context';
import { normalizeOption } from '@/lib/domain/mcq/format';
import { renderVariant } from '@/lib/domain/mcq/render';
import { SAMPLE_CONTEXT } from '@/lib/domain/mcq/sample';
import { inheritPlaceholders, type Variant, type VariantText } from '@/lib/domain/mcq/variant';
import type { Locale } from '@/lib/domain/thai-date';
import { isValidJuristicId } from '@/lib/domain/validation/juristic-id';

const text = (
  prompt: string,
  options: [string, string, string, string],
  explanation: string | null = null,
): VariantText => ({
  prompt,
  options: { A: options[0], B: options[1], C: options[2], D: options[3] },
  explanation,
});
type Renderable = Pick<Variant, 'appliesWhen' | 'texts'>;
const of = (th: VariantText, extra: Partial<Renderable> = {}): Renderable => ({
  appliesWhen: null,
  texts: { th },
  ...extra,
});
const render = (
  v: Renderable,
  locale: Locale = 'th',
  seed = 'seed-1',
  ctx: RenderContext = SAMPLE_CONTEXT,
) => {
  const r = renderVariant(v, ctx, seed, locale);
  if (!r.ok) throw new Error(`${r.code}: ${r.detail}`);
  return r.rendered;
};
const failure = (v: Renderable, ctx: RenderContext = SAMPLE_CONTEXT) => {
  const r = renderVariant(v, ctx, 'seed-1', 'th');
  return r.ok ? null : r.code;
};
const texts = (v: Renderable, locale: Locale = 'th', seed = 'seed-1') =>
  render(v, locale, seed).options.map((o) => o.text);
const withFacts = (facts: Partial<RenderContext['facts']>): RenderContext => ({
  ...SAMPLE_CONTEXT,
  facts: { ...SAMPLE_CONTEXT.facts, ...facts },
});

describe('renderVariant', () => {
  it('prints money, dates, counts, percents and names in each language', () => {
    const v = of(
      text('ทุนของ {company_name_th}', [
        '{registered_capital}',
        '{registered_on}',
        '{director_count}',
        '{my_shares} ({my_share_percent})',
      ]),
    );
    expect(render(v).prompt).toBe('ทุนของ บริษัท ตัวอย่างการค้า จำกัด');
    expect(texts(v, 'th')).toEqual(['2,000,000 บาท', '16 เมษายน 2569', '2', '12,000 (60%)']);
    expect(texts(v, 'en')).toEqual(['2,000,000 THB', '16 April 2026', '2', '12,000 (60%)']);
    expect(texts(v, 'zh')).toEqual(['2,000,000 泰铢', '2026年4月16日', '2', '12,000 (60%)']);
    const names = of(
      text('กรรมการ', ['{directors}', '{shareholders}', '{juristic_id}', '{address}']),
    );
    expect(texts(names, 'th')[0]).toBe('นางสาวสมหญิง ตัวอย่าง, นายสมชาย ตัวอย่าง');
    expect(texts(names, 'en')[0]).toBe('Miss Somying Tuayang, Mr. Somchai Tuayang');
    expect(texts(names, 'th')[3]).toContain('ร้อยเอ็ด');
  });

  it('varies numbers, counts and dates as written', () => {
    const v = of(
      text('?', [
        '{registered_capital|numeric(x0.5)}',
        '{registered_capital|numeric(+500000)}',
        '{director_count|count(+1)}',
        '{my_share_percent|numeric(x0.5)}',
      ]),
    );
    expect(texts(v)).toEqual(['1,000,000 บาท', '2,500,000 บาท', '3', '30%']);
    const dates = of(
      text('?', [
        '{registered_on|date(-1y)}',
        '{registered_on|date(+1m)}',
        '{registered_on|date(-10d)}',
        '{registered_on}',
      ]),
    );
    expect(texts(dates)).toEqual([
      '16 เมษายน 2568',
      '16 พฤษภาคม 2569',
      '6 เมษายน 2569',
      '16 เมษายน 2569',
    ]);
    // A month that is too short takes its last day.
    const r = renderVariant(
      of(text('?', ['{registered_on|date(+1m)}', 'b', 'c', 'd'])),
      withFacts({ registered_on: '2024-01-31' }),
      'seed-1',
      'th',
    );
    expect(r.ok && r.rendered.options[0].text).toBe('29 กุมภาพันธ์ 2567');
  });

  it('mutates a registration number into different, well-formed numbers', () => {
    const v = of(
      text('?', [
        '{juristic_id}',
        '{juristic_id|id_mutation}',
        '{juristic_id|id_mutation}',
        '{juristic_id|id_mutation}',
      ]),
    );
    const [own, ...wrong] = texts(v);
    expect(new Set([own, ...wrong]).size).toBe(4);
    for (const id of wrong) {
      expect(isValidJuristicId(id), id).toBe(true);
      expect(id[0]).toBe(own[0]);
    }
    expect(texts(v)).toEqual([own, ...wrong]);
    expect(texts(v, 'th', 'seed-2')).not.toEqual([own, ...wrong]);
  });

  it('draws places without replacement and shows the same places in every language', () => {
    const v = of(
      text('จังหวัดใด', [
        '{province}',
        '{province|geo_alt(region)}',
        '{province|geo_alt(region)}',
        '{province|geo_alt(region)}',
      ]),
    );
    const th = texts(v, 'th');
    expect(th[0]).toBe('ร้อยเอ็ด');
    expect(new Set(th).size).toBe(4);
    const english = Object.fromEntries(SAMPLE_CONTEXT.geo.provinces.map((p) => [p.th, p.en]));
    expect(texts(v, 'en')).toEqual(['Roi Et', ...th.slice(1).map((name) => english[name])]);
    expect(texts(v, 'zh')).toEqual([
      'ร้อยเอ็ด (Roi Et)',
      ...th.slice(1).map((name) => `${name} (${english[name]})`),
    ]);
    const smaller = of(
      text('?', [
        '{district}',
        '{district|geo_alt(province)}',
        '{subdistrict}',
        '{subdistrict|geo_alt(district)}',
      ]),
    );
    expect(texts(smaller)[0]).toBe('โพนทอง');
    expect(texts(smaller)[2]).toBe('หนองใหญ่');
  });

  it('draws business alternatives from active categories other than the company’s own', () => {
    const v = of(
      text('?', [
        '{business_category}',
        '{business_category|business_alt}',
        '{business_category|business_alt}',
        '{business_category|business_alt}',
      ]),
    );
    const th = texts(v);
    expect(th[0]).toBe('ค้าเสื้อผ้าและเครื่องแต่งกาย');
    expect(new Set(th).size).toBe(4);
    expect(th).not.toContain('หมวดที่เลิกใช้แล้ว');
    expect(texts(v, 'en')[0]).toBe('Clothing and fashion trading');
    expect(failure(v, withFacts({ business_category: null }))).toBe('no_category');
  });

  it('says why a variant cannot be rendered for a company', () => {
    expect(
      failure(
        of(text('?', ['{signing_authority}', 'b', 'c', 'd'])),
        withFacts({ signing_authority: null }),
      ),
    ).toBe('missing_fact');
    expect(failure(of(text('?', ['{director_count|count(-5)}', 'b', 'c', 'd'])))).toBe(
      'out_of_range',
    );
    expect(failure(of(text('?', ['{registered_capital|numeric(-9000000)}', 'b', 'c', 'd'])))).toBe(
      'out_of_range',
    );
    expect(
      failure(of(text('?', ['{province|geo_alt(region)}', 'b', 'c', 'd'])), {
        ...SAMPLE_CONTEXT,
        geo: { ...SAMPLE_CONTEXT.geo, provinces: [] },
      }),
    ).toBe('no_alternatives');
    expect(
      failure(
        of(text('?', ['a', 'b', 'c', 'd']), {
          appliesWhen: { fact: 'has_existing_customers', value: false },
        }),
      ),
    ).toBe('not_applicable');
    expect(failure({ appliesWhen: null, texts: {} })).toBe('no_text');
  });

  it('falls back to the Thai text when a translation is missing', () => {
    const v = of(text('ทุนเท่าใด', ['{registered_capital}', 'ข', 'ค', 'ง']));
    expect(render(v, 'en').prompt).toBe('ทุนเท่าใด');
    expect(render(v, 'en').options[0].text).toBe('2,000,000 THB');
  });
});

describe('inheritPlaceholders', () => {
  it('fills a blank translated option from a Thai option that is placeholders only', () => {
    const th = text('ทุนเท่าใด', [
      '{registered_capital}',
      '{registered_capital|numeric(x2)}',
      'ไม่ทราบ',
      '{director_count} คน',
    ]);
    const en = text('How much?', ['', '', '', '']);
    const out = inheritPlaceholders({ th, en });
    expect(out.en?.options).toEqual({
      A: '{registered_capital}',
      B: '{registered_capital|numeric(x2)}',
      C: '',
      D: '',
    });
    expect(out.th).toEqual(th);
  });
});

describe('normalizeOption', () => {
  it('ignores case, spacing and punctuation', () => {
    expect(normalizeOption('  Roi  Et. ')).toBe(normalizeOption('roi et'));
    expect(normalizeOption('1,000,000 บาท')).not.toBe(normalizeOption('2,000,000 บาท'));
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/mcq/render.test.ts`
Expected: FAIL — `Cannot find module '@/lib/domain/mcq/render'`.

- [ ] **Step 3: The variant types**

```ts
// lib/domain/mcq/variant.ts
import type { StatusFact } from '@/lib/domain/facts/fact-sheet';
import type { Locale } from '@/lib/domain/thai-date';
import { GrammarError, parseTemplate } from './grammar';
import type { Recipe } from './tokens';

export const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;
export type VariantOptionKey = (typeof OPTION_KEYS)[number];
export const VARIANT_LOCALES = ['th', 'en', 'zh'] as const satisfies readonly Locale[];

/** One language of a variant: the prompt, exactly four options, an optional explanation. */
export type VariantText = {
  prompt: string;
  options: Record<VariantOptionKey, string>;
  explanation: string | null;
};

/** The status a variant is worded for (spec §8); null means every company. */
export type AppliesWhen = { fact: StatusFact; value: boolean };
export type VariantStatus = 'draft' | 'approved' | 'retired';

/**
 * A question variant of one MCQ concept. Thai is the text it is approved on; English and
 * Chinese are reference translations with the same placeholders.
 */
export type Variant = {
  id: string;
  key: string;
  conceptKey: string;
  status: VariantStatus;
  correctKey: VariantOptionKey;
  optionRecipes: Record<VariantOptionKey, Recipe>;
  appliesWhen: AppliesWhen | null;
  texts: Partial<Record<Locale, VariantText>>;
};

/** What the validator and the writer need: a variant before it has an id. */
export type VariantDraft = Pick<
  Variant,
  'conceptKey' | 'correctKey' | 'optionRecipes' | 'appliesWhen' | 'texts'
>;

/** A starter draft: a variant with the key it is loaded under (`lib/content/mcq-starter.ts`). */
export type StarterVariant = VariantDraft & { key: string };

function placeholdersOnly(option: string): boolean {
  try {
    const parts = parseTemplate(option);
    return (
      parts.some((p) => p.type === 'placeholder') &&
      parts.every((p) => p.type === 'placeholder' || p.text.trim() === '')
    );
  } catch (e) {
    if (e instanceof GrammarError) return false;
    throw e;
  }
}

/**
 * A blank English or Chinese option takes the Thai option when that one is placeholders only:
 * `{registered_capital|numeric(x2)}` reads the same in every language.
 */
export function inheritPlaceholders(texts: Variant['texts']): Variant['texts'] {
  const th = texts.th;
  if (!th) return texts;
  const out: Variant['texts'] = { th };
  for (const locale of ['en', 'zh'] as const) {
    const text = texts[locale];
    if (!text) continue;
    const options = { ...text.options };
    for (const key of OPTION_KEYS) {
      if (options[key].trim() === '' && placeholdersOnly(th.options[key])) {
        options[key] = th.options[key].trim();
      }
    }
    out[locale] = { ...text, options };
  }
  return out;
}
```

- [ ] **Step 4: The render context and the formatters**

```ts
// lib/domain/mcq/context.ts
import type { FactSheet } from '@/lib/domain/facts/fact-sheet';

/** A place by its two names; the geography tables carry no Chinese name. */
export type GeoName = { id: number; th: string; en: string };

/** A business category with its three labels; alternates are drawn from the active ones. */
export type CategoryLabel = { key: string; th: string; en: string; zh: string; active: boolean };

/**
 * Everything a variant is rendered from: the pinned facts, the registered address's own places
 * and their siblings (the other provinces of its region, the other districts of its province,
 * the other subdistricts of its district), and the category dictionary (spec §5.2, §5.3).
 */
export type RenderContext = {
  facts: FactSheet;
  geo: {
    province: GeoName | null;
    district: GeoName | null;
    subdistrict: GeoName | null;
    provinces: GeoName[];
    districts: GeoName[];
    subdistricts: GeoName[];
  };
  categories: CategoryLabel[];
};
```

```ts
// lib/domain/mcq/format.ts
import type { Locale } from '@/lib/domain/thai-date';
import type { GeoName } from './context';
import type { TokenKind } from './tokens';

const NUMBER_LOCALES: Record<Locale, string> = { th: 'th-TH', en: 'en-US', zh: 'zh-CN' };
const CURRENCY: Record<Locale, string> = { th: 'บาท', en: 'THB', zh: '泰铢' };

export function formatNumber(n: number, locale: Locale): string {
  return n.toLocaleString(NUMBER_LOCALES[locale], { maximumFractionDigits: 2 });
}

/** Money with its currency word, a percent with its sign, anything else a plain number. */
export function formatQuantity(kind: TokenKind, n: number, locale: Locale): string {
  if (kind === 'money') return `${formatNumber(n, locale)} ${CURRENCY[locale]}`;
  if (kind === 'percent') return `${formatNumber(n, locale)}%`;
  return formatNumber(n, locale);
}

/** Thai and English show their own name; Chinese has none, so it shows both (plan decision 9). */
export function geoLabel(place: GeoName, locale: Locale): string {
  if (locale === 'th') return place.th;
  if (locale === 'en') return place.en;
  return `${place.th} (${place.en})`;
}

/**
 * What two options are compared on: case, spacing and punctuation do not make them differ. A
 * point or comma between two digits is part of the number and stays.
 */
export function normalizeOption(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[;:!?'"“”‘’()[\]–—-]/g, '')
    .replace(/(?<!\d)[.,]|[.,](?!\d)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
```

- [ ] **Step 5: The sample company**

```ts
// lib/domain/mcq/sample.ts
import { withCheckDigit } from '@/lib/domain/validation/juristic-id';
import type { RenderContext } from './context';

/**
 * A plainly fictional company for previews and tests: every fact a variant may name is present,
 * the address is a real place (Nong Yai, Phon Thong, Roi Et) with a few real siblings, and the
 * learner is the larger of two shareholders. It is never stored and never shown to a learner.
 */
export const SAMPLE_CONTEXT: RenderContext = {
  facts: {
    company_name_th: 'บริษัท ตัวอย่างการค้า จำกัด',
    company_name_en: 'SAMPLE TRADING CO., LTD.',
    juristic_id: withCheckDigit('010556900012'),
    registered_on: '2026-04-16',
    registered_capital: 2_000_000,
    directors: [
      { name_th: 'นางสาวสมหญิง ตัวอย่าง', name_en: 'Miss Somying Tuayang' },
      { name_th: 'นายสมชาย ตัวอย่าง', name_en: 'Mr. Somchai Tuayang' },
    ],
    signing_authority: 'กรรมการหนึ่งคนลงลายมือชื่อและประทับตราสำคัญของบริษัท',
    address: {
      full: 'เลขที่ 87 หมู่ที่ 9 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด 45110',
      house_no: '87',
      moo: '9',
      road: null,
      subdistrict: 'หนองใหญ่',
      district: 'โพนทอง',
      province: 'ร้อยเอ็ด',
      postcode: '45110',
      province_id: 1,
      district_id: 1,
      subdistrict_id: 1,
      postcode_source: 'printed',
      status: 'resolved',
      issues: [],
    },
    shareholders: [
      { name: 'นางสาวสมหญิง ตัวอย่าง', nationality: 'ไทย', shares: 12_000, percent: null },
      { name: 'นายสมชาย ตัวอย่าง', nationality: 'ไทย', shares: 8_000, percent: null },
    ],
    total_shares: 20_000,
    nature_of_business: 'ค้าส่งและค้าปลีกเสื้อผ้าสตรี',
    products_services: 'ชุดเดรส เสื้อ และกระโปรงสตรี',
    business_purpose: 'จำหน่ายเสื้อผ้าสตรีในภาคอีสาน',
    main_clients: 'ร้านค้าปลีกเสื้อผ้าในจังหวัดร้อยเอ็ดและใกล้เคียง',
    client_origin: 'หน้าร้านและช่องทางออนไลน์',
    main_suppliers: 'โรงงานตัดเย็บในกรุงเทพมหานคร',
    business_address: 'เลขที่ 87 หมู่ที่ 9 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด',
    monthly_revenue: 'ประมาณ 300,000 บาท',
    revenue_basis: 'ลูกค้าประมาณ 30 ราย เฉลี่ยรายละ 10,000 บาท',
    average_transaction: 'ประมาณ 10,000 บาท',
    monthly_transactions: 'ประมาณ 30 รายการ',
    source_of_funds: 'เงินออมของกรรมการ',
    first_incoming_funds: 'ทุนจดทะเบียนจากผู้ถือหุ้น',
    account_purpose: 'รับชำระค่าสินค้าและจ่ายค่าวัตถุดิบ',
    promptpay_qr_purpose: 'ให้ลูกค้าชำระเงินได้สะดวก',
    customer_examples: 'ร้านบุษบา ร้อยเอ็ด',
    customer_profile: 'ร้านค้าปลีกในประเทศ',
    transaction_details: 'โอนเข้าบัญชีบริษัทหลังส่งสินค้า',
    operations_started: true,
    has_existing_customers: true,
    has_completed_transactions: true,
    has_regular_suppliers: true,
    learner_is_shareholder: true,
    business_category: 'clothing_fashion',
    holder_name: 'นางสาวสมหญิง ตัวอย่าง',
    position: 'กรรมการผู้จัดการ',
    director_count: 2,
    shareholder_count: 2,
    my_shares: 12_000,
    my_share_percent: 60,
  },
  geo: {
    province: { id: 1, th: 'ร้อยเอ็ด', en: 'Roi Et' },
    district: { id: 1, th: 'โพนทอง', en: 'Phon Thong' },
    subdistrict: { id: 1, th: 'หนองใหญ่', en: 'Nong Yai' },
    provinces: [
      { id: 2, th: 'ขอนแก่น', en: 'Khon Kaen' },
      { id: 3, th: 'มหาสารคาม', en: 'Maha Sarakham' },
      { id: 4, th: 'กาฬสินธุ์', en: 'Kalasin' },
      { id: 5, th: 'ยโสธร', en: 'Yasothon' },
    ],
    districts: [
      { id: 2, th: 'เมืองร้อยเอ็ด', en: 'Mueang Roi Et' },
      { id: 3, th: 'เสลภูมิ', en: 'Selaphum' },
      { id: 4, th: 'สุวรรณภูมิ', en: 'Suwannaphum' },
      { id: 5, th: 'เกษตรวิสัย', en: 'Kaset Wisai' },
    ],
    subdistricts: [
      { id: 2, th: 'แวง', en: 'Waeng' },
      { id: 3, th: 'โคกกกม่วง', en: 'Khok Kok Muang' },
      { id: 4, th: 'นาอุดม', en: 'Na Udom' },
      { id: 5, th: 'สว่าง', en: 'Sawang' },
    ],
  },
  categories: [
    {
      key: 'clothing_fashion',
      th: 'ค้าเสื้อผ้าและเครื่องแต่งกาย',
      en: 'Clothing and fashion trading',
      zh: '服装与时尚贸易',
      active: true,
    },
    {
      key: 'restaurant_catering',
      th: 'ร้านอาหารและบริการจัดเลี้ยง',
      en: 'Restaurants and catering',
      zh: '餐饮与宴会服务',
      active: true,
    },
    {
      key: 'construction_contracting',
      th: 'รับเหมาก่อสร้างและตกแต่ง',
      en: 'Construction and fit-out contracting',
      zh: '建筑与装修承包',
      active: true,
    },
    {
      key: 'software_it_services',
      th: 'บริการซอฟต์แวร์และเทคโนโลยีสารสนเทศ',
      en: 'Software and IT services',
      zh: '软件与信息技术服务',
      active: true,
    },
    {
      key: 'logistics_transport',
      th: 'ขนส่งและโลจิสติกส์',
      en: 'Transport and logistics',
      zh: '运输与物流',
      active: true,
    },
    {
      key: 'retired_sample',
      th: 'หมวดที่เลิกใช้แล้ว',
      en: 'A retired category',
      zh: '已停用的类别',
      active: false,
    },
  ],
};
```

- [ ] **Step 6: The renderer**

```ts
// lib/domain/mcq/render.ts
import { createRng, shuffleWith } from '@/lib/domain/assessment/random';
import type { FactKey, FactSheet } from '@/lib/domain/facts/fact-sheet';
import { formatDate, type ISODate, type Locale } from '@/lib/domain/thai-date';
import { withCheckDigit } from '@/lib/domain/validation/juristic-id';
import type { CategoryLabel, RenderContext } from './context';
import { formatNumber, formatQuantity, geoLabel } from './format';
import { GrammarError, parseTemplate, type Placeholder } from './grammar';
import { TOKENS, type GeoKind, type TokenKind, type TokenName } from './tokens';
import { OPTION_KEYS, type Variant, type VariantOptionKey } from './variant';

export type RenderFailureCode =
  | 'no_text'
  | 'not_applicable'
  | 'missing_fact'
  | 'no_category'
  | 'no_alternatives'
  | 'out_of_range'
  | 'grammar';

export type Rendered = {
  prompt: string;
  options: { key: VariantOptionKey; text: string }[];
  explanation: string | null;
};

export type RenderResult =
  { ok: true; rendered: Rendered } | { ok: false; code: RenderFailureCode; detail: string };

class RenderFailure extends Error {
  constructor(
    public readonly code: RenderFailureCode,
    public readonly detail: string,
  ) {
    super(`${code}: ${detail}`);
  }
}

const SIBLINGS = {
  province: 'provinces',
  district: 'districts',
  subdistrict: 'subdistricts',
} as const;

/** One or two digits changed, never the first, the check digit recomputed (plan decision 7). */
export function mutateId(id: string, rng: () => number): string {
  const digits = id.slice(0, 12).split('');
  const changes = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < changes; i++) {
    const at = 1 + Math.floor(rng() * 11);
    const shift = 1 + Math.floor(rng() * 9);
    digits[at] = String((Number(digits[at]) + shift) % 10);
  }
  return withCheckDigit(digits.join(''));
}

/**
 * What one rendering has drawn so far. A list is shuffled once per seed and handed out in
 * order, so alternates never repeat inside a question, and a second language asking in the
 * same order gets the same draws (spec §8).
 */
class Draws {
  private readonly lists = new Map<string, unknown[]>();
  private readonly taken = new Map<string, number>();
  private readonly ids: string[] = [];

  constructor(private readonly seed: string) {}

  next<T>(name: string, candidates: readonly T[]): T | null {
    let list = this.lists.get(name) as T[] | undefined;
    if (!list) {
      list = shuffleWith(candidates, createRng(`${this.seed}:${name}`));
      this.lists.set(name, list);
    }
    const index = this.taken.get(name) ?? 0;
    this.taken.set(name, index + 1);
    return list[index] ?? null;
  }

  mutatedId(original: string): string | null {
    const rng = createRng(`${this.seed}:id_mutation:${this.ids.length}`);
    for (let attempt = 0; attempt < 50; attempt++) {
      const candidate = mutateId(original, rng);
      if (candidate !== original && !this.ids.includes(candidate)) {
        this.ids.push(candidate);
        return candidate;
      }
    }
    return null;
  }
}

function numberOf(token: TokenName, facts: FactSheet): number | null {
  switch (token) {
    case 'registered_capital':
      return facts.registered_capital;
    case 'total_shares':
      return facts.total_shares;
    case 'my_shares':
      return facts.my_shares;
    case 'my_share_percent':
      return facts.my_share_percent;
    case 'director_count':
      return facts.director_count;
    case 'shareholder_count':
      return facts.shareholder_count;
    default:
      return null;
  }
}

function textOf(token: TokenName, facts: FactSheet): string | null {
  if (token === 'address') return facts.address?.full ?? null;
  if (token === 'postcode') return facts.address?.postcode ?? null;
  const value = facts[token as FactKey];
  return typeof value === 'string' ? value : null;
}

function varyNumber(base: number, arg: string, kind: TokenKind, raw: string): number {
  const moved = arg.startsWith('x') ? base * Number(arg.slice(1)) : base + Number(arg);
  const value = kind === 'percent' ? Math.round(moved * 100) / 100 : Math.round(moved);
  if (!(value > 0) || (kind === 'percent' && value > 100)) {
    throw new RenderFailure('out_of_range', raw);
  }
  return value;
}

/** ±N days, months or years; a month that is too short takes its last day. */
function shiftDate(date: ISODate, arg: string): ISODate {
  const n = Number.parseInt(arg, 10);
  const unit = arg.at(-1);
  const [y, m, d] = date.split('-').map(Number);
  const iso = (t: Date) => t.toISOString().slice(0, 10);
  if (unit === 'd') return iso(new Date(Date.UTC(y, m - 1, d + n)));
  const months = y * 12 + (m - 1) + (unit === 'y' ? n * 12 : n);
  const year = Math.floor(months / 12);
  const month = months % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(year, month, Math.min(d, last))));
}

function ownCategory(ctx: RenderContext): CategoryLabel {
  const own = ctx.categories.find((c) => c.key === ctx.facts.business_category);
  if (!own) throw new RenderFailure('no_category', 'business_category');
  return own;
}

function resolve(p: Placeholder, ctx: RenderContext, locale: Locale, draws: Draws): string {
  const { facts } = ctx;
  const kind = TOKENS[p.token].kind;
  const missing = (): never => {
    throw new RenderFailure('missing_fact', p.token);
  };

  if (p.fn === null) {
    if (kind === 'text') return textOf(p.token, facts)?.trim() || missing();
    if (kind === 'names') {
      const names =
        p.token === 'directors'
          ? facts.directors.map((d) => (locale === 'en' ? (d.name_en ?? d.name_th) : d.name_th))
          : facts.shareholders.map((s) => s.name);
      return names.length > 0 ? names.join(', ') : missing();
    }
    if (kind === 'id') return facts.juristic_id ?? missing();
    if (kind === 'date') {
      return facts.registered_on ? formatDate(facts.registered_on, locale) : missing();
    }
    if (kind === 'province' || kind === 'district' || kind === 'subdistrict') {
      const own = ctx.geo[kind];
      return own ? geoLabel(own, locale) : missing();
    }
    if (kind === 'category') return ownCategory(ctx)[locale];
    const n = numberOf(p.token, facts);
    return n === null ? missing() : formatQuantity(kind, n, locale);
  }

  const arg = p.arg ?? '';
  switch (p.fn) {
    case 'numeric': {
      const base = numberOf(p.token, facts) ?? missing();
      return formatQuantity(kind, varyNumber(base, arg, kind, p.raw), locale);
    }
    case 'count': {
      const value = (numberOf(p.token, facts) ?? missing()) + Number(arg);
      if (value < 1) throw new RenderFailure('out_of_range', p.raw);
      return formatNumber(value, locale);
    }
    case 'date':
      return formatDate(shiftDate(facts.registered_on ?? missing(), arg), locale);
    case 'id_mutation': {
      const base = facts.juristic_id ?? missing();
      if (!/^\d{13}$/.test(base)) throw new RenderFailure('out_of_range', p.raw);
      const mutated = draws.mutatedId(base);
      if (!mutated) throw new RenderFailure('no_alternatives', p.raw);
      return mutated;
    }
    case 'geo_alt': {
      const place = kind as GeoKind;
      if (!ctx.geo[place]) missing();
      const pick = draws.next(`geo_alt:${place}`, ctx.geo[SIBLINGS[place]]);
      if (!pick) throw new RenderFailure('no_alternatives', p.raw);
      return geoLabel(pick, locale);
    }
    case 'business_alt': {
      const own = ownCategory(ctx);
      const pick = draws.next(
        'business_alt',
        ctx.categories.filter((c) => c.active && c.key !== own.key),
      );
      if (!pick) throw new RenderFailure('no_alternatives', p.raw);
      return pick[locale];
    }
  }
}

function renderText(text: string, ctx: RenderContext, locale: Locale, draws: Draws): string {
  return parseTemplate(text)
    .map((part) =>
      part.type === 'text' ? part.text : resolve(part.placeholder, ctx, locale, draws),
    )
    .join('')
    .trim();
}

/**
 * Renders a variant for one company in one language. The seed fixes every draw; options come
 * back in the order written (shuffling is the attempt's business, P17e). A language without a
 * translation shows the Thai text with that language's formatting.
 */
export function renderVariant(
  variant: Pick<Variant, 'appliesWhen' | 'texts'>,
  ctx: RenderContext,
  seed: string,
  locale: Locale,
): RenderResult {
  const text = variant.texts[locale] ?? variant.texts.th;
  if (!text) return { ok: false, code: 'no_text', detail: locale };
  const when = variant.appliesWhen;
  if (when && ctx.facts[when.fact] !== when.value) {
    return { ok: false, code: 'not_applicable', detail: when.fact };
  }
  const draws = new Draws(seed);
  try {
    const prompt = renderText(text.prompt, ctx, locale, draws);
    const options = OPTION_KEYS.map((key) => ({
      key,
      text: renderText(text.options[key], ctx, locale, draws),
    }));
    const explanation = text.explanation ? renderText(text.explanation, ctx, locale, draws) : null;
    return { ok: true, rendered: { prompt, options, explanation } };
  } catch (e) {
    if (e instanceof RenderFailure) return { ok: false, code: e.code, detail: e.detail };
    if (e instanceof GrammarError) return { ok: false, code: 'grammar', detail: e.raw };
    throw e;
  }
}
```

- [ ] **Step 7: Run the test to see it pass**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/mcq/render.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS, 9 tests; no type or lint errors.

- [ ] **Step 8: Commit**

```bash
git add lib/domain/mcq/variant.ts lib/domain/mcq/context.ts lib/domain/mcq/format.ts lib/domain/mcq/sample.ts lib/domain/mcq/render.ts tests/unit/domain/mcq/render.test.ts
git commit -m "feat(bank): render a variant from a company's facts — seeded draws, three languages (P17d, D77)"
```

---

## Task 5: The rules — validation, preflight, coverage

**Files:**
- Create: `lib/domain/mcq/validate.ts`, `lib/domain/mcq/preflight.ts`, `lib/domain/mcq/coverage.ts`
- Test: `tests/unit/domain/mcq/rules.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/domain/mcq/rules.test.ts
import { describe, expect, it } from 'vitest';
import type { RenderContext } from '@/lib/domain/mcq/context';
import { bankCoverage } from '@/lib/domain/mcq/coverage';
import { checkBank, pickVariant, preflightVariant } from '@/lib/domain/mcq/preflight';
import { SAMPLE_CONTEXT } from '@/lib/domain/mcq/sample';
import type { Recipe } from '@/lib/domain/mcq/tokens';
import { validateVariant } from '@/lib/domain/mcq/validate';
import type { Variant, VariantText } from '@/lib/domain/mcq/variant';

const text = (
  prompt: string,
  options: [string, string, string, string],
  explanation: string | null = null,
): VariantText => ({
  prompt,
  options: { A: options[0], B: options[1], C: options[2], D: options[3] },
  explanation,
});
const recipes = (a: Recipe, b: Recipe, c: Recipe, d: Recipe) => ({ A: a, B: b, C: c, D: d });
let n = 0;
const variant = (over: Partial<Variant> = {}): Variant => ({
  id: `v${++n}`,
  key: `mcq-test-${n}`,
  conceptKey: 'registered_capital',
  status: 'approved',
  correctKey: 'A',
  optionRecipes: recipes(
    'DIRECT_FACT',
    'NUMERIC_VARIATION',
    'NUMERIC_VARIATION',
    'NUMERIC_VARIATION',
  ),
  appliesWhen: null,
  texts: {
    th: text('ทุนจดทะเบียนของ {company_name_th} คือเท่าใด', [
      '{registered_capital}',
      '{registered_capital|numeric(x0.5)}',
      '{registered_capital|numeric(x2)}',
      '{registered_capital|numeric(x10)}',
    ]),
  },
  ...over,
});
const codes = (v: Variant) => validateVariant(v).map((i) => `${i.code}@${i.where}`);
const withFacts = (facts: Partial<RenderContext['facts']>): RenderContext => ({
  ...SAMPLE_CONTEXT,
  facts: { ...SAMPLE_CONTEXT.facts, ...facts },
});

describe('validateVariant', () => {
  it('accepts a well-formed variant', () => {
    expect(validateVariant(variant())).toEqual([]);
  });

  it('needs a concept the MCQ asks, Thai text, a prompt and four options', () => {
    expect(codes(variant({ conceptKey: 'registered_address' }))).toEqual([
      'unknown_concept@concept',
    ]);
    expect(codes(variant({ texts: {} }))).toEqual(['thai_required@th']);
    const blank = variant({ texts: { th: text(' ', ['{registered_capital}', '', 'ค', 'ง']) } });
    expect(codes(blank)).toContain('prompt_required@th.prompt');
    expect(codes(blank)).toContain('option_required@th.B');
  });

  it('names a placeholder the grammar does not accept, where it is', () => {
    const bad = variant({
      texts: { th: text('ทุน', ['{registered_capital}', '{capital|numeric(x2)}', 'ค', 'ง']) },
    });
    expect(validateVariant(bad)).toEqual([
      { code: 'grammar', where: 'th.B', detail: 'unknown_token: {capital|numeric(x2)}' },
    ]);
  });

  it('holds every option to the recipe it declares', () => {
    const v = variant({
      optionRecipes: recipes('DIRECT_FACT', 'STATIC', 'NUMERIC_VARIATION', 'NUMERIC_VARIATION'),
    });
    expect(validateVariant(v)).toEqual([
      { code: 'recipe_mismatch', where: 'th.B', detail: 'NUMERIC_VARIATION' },
    ]);
  });

  it('keeps variation out of the prompt and the explanation', () => {
    const v = variant();
    v.texts.th!.prompt = 'ทุน {registered_capital|numeric(x2)} ใช่หรือไม่';
    v.texts.th!.explanation = 'เลข {juristic_id|id_mutation}';
    expect(codes(v)).toEqual(['prompt_varies@th.prompt', 'prompt_varies@th.explanation']);
  });

  it('builds the correct option only from the concept’s own facts, unvaried', () => {
    const varied = variant({ correctKey: 'B' });
    expect(codes(varied)).toContain('correct_varies@th.B');

    const foreign = variant({
      optionRecipes: recipes(
        'DIRECT_FACT',
        'NUMERIC_VARIATION',
        'NUMERIC_VARIATION',
        'NUMERIC_VARIATION',
      ),
      texts: {
        th: text('ทุน', [
          '{total_shares}',
          '{registered_capital|numeric(x0.5)}',
          '{registered_capital|numeric(x2)}',
          '{registered_capital|numeric(x10)}',
        ]),
      },
    });
    expect(validateVariant(foreign)).toEqual([
      { code: 'correct_foreign_fact', where: 'th.A', detail: 'total_shares' },
    ]);

    const staticCorrect = variant({
      optionRecipes: recipes('STATIC', 'STATIC', 'STATIC', 'STATIC'),
      texts: { th: text('ทุน', ['หนึ่งล้านบาท', 'สองล้านบาท', 'สามล้านบาท', 'สี่ล้านบาท']) },
    });
    expect(codes(staticCorrect)).toEqual(['correct_needs_fact@th.A']);

    // A policy concept's correct answer is static text.
    const policy = variant({
      conceptKey: 'otp_control',
      optionRecipes: recipes('STATIC', 'STATIC', 'STATIC', 'STATIC'),
      texts: { th: text('ใครถือ OTP', ['กรรมการ', 'พนักงาน', 'ตัวแทน', 'ใครก็ได้']) },
    });
    expect(validateVariant(policy)).toEqual([]);
    const policyWithFact = variant({
      conceptKey: 'otp_control',
      optionRecipes: recipes('DIRECT_FACT', 'STATIC', 'STATIC', 'STATIC'),
      texts: { th: text('ใครถือ OTP', ['{holder_name}', 'พนักงาน', 'ตัวแทน', 'ใครก็ได้']) },
    });
    expect(codes(policyWithFact)).toEqual(['correct_foreign_fact@th.A']);
  });

  it('allows a static correct answer when the variant is worded for one status', () => {
    const v = variant({
      conceptKey: 'learner_shareholding',
      appliesWhen: { fact: 'learner_is_shareholder', value: false },
      optionRecipes: recipes('STATIC', 'COMPOSITE_TEMPLATE', 'STATIC', 'STATIC'),
      texts: {
        th: text('คุณถือหุ้นหรือไม่', [
          'ไม่ได้ถือหุ้น',
          'ถือหุ้นทั้งหมด {total_shares} หุ้น',
          'ถือหุ้นร้อยละ 50',
          'ถือหุ้นร้อยละ 25',
        ]),
      },
    });
    expect(validateVariant(v)).toEqual([]);
    expect(codes(variant({ appliesWhen: { fact: 'operations_started', value: true } }))).toEqual([
      'applies_when_fact@appliesWhen',
    ]);
  });

  it('refuses two options with the same text, unless the text is drawn', () => {
    const same = variant({
      texts: {
        th: text('ทุน', [
          '{registered_capital}',
          '{registered_capital|numeric(x2)}',
          '{registered_capital|numeric(x2)}',
          '{registered_capital|numeric(x10)}',
        ]),
      },
    });
    expect(validateVariant(same)).toEqual([
      { code: 'duplicate_option', where: 'th.C', detail: 'B' },
    ]);
    const drawn = variant({
      conceptKey: 'registration_number',
      optionRecipes: recipes('DIRECT_FACT', 'ID_MUTATION', 'ID_MUTATION', 'ID_MUTATION'),
      texts: {
        th: text('เลขทะเบียน', [
          '{juristic_id}',
          '{juristic_id|id_mutation}',
          '{juristic_id|id_mutation}',
          '{juristic_id|id_mutation}',
        ]),
      },
    });
    expect(validateVariant(drawn)).toEqual([]);
  });

  it('holds a translation to the Thai placeholders', () => {
    const v = variant();
    v.texts.en = text('What is the registered capital?', [
      '{registered_capital}',
      '{registered_capital|numeric(x0.5)}',
      '{registered_capital|numeric(x3)}',
      '{registered_capital|numeric(x10)}',
    ]);
    expect(codes(v)).toEqual([
      'translation_placeholders@en.prompt',
      'translation_placeholders@en.C',
    ]);
  });
});

describe('preflight', () => {
  it('passes a variant whose four options come out different and non-empty', () => {
    const r = preflightVariant(variant(), SAMPLE_CONTEXT, 'seed');
    expect(r.ok).toBe(true);
    expect(r.ok && r.rendered.options.map((o) => o.text)).toEqual([
      '2,000,000 บาท',
      '1,000,000 บาท',
      '4,000,000 บาท',
      '20,000,000 บาท',
    ]);
  });

  it('fails a variant whose options collide for this company', () => {
    // A capital of 1 baht halves to 1 after rounding: two options read the same.
    const r = preflightVariant(variant(), withFacts({ registered_capital: 1 }), 'seed');
    expect(r).toMatchObject({ ok: false, code: 'duplicate_option', detail: 'A = B' });
  });

  it('passes a failure of rendering or of the rules through', () => {
    expect(
      preflightVariant(variant(), withFacts({ registered_capital: null }), 'seed'),
    ).toMatchObject({ ok: false, code: 'missing_fact' });
    expect(preflightVariant(variant({ correctKey: 'B' }), SAMPLE_CONTEXT, 'seed')).toMatchObject({
      ok: false,
      code: 'invalid',
      detail: 'correct_varies',
    });
  });

  it('picks the first approved variant that passes and says why the others did not', () => {
    const fragile = variant({ key: 'mcq-a' });
    const sturdy = variant({
      key: 'mcq-b',
      optionRecipes: recipes(
        'DIRECT_FACT',
        'NUMERIC_VARIATION',
        'NUMERIC_VARIATION',
        'NUMERIC_VARIATION',
      ),
      texts: {
        th: text('ทุนเท่าใด', [
          '{registered_capital}',
          '{registered_capital|numeric(+1000)}',
          '{registered_capital|numeric(+2000)}',
          '{registered_capital|numeric(+3000)}',
        ]),
      },
    });
    const draft = variant({ key: 'mcq-0', status: 'draft' });
    const all = [sturdy, draft, fragile];
    expect(pickVariant('registered_capital', all, SAMPLE_CONTEXT, 'seed').variant?.key).toBe(
      'mcq-a',
    );
    const poor = pickVariant(
      'registered_capital',
      all,
      withFacts({ registered_capital: 1 }),
      'seed',
    );
    expect(poor.variant?.key).toBe('mcq-b');
    expect(poor.skipped).toEqual([{ key: 'mcq-a', code: 'duplicate_option', detail: 'A = B' }]);
    const none = pickVariant('registered_capital', [draft], SAMPLE_CONTEXT, 'seed');
    expect(none.variant).toBeNull();
    expect(none.skipped).toEqual([]);
  });

  it('checks the whole bank against one company: thirty concepts in MCQ order', () => {
    const checks = checkBank([variant()], SAMPLE_CONTEXT, 'seed');
    expect(checks).toHaveLength(30);
    expect(checks[0].conceptKey).toBe('company_name');
    expect(checks.filter((c) => c.variant).map((c) => c.conceptKey)).toEqual([
      'registered_capital',
    ]);
  });
});

describe('bankCoverage', () => {
  it('counts a concept as covered only when every status it turns on has an approved variant', () => {
    const yes = variant({
      conceptKey: 'main_clients',
      appliesWhen: { fact: 'has_existing_customers', value: true },
    });
    const noDraft = variant({
      conceptKey: 'main_clients',
      status: 'draft',
      appliesWhen: { fact: 'has_existing_customers', value: false },
    });
    const coverage = bankCoverage([variant(), variant({ status: 'retired' }), yes, noDraft]);
    expect(coverage.total).toBe(30);
    expect(coverage.ready).toBe(1);
    const capital = coverage.concepts.find((c) => c.conceptKey === 'registered_capital')!;
    expect(capital).toMatchObject({
      covered: true,
      counts: { approved: 1, draft: 0, retired: 1 },
      cases: [{ when: null, approved: 1 }],
    });
    const clients = coverage.concepts.find((c) => c.conceptKey === 'main_clients')!;
    expect(clients.covered).toBe(false);
    expect(clients.cases).toEqual([
      { when: { fact: 'has_existing_customers', value: true }, approved: 1 },
      { when: { fact: 'has_existing_customers', value: false }, approved: 0 },
    ]);
    // A variant for every company covers both cases.
    const both = bankCoverage([variant({ conceptKey: 'main_clients', texts: {} })]);
    expect(both.concepts.find((c) => c.conceptKey === 'main_clients')!.covered).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/mcq/rules.test.ts`
Expected: FAIL — `Cannot find module '@/lib/domain/mcq/coverage'`.

- [ ] **Step 3: The validator**

```ts
// lib/domain/mcq/validate.ts
import { MCQ_CONCEPTS } from '@/lib/domain/concepts/registry';
import type { FactKey } from '@/lib/domain/facts/fact-sheet';
import { classify, GrammarError, placeholdersOf, signature } from './grammar';
import { DRAWING_FUNCTIONS, TOKENS } from './tokens';
import { OPTION_KEYS, VARIANT_LOCALES, type VariantDraft, type VariantText } from './variant';

export const ISSUE_CODES = [
  'unknown_concept',
  'thai_required',
  'prompt_required',
  'option_required',
  'grammar',
  'recipe_mismatch',
  'prompt_varies',
  'correct_varies',
  'correct_foreign_fact',
  'correct_needs_fact',
  'duplicate_option',
  'applies_when_fact',
  'translation_placeholders',
] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];

/** One thing wrong with a variant: what, where (`th.B`, `en.prompt`, `appliesWhen`) and a detail. */
export type VariantIssue = { code: IssueCode; where: string; detail: string };

const FIELDS = ['prompt', ...OPTION_KEYS, 'explanation'] as const;
type Field = (typeof FIELDS)[number];

const fieldText = (text: VariantText, field: Field): string =>
  field === 'prompt'
    ? text.prompt
    : field === 'explanation'
      ? (text.explanation ?? '')
      : text.options[field];

/**
 * Every rule a variant must keep to be saved and approved (spec §8, plan decisions 4–8). An
 * empty list means valid. Grammar errors are reported alone: the later rules read parsed text.
 */
export function validateVariant(v: VariantDraft): VariantIssue[] {
  const concept = MCQ_CONCEPTS.find((c) => c.key === v.conceptKey);
  if (!concept) return [{ code: 'unknown_concept', where: 'concept', detail: v.conceptKey }];
  const th = v.texts.th;
  if (!th) return [{ code: 'thai_required', where: 'th', detail: '' }];

  const issues: VariantIssue[] = [];
  const add = (code: IssueCode, where: string, detail = '') => issues.push({ code, where, detail });

  // 1. Grammar, field by field, in every language that was written.
  for (const locale of VARIANT_LOCALES) {
    const text = v.texts[locale];
    if (!text) continue;
    for (const field of FIELDS) {
      try {
        placeholdersOf(fieldText(text, field));
      } catch (e) {
        if (!(e instanceof GrammarError)) throw e;
        add('grammar', `${locale}.${field}`, `${e.code}: ${e.raw}`);
      }
    }
  }
  if (issues.length > 0) return issues;

  if (v.appliesWhen && !concept.alternateWhen.includes(v.appliesWhen.fact)) {
    add('applies_when_fact', 'appliesWhen', v.appliesWhen.fact);
  }

  // 2. Each language: nothing blank, no variation outside the options, the Thai placeholders.
  for (const locale of VARIANT_LOCALES) {
    const text = v.texts[locale];
    if (!text) continue;
    if (text.prompt.trim() === '') add('prompt_required', `${locale}.prompt`);
    for (const key of OPTION_KEYS) {
      if (text.options[key].trim() === '') add('option_required', `${locale}.${key}`);
    }
    for (const field of ['prompt', 'explanation'] as const) {
      if (placeholdersOf(fieldText(text, field)).some((p) => p.fn !== null)) {
        add('prompt_varies', `${locale}.${field}`);
      }
    }
    if (locale === 'th') continue;
    for (const field of FIELDS) {
      const expected = signature(fieldText(th, field));
      if (signature(fieldText(text, field)) !== expected) {
        add('translation_placeholders', `${locale}.${field}`, expected);
      }
    }
  }

  // 3. The Thai options: the declared recipe, the correct option, no repeated text.
  for (const key of OPTION_KEYS) {
    const actual = classify(th.options[key]);
    if (th.options[key].trim() !== '' && v.optionRecipes[key] !== actual) {
      add('recipe_mismatch', `th.${key}`, actual);
    }
  }
  const correct = placeholdersOf(th.options[v.correctKey]);
  const where = `th.${v.correctKey}`;
  if (correct.some((p) => p.fn !== null)) add('correct_varies', where);
  const conceptFacts: readonly FactKey[] = concept.facts;
  const foreign = correct.filter((p) =>
    TOKENS[p.token].facts.some((fact) => !conceptFacts.includes(fact)),
  );
  if (foreign.length > 0) {
    add('correct_foreign_fact', where, [...new Set(foreign.map((p) => p.token))].join(', '));
  }
  if (
    correct.length === 0 &&
    th.options[v.correctKey].trim() !== '' &&
    concept.facts.length > 0 &&
    !v.appliesWhen
  ) {
    add('correct_needs_fact', where);
  }
  const seen = new Map<string, string>();
  for (const key of OPTION_KEYS) {
    const option = th.options[key].trim();
    if (option === '') continue;
    const drawn = placeholdersOf(option).some(
      (p) => p.fn !== null && DRAWING_FUNCTIONS.includes(p.fn),
    );
    if (drawn) continue;
    const earlier = seen.get(option);
    if (earlier) add('duplicate_option', `th.${key}`, earlier);
    else seen.set(option, key);
  }
  return issues;
}
```

- [ ] **Step 4: Preflight**

```ts
// lib/domain/mcq/preflight.ts
import { MCQ_CONCEPTS } from '@/lib/domain/concepts/registry';
import type { RenderContext } from './context';
import { normalizeOption } from './format';
import { renderVariant, type Rendered, type RenderFailureCode } from './render';
import { validateVariant } from './validate';
import type { Variant } from './variant';

export type PreflightCode = RenderFailureCode | 'invalid' | 'empty_option' | 'duplicate_option';

export type PreflightResult =
  { ok: true; rendered: Rendered } | { ok: false; code: PreflightCode; detail: string };

/**
 * May this variant be asked of this company (spec §8)? It must keep the rules, render in Thai —
 * the language it is approved in — and come out as four non-empty options that differ after
 * normalisation, which also means no distractor equals the correct one.
 */
export function preflightVariant(
  variant: Variant,
  ctx: RenderContext,
  seed: string,
): PreflightResult {
  const issues = validateVariant(variant);
  if (issues.length > 0) return { ok: false, code: 'invalid', detail: issues[0].code };
  const result = renderVariant(variant, ctx, seed, 'th');
  if (!result.ok) return result;
  const seen = new Map<string, string>();
  for (const option of result.rendered.options) {
    const normal = normalizeOption(option.text);
    if (normal === '') return { ok: false, code: 'empty_option', detail: option.key };
    const earlier = seen.get(normal);
    if (earlier)
      return { ok: false, code: 'duplicate_option', detail: `${earlier} = ${option.key}` };
    seen.set(normal, option.key);
  }
  return result;
}

/** What one concept comes to for one company: the variant to ask, or why each one cannot be. */
export type ConceptCheck = {
  conceptKey: string;
  variant: Variant | null;
  rendered: Rendered | null;
  skipped: { key: string; code: PreflightCode; detail: string }[];
};

/**
 * The first approved variant of the concept, in key order, that passes preflight; a failing one
 * yields to the next (spec §8). P17e puts unseen variants first and raises `render_failure`
 * when none is left; here the caller only reads the answer.
 */
export function pickVariant(
  conceptKey: string,
  variants: readonly Variant[],
  ctx: RenderContext,
  seed: string,
): ConceptCheck {
  const candidates = variants
    .filter((v) => v.conceptKey === conceptKey && v.status === 'approved')
    .sort((a, b) => a.key.localeCompare(b.key));
  const skipped: ConceptCheck['skipped'] = [];
  for (const variant of candidates) {
    const result = preflightVariant(variant, ctx, `${seed}:${variant.id}`);
    if (result.ok) return { conceptKey, variant, rendered: result.rendered, skipped };
    skipped.push({ key: variant.key, code: result.code, detail: result.detail });
  }
  return { conceptKey, variant: null, rendered: null, skipped };
}

/** The thirty concepts in MCQ order, each with what the bank can ask this company. */
export function checkBank(
  variants: readonly Variant[],
  ctx: RenderContext,
  seed: string,
): ConceptCheck[] {
  return MCQ_CONCEPTS.map((concept) => pickVariant(concept.key, variants, ctx, seed));
}
```

- [ ] **Step 5: Coverage**

```ts
// lib/domain/mcq/coverage.ts
import { MCQ_CONCEPTS } from '@/lib/domain/concepts/registry';
import type { AppliesWhen, Variant } from './variant';

export type CaseCoverage = { when: AppliesWhen | null; approved: number };

export type ConceptCoverage = {
  conceptKey: string;
  /** One case for every company, or two per status fact the concept turns on (spec §8). */
  cases: CaseCoverage[];
  covered: boolean;
  counts: { approved: number; draft: number; retired: number };
};

const covers = (variant: Variant, when: AppliesWhen | null): boolean =>
  variant.appliesWhen === null ||
  (when !== null &&
    variant.appliesWhen.fact === when.fact &&
    variant.appliesWhen.value === when.value);

/**
 * Which concepts the bank can already ask in every status: a concept is covered when each of
 * its cases has an approved variant. A variant with no status condition covers every case.
 */
export function bankCoverage(variants: readonly Variant[]): {
  concepts: ConceptCoverage[];
  ready: number;
  total: number;
} {
  const concepts = MCQ_CONCEPTS.map((concept): ConceptCoverage => {
    const own = variants.filter((v) => v.conceptKey === concept.key);
    const approved = own.filter((v) => v.status === 'approved');
    const whens: (AppliesWhen | null)[] =
      concept.alternateWhen.length === 0
        ? [null]
        : concept.alternateWhen.flatMap((fact) => [
            { fact, value: true },
            { fact, value: false },
          ]);
    const cases = whens.map((when) => ({
      when,
      approved: approved.filter((v) => covers(v, when)).length,
    }));
    return {
      conceptKey: concept.key,
      cases,
      covered: cases.every((c) => c.approved > 0),
      counts: {
        approved: approved.length,
        draft: own.filter((v) => v.status === 'draft').length,
        retired: own.filter((v) => v.status === 'retired').length,
      },
    };
  });
  return { concepts, ready: concepts.filter((c) => c.covered).length, total: concepts.length };
}
```

- [ ] **Step 6: Run the test to see it pass**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/mcq && pnpm typecheck && pnpm lint`
Expected: PASS — `grammar` 7, `render` 9, `rules` 15; no type or lint errors.

- [ ] **Step 7: Commit**

```bash
git add lib/domain/mcq/validate.ts lib/domain/mcq/preflight.ts lib/domain/mcq/coverage.ts tests/unit/domain/mcq/rules.test.ts
git commit -m "feat(bank): the variant rules, preflight and coverage (P17d, spec §8)"
```

---

## Task 6: The bank in the database — variants, contexts, real geography

**Files:**
- Create: `lib/db/mcq-bank.ts`, `lib/db/mcq-context.ts`
- Modify: `lib/db/geo.ts`, `lib/db/questions.ts`
- Test: `tests/integration/mcq-bank.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/mcq-bank.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getVariant, listVariants, saveVariant, setVariantStatus } from '@/lib/db/mcq-bank';
import {
  contextForRecord,
  listRecordLearners,
  listVersionedCompanies,
} from '@/lib/db/mcq-context';
import { validateRecord } from '@/lib/db/validation';
import { manualCategory } from '@/lib/domain/business-category';
import { preflightVariant } from '@/lib/domain/mcq/preflight';
import type { Variant, VariantDraft, VariantText } from '@/lib/domain/mcq/variant';
import {
  adminClient,
  clientFor,
  completeRecord,
  COMPLETE_STRUCTURED,
  confirmRecord,
  createTestUser,
  deleteTeam,
  deleteTestUser,
  seedTeam,
  type Client,
  type Team,
  type TestUser,
} from './helpers';

const svc = adminClient();

const text = (
  prompt: string,
  options: [string, string, string, string],
  explanation: string | null = null,
): VariantText => ({
  prompt,
  options: { A: options[0], B: options[1], C: options[2], D: options[3] },
  explanation,
});
const capital = (): VariantDraft & { id: string | null } => ({
  id: null,
  conceptKey: 'registered_capital',
  correctKey: 'A',
  optionRecipes: {
    A: 'DIRECT_FACT',
    B: 'NUMERIC_VARIATION',
    C: 'NUMERIC_VARIATION',
    D: 'NUMERIC_VARIATION',
  },
  appliesWhen: null,
  texts: {
    th: text(
      'ทุนจดทะเบียนของ {company_name_th} คือเท่าใด',
      [
        '{registered_capital}',
        '{registered_capital|numeric(x0.5)}',
        '{registered_capital|numeric(x2)}',
        '{registered_capital|numeric(x10)}',
      ],
      'ทุนจดทะเบียนคือ {registered_capital}',
    ),
  },
});

describe('the MCQ bank (P17d)', () => {
  let team: Team;
  let owner: TestUser;
  let asOwner: Client;
  const made: string[] = [];
  const save = async (input: VariantDraft & { id: string | null }) => {
    const id = await saveVariant(asOwner, input, owner.id);
    if (!made.includes(id)) made.push(id);
    return id;
  };

  beforeAll(async () => {
    team = await seedTeam('คลังตามแนวคิด');
    owner = await createTestUser('admin');
    asOwner = await clientFor(owner);
    await confirmRecord(team.recordId, team.manager.id);
    await completeRecord(team.recordId);
    // The Owner's own choice of category, so BUSINESS_ALTERNATIVE has something to differ from.
    await svc
      .from('dbd_records')
      .update({
        structured_data: {
          ...COMPLETE_STRUCTURED,
          category: manualCategory('clothing_fashion', 'fixture', new Date().toISOString()),
        } as never,
      })
      .eq('id', team.recordId);
    const validated = await validateRecord(svc, team.recordId, null);
    expect(validated?.version).toBe('activated');
  });

  afterAll(async () => {
    await svc.from('questions').delete().in('id', made);
    await deleteTeam(team);
    await deleteTestUser(owner.id);
  });

  it('saves a variant under the Owner, names it after its concept and reads it back', async () => {
    const id = await save(capital());
    const variant = await getVariant(asOwner, id);
    expect(variant).toMatchObject({
      conceptKey: 'registered_capital',
      status: 'draft',
      correctKey: 'A',
      appliesWhen: null,
    });
    expect(variant!.key).toMatch(/^mcq-registered-capital-\d+$/);
    expect(variant!.texts.th).toEqual(capital().texts.th);
    expect(variant!.texts.en).toBeUndefined();
    const { data: row } = await svc
      .from('questions')
      .select('kind, pools, created_by, source')
      .eq('id', id)
      .single();
    expect(row).toEqual({ kind: 'concept', pools: [], created_by: owner.id, source: 'manual' });
    expect((await listVariants(asOwner)).some((v) => v.id === id)).toBe(true);
    // The next variant of the same concept takes the next number.
    const second = await getVariant(asOwner, await save(capital()));
    expect(Number(second!.key.split('-').at(-1))).toBe(Number(variant!.key.split('-').at(-1)) + 1);
  });

  it('refuses a variant that breaks a rule, and a manager, and writes nothing', async () => {
    const count = async () =>
      (await listVariants(svc)).filter((v) => v.key.startsWith('mcq-registered-capital-')).length;
    const before = await count();
    await expect(save({ ...capital(), correctKey: 'B' })).rejects.toMatchObject({
      issues: [expect.objectContaining({ code: 'correct_varies', where: 'th.B' })],
    });
    await expect(saveVariant(team.asManager, capital(), team.manager.id)).rejects.toBeTruthy();
    expect(await count()).toBe(before);
  });

  it('approves on the Thai text, returns to draft when it changes, and keeps a translation edit approved', async () => {
    const id = await save(capital());
    await setVariantStatus(asOwner, id, 'approved');
    expect((await getVariant(asOwner, id))!.status).toBe('approved');

    const en = text(
      'What is the registered capital of {company_name_th}?',
      [
        '{registered_capital}',
        '{registered_capital|numeric(x0.5)}',
        '{registered_capital|numeric(x2)}',
        '{registered_capital|numeric(x10)}',
      ],
      'The registered capital is {registered_capital}',
    );
    await save({ ...capital(), id, texts: { ...capital().texts, en } });
    let variant = (await getVariant(asOwner, id))!;
    expect(variant.status).toBe('approved');
    expect(variant.texts.en).toEqual(en);

    const th = { ...capital().texts.th!, prompt: 'บริษัท {company_name_th} มีทุนจดทะเบียนเท่าใด' };
    await save({ ...capital(), id, texts: { th } });
    variant = (await getVariant(asOwner, id))!;
    expect(variant.status).toBe('draft');
    // A translation that is no longer sent is removed.
    expect(variant.texts.en).toBeUndefined();

    await setVariantStatus(asOwner, id, 'retired');
    expect((await getVariant(asOwner, id))!.status).toBe('retired');
  });

  it('builds a render context from a real record: its places, their siblings and the dictionary', async () => {
    const ctx = (await contextForRecord(asOwner, team.recordId, null))!;
    expect(ctx.facts.business_category).toBe('clothing_fashion');
    expect(ctx.geo.province).toMatchObject({ th: 'ร้อยเอ็ด', en: 'Roi Et' });
    expect(ctx.geo.district?.th).toBe('โพนทอง');
    expect(ctx.geo.subdistrict?.th).toBe('หนองใหญ่');
    // The same region, the same province, the same district — never the place itself.
    expect(ctx.geo.provinces.map((p) => p.th)).toContain('ขอนแก่น');
    expect(ctx.geo.provinces.map((p) => p.th)).not.toContain('ร้อยเอ็ด');
    expect(ctx.geo.provinces.map((p) => p.th)).not.toContain('เชียงใหม่');
    expect(ctx.geo.districts.map((d) => d.th)).toContain('เสลภูมิ');
    expect(ctx.geo.districts.map((d) => d.th)).not.toContain('โพนทอง');
    expect(ctx.geo.subdistricts.length).toBeGreaterThan(0);
    expect(ctx.categories.find((c) => c.key === 'clothing_fashion')?.active).toBe(true);
    expect(ctx.categories.length).toBeGreaterThanOrEqual(22);

    // The geography and business recipes come out as four different options on real data.
    const where: Variant = {
      id: 'geo',
      key: 'geo',
      conceptKey: 'registered_location',
      status: 'approved',
      correctKey: 'A',
      optionRecipes: {
        A: 'DIRECT_FACT',
        B: 'GEOGRAPHY_ALTERNATIVE',
        C: 'GEOGRAPHY_ALTERNATIVE',
        D: 'GEOGRAPHY_ALTERNATIVE',
      },
      appliesWhen: null,
      texts: {
        th: text('สำนักงานแห่งใหญ่อยู่จังหวัดใด', [
          '{province}',
          '{province|geo_alt(region)}',
          '{province|geo_alt(region)}',
          '{province|geo_alt(region)}',
        ]),
      },
    };
    const placed = preflightVariant(where, ctx, 'seed');
    expect(placed.ok && placed.rendered.options[0].text).toBe('ร้อยเอ็ด');
    const what: Variant = {
      ...where,
      conceptKey: 'actual_business',
      optionRecipes: {
        A: 'DIRECT_FACT',
        B: 'BUSINESS_ALTERNATIVE',
        C: 'BUSINESS_ALTERNATIVE',
        D: 'BUSINESS_ALTERNATIVE',
      },
      texts: {
        th: text('ธุรกิจหลักคืออะไร', [
          '{nature_of_business}',
          '{business_category|business_alt}',
          '{business_category|business_alt}',
          '{business_category|business_alt}',
        ]),
      },
    };
    expect(preflightVariant(what, ctx, 'seed').ok).toBe(true);
  });

  it('lists the companies that have a version, their learners, and a learner’s own facts', async () => {
    expect((await contextForRecord(asOwner, team.recordId, null))!.facts.holder_name).toBeNull();
    const companies = await listVersionedCompanies(asOwner);
    expect(companies.find((c) => c.recordId === team.recordId)?.name).toBe('บริษัท ครบถ้วน จำกัด');
    const { data: assignment } = await svc
      .from('user_dbd_assignments')
      .insert({
        user_id: team.learner.id,
        dbd_record_id: team.recordId,
        holder_name: 'นางสาวกุลธิดา พลเยี่ยม',
      })
      .select('id')
      .single();
    const learners = await listRecordLearners(asOwner, team.recordId);
    expect(learners).toEqual([
      { assignmentId: assignment!.id, name: expect.stringContaining('learner') },
    ]);
    const mine = (await contextForRecord(asOwner, team.recordId, assignment!.id))!;
    expect(mine.facts).toMatchObject({
      holder_name: 'นางสาวกุลธิดา พลเยี่ยม',
      learner_is_shareholder: true,
      my_shares: 18000,
    });
    // A record without a version has no context.
    const bare = await seedTeam('ยังไม่มีรุ่น');
    try {
      expect(await contextForRecord(asOwner, bare.recordId, null)).toBeNull();
    } finally {
      await deleteTeam(bare);
    }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/mcq-bank.test.ts`
Expected: FAIL — `Cannot find module '@/lib/db/mcq-bank'`.

- [ ] **Step 3: The geography reader**

Add to `lib/db/geo.ts` (after `geoLookup`), with `import type { GeoName, RenderContext } from '@/lib/domain/mcq/context';` at the top:

```ts
type Named = { id: number; name_th: string; name_en: string };

const named = (row: Named): GeoName => ({ id: row.id, th: row.name_th, en: row.name_en });

function split(rows: Named[], ownId: number | null): { own: GeoName | null; others: GeoName[] } {
  const own = rows.find((r) => r.id === ownId);
  return { own: own ? named(own) : null, others: rows.filter((r) => r.id !== ownId).map(named) };
}

/**
 * A resolved address's own places and their siblings — the other provinces of its region, the
 * other districts of its province, the other subdistricts of its district — which is all a
 * geography alternate may be drawn from (spec §5.2).
 */
export async function geoNeighbours(
  db: Db,
  ids: { provinceId: number | null; districtId: number | null; subdistrictId: number | null },
): Promise<RenderContext['geo']> {
  const empty: RenderContext['geo'] = {
    province: null,
    district: null,
    subdistrict: null,
    provinces: [],
    districts: [],
    subdistricts: [],
  };
  if (ids.provinceId === null) return empty;
  const { data: province, error } = await db
    .from('geo_provinces')
    .select('region_id')
    .eq('id', ids.provinceId)
    .maybeSingle();
  if (error) throw error;
  if (!province) return empty;
  const [provinces, districts, subdistricts] = await Promise.all([
    db
      .from('geo_provinces')
      .select('id, name_th, name_en')
      .eq('region_id', province.region_id)
      .order('id'),
    db
      .from('geo_districts')
      .select('id, name_th, name_en')
      .eq('province_id', ids.provinceId)
      .order('id'),
    db
      .from('geo_subdistricts')
      .select('id, name_th, name_en')
      .eq('district_id', ids.districtId ?? -1)
      .order('id'),
  ]);
  for (const result of [provinces, districts, subdistricts]) {
    if (result.error) throw result.error;
  }
  const p = split(provinces.data ?? [], ids.provinceId);
  const d = split(districts.data ?? [], ids.districtId);
  const s = split(subdistricts.data ?? [], ids.subdistrictId);
  return {
    province: p.own,
    district: d.own,
    subdistrict: s.own,
    provinces: p.others,
    districts: d.own ? d.others : [],
    subdistricts: s.own ? s.others : [],
  };
}
```

- [ ] **Step 4: The render context for a real company**

```ts
// lib/db/mcq-context.ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FactSheet } from '@/lib/domain/facts/fact-sheet';
import {
  assignmentFacts,
  buildRoleSnapshot,
  type RoleSnapshot,
} from '@/lib/domain/facts/snapshot';
import type { RenderContext } from '@/lib/domain/mcq/context';
import { listBusinessCategories } from './business-categories';
import type { Database } from './database.types';
import { geoNeighbours } from './geo';
import { roleOf } from './pinning';
import { getActiveVersion, readSnapshot } from './training-versions';

type Db = SupabaseClient<Database>;

/** The facts plus the places and categories the recipes draw from (spec §5.2, §5.3). */
export async function loadRenderContext(db: Db, facts: FactSheet): Promise<RenderContext> {
  const [geo, categories] = await Promise.all([
    geoNeighbours(db, {
      provinceId: facts.address?.province_id ?? null,
      districtId: facts.address?.district_id ?? null,
      subdistrictId: facts.address?.subdistrict_id ?? null,
    }),
    listBusinessCategories(db),
  ]);
  return {
    facts,
    geo,
    categories: categories.map((c) => ({
      key: c.key,
      th: c.label_th,
      en: c.label_en,
      zh: c.label_zh,
      active: c.active,
    })),
  };
}

export type VersionedCompany = { recordId: string; name: string };

/** Companies that hold an active training version: the only ones a variant can be checked on. */
export async function listVersionedCompanies(db: Db): Promise<VersionedCompany[]> {
  const { data, error } = await db
    .from('company_training_versions')
    .select('dbd_record_id, dbd_records(company_name_th, company_name_en)')
    .eq('status', 'active');
  if (error) throw error;
  return data
    .map((row) => ({
      recordId: row.dbd_record_id,
      name: row.dbd_records?.company_name_th ?? row.dbd_records?.company_name_en ?? row.dbd_record_id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'th'));
}

export type RecordLearner = { assignmentId: string; name: string };

/** The learners assigned to a record, for the per-learner concept (`learner_shareholding`). */
export async function listRecordLearners(db: Db, recordId: string): Promise<RecordLearner[]> {
  const { data: assignments, error } = await db
    .from('user_dbd_assignments')
    .select('id, user_id')
    .eq('dbd_record_id', recordId)
    .eq('active', true);
  if (error) throw error;
  if (assignments.length === 0) return [];
  const { data: profiles, error: profileError } = await db
    .from('profiles')
    .select('id, display_name, login_id')
    .in(
      'id',
      assignments.map((a) => a.user_id),
    );
  if (profileError) throw profileError;
  const names = new Map(profiles.map((p) => [p.id, p.display_name ?? p.login_id]));
  return assignments
    .map((a) => ({ assignmentId: a.id, name: names.get(a.user_id) ?? a.user_id }))
    .sort((a, b) => a.name.localeCompare(b.name, 'th'));
}

/**
 * The context of a record's active version; with an assignment, the learner's own role facts on
 * top (their confirmed role, or the role as typed). Null when the record has no version. This
 * reads the record as it stands now — a learner pinned to an older version is P17e's business.
 */
export async function contextForRecord(
  db: Db,
  recordId: string,
  assignmentId: string | null,
): Promise<RenderContext | null> {
  const version = await getActiveVersion(db, recordId);
  if (!version) return null;
  const snapshot = readSnapshot(version);
  let facts = snapshot.facts;
  if (assignmentId) {
    const { data: assignment, error } = await db
      .from('user_dbd_assignments')
      .select('*')
      .eq('id', assignmentId)
      .eq('dbd_record_id', recordId)
      .maybeSingle();
    if (error) throw error;
    if (assignment) {
      const role =
        (assignment.role_snapshot as RoleSnapshot | null) ??
        buildRoleSnapshot(roleOf(assignment), snapshot);
      facts = assignmentFacts(snapshot, role);
    }
  }
  return loadRenderContext(db, facts);
}
```

- [ ] **Step 5: The variant reader and writer**

```ts
// lib/db/mcq-bank.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Recipe } from '@/lib/domain/mcq/tokens';
import { validateVariant, type VariantIssue } from '@/lib/domain/mcq/validate';
import {
  OPTION_KEYS,
  VARIANT_LOCALES,
  type AppliesWhen,
  type StarterVariant,
  type Variant,
  type VariantDraft,
  type VariantOptionKey,
  type VariantStatus,
  type VariantText,
} from '@/lib/domain/mcq/variant';
import type { Locale } from '@/lib/domain/thai-date';
import type { Database, Json } from './database.types';
import type { QuestionWithLocalizations } from './questions';

type Db = SupabaseClient<Database>;

const SELECT = '*, question_localizations(*)';

/** A save or an approval the rules refuse; `issues` says what and where. */
export class VariantError extends Error {
  constructor(public readonly issues: VariantIssue[]) {
    super(issues.map((i) => `${i.code}@${i.where}`).join(', '));
    this.name = 'VariantError';
  }
}

export type VariantInput = VariantDraft & { id: string | null };

/** A stored row as the domain's `Variant`. Written only by `saveVariant`, so the shape is trusted. */
export function toVariant(row: QuestionWithLocalizations): Variant {
  const texts: Variant['texts'] = {};
  for (const loc of row.question_localizations) {
    const stored = loc.options as unknown as { key: string; text: string }[];
    const options = Object.fromEntries(
      OPTION_KEYS.map((key) => [key, stored.find((o) => o.key === key)?.text ?? '']),
    ) as Record<VariantOptionKey, string>;
    texts[loc.language as Locale] = {
      prompt: loc.prompt,
      options,
      explanation: loc.explanation,
    };
  }
  return {
    id: row.id,
    key: row.question_key,
    conceptKey: row.concept_key ?? '',
    status: row.approval_status as VariantStatus,
    correctKey: row.correct_option_key as VariantOptionKey,
    optionRecipes: row.option_recipes as unknown as Record<VariantOptionKey, Recipe>,
    appliesWhen: (row.applies_when as unknown as AppliesWhen | null) ?? null,
    texts,
  };
}

export async function listVariants(db: Db): Promise<Variant[]> {
  const { data, error } = await db
    .from('questions')
    .select(SELECT)
    .not('concept_key', 'is', null)
    .order('question_key');
  if (error) throw error;
  return (data as QuestionWithLocalizations[]).map(toVariant);
}

export async function getVariant(db: Db, id: string): Promise<Variant | null> {
  const { data, error } = await db
    .from('questions')
    .select(SELECT)
    .eq('id', id)
    .not('concept_key', 'is', null)
    .maybeSingle();
  if (error) throw error;
  return data ? toVariant(data as QuestionWithLocalizations) : null;
}

const structure = (v: VariantDraft) => ({
  correct_option_key: v.correctKey,
  option_recipes: v.optionRecipes as unknown as Json,
  applies_when: (v.appliesWhen as unknown as Json) ?? null,
});

/** `mcq-<concept>-<n>`: the next free number for the concept. */
async function insertVariant(
  db: Db,
  input: VariantDraft,
  actorId: string,
  fixedKey: string | null,
): Promise<string> {
  const prefix = `mcq-${input.conceptKey.replaceAll('_', '-')}-`;
  let next = 1;
  if (!fixedKey) {
    const { data, error } = await db
      .from('questions')
      .select('question_key')
      .like('question_key', `${prefix}%`);
    if (error) throw error;
    const numbers = data
      .map((r) => Number(r.question_key.slice(prefix.length)))
      .filter((n) => Number.isInteger(n));
    next = Math.max(0, ...numbers) + 1;
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await db
      .from('questions')
      .insert({
        question_key: fixedKey ?? `${prefix}${next + attempt}`,
        kind: 'concept',
        concept_key: input.conceptKey,
        pools: [],
        created_by: actorId,
        ...structure(input),
      })
      .select('id')
      .single();
    if (!error) return data.id;
    // Someone took the number in between: try the next one. A fixed key is not retried.
    if (error.code !== '23505' || fixedKey) throw error;
  }
  throw new Error(`could not allocate a key for ${input.conceptKey}`);
}

async function writeTexts(db: Db, id: string, input: VariantDraft): Promise<void> {
  for (const locale of VARIANT_LOCALES) {
    const text: VariantText | undefined = input.texts[locale];
    if (!text) {
      // A translation that is no longer sent is removed; the Thai text is never absent here.
      const { error } = await db
        .from('question_localizations')
        .delete()
        .eq('question_id', id)
        .eq('language', locale);
      if (error) throw error;
      continue;
    }
    const { error } = await db.from('question_localizations').upsert(
      {
        question_id: id,
        language: locale,
        prompt: text.prompt.trim(),
        options: OPTION_KEYS.map((key) => ({
          key,
          text: text.options[key].trim(),
        })) as unknown as Json,
        correct_key: input.correctKey,
        explanation: text.explanation?.trim() || null,
        tts_enabled: false,
      },
      { onConflict: 'question_id,language' },
    );
    if (error) throw error;
  }
}

/**
 * Creates or updates a variant under the caller's own session, so RLS admits only the Owner and
 * the audit names them. Nothing invalid is stored: a draft always keeps every rule. The
 * database returns an approved variant to draft when its Thai text or structure changed.
 */
export async function saveVariant(db: Db, input: VariantInput, actorId: string): Promise<string> {
  const issues = validateVariant(input);
  if (issues.length > 0) throw new VariantError(issues);
  let id = input.id;
  if (id) {
    const { data, error } = await db
      .from('questions')
      .update(structure(input))
      .eq('id', id)
      .not('concept_key', 'is', null)
      .select('id');
    if (error) throw error;
    if (data.length === 0) throw new Error('variant not found');
  } else {
    id = await insertVariant(db, input, actorId, null);
  }
  await writeTexts(db, id, input);
  return id;
}

/** Approve (after the rules are checked again), return to draft, or retire. */
export async function setVariantStatus(db: Db, id: string, status: VariantStatus): Promise<void> {
  if (status === 'approved') {
    const variant = await getVariant(db, id);
    if (!variant) throw new Error('variant not found');
    const issues = validateVariant(variant);
    if (issues.length > 0) throw new VariantError(issues);
  }
  const { data, error } = await db
    .from('questions')
    .update({ approval_status: status })
    .eq('id', id)
    .not('concept_key', 'is', null)
    .select('id');
  if (error) throw error;
  if (data.length === 0) throw new Error('variant not found');
}

/**
 * Adds the starter drafts that are not in the bank yet, each under its own key. A key that
 * exists is left alone, so loading again never overwrites what the Owner has edited.
 */
export async function loadStarterVariants(
  db: Db,
  starters: readonly StarterVariant[],
  actorId: string,
): Promise<{ created: string[]; skipped: string[] }> {
  const { data, error } = await db
    .from('questions')
    .select('question_key')
    .in(
      'question_key',
      starters.map((s) => s.key),
    );
  if (error) throw error;
  const existing = new Set(data.map((r) => r.question_key));
  const created: string[] = [];
  const skipped: string[] = [];
  for (const starter of starters) {
    if (existing.has(starter.key)) {
      skipped.push(starter.key);
      continue;
    }
    const issues = validateVariant(starter);
    if (issues.length > 0) throw new VariantError(issues);
    const id = await insertVariant(db, starter, actorId, starter.key);
    await writeTexts(db, id, starter);
    created.push(starter.key);
  }
  return { created, skipped };
}
```

- [ ] **Step 6: The earlier questions on their own**

In `lib/db/questions.ts` change `listQuestions`:

```ts
/** `legacyOnly` leaves out the concept variants (P17d): they have their own screens. */
export async function listQuestions(
  db: Db,
  options: { legacyOnly?: boolean } = {},
): Promise<QuestionWithLocalizations[]> {
  let query = db.from('questions').select('*, question_localizations(*)');
  if (options.legacyOnly) query = query.is('concept_key', null);
  const { data, error } = await query.order('question_key');
  if (error) throw error;
  return data as QuestionWithLocalizations[];
}
```

- [ ] **Step 7: Run the test to see it pass**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/mcq-bank.test.ts tests/integration/geo.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS — `mcq-bank` 5 tests, `geo` unchanged; no type or lint errors.

- [ ] **Step 8: Commit**

```bash
git add lib/db/mcq-bank.ts lib/db/mcq-context.ts lib/db/geo.ts lib/db/questions.ts tests/integration/mcq-bank.test.ts
git commit -m "feat(bank): variants written under the Owner's session; render contexts from real records (P17d)"
```

---

## Task 7: The starter drafts

**Files:**
- Create: `lib/content/mcq-starter.ts`
- Test: `tests/unit/domain/mcq/starter.test.ts`, `tests/integration/mcq-bank.test.ts` (one more `describe`)

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/domain/mcq/starter.test.ts
import { describe, expect, it } from 'vitest';
import { MCQ_STARTER } from '@/lib/content/mcq-starter';
import type { RenderContext } from '@/lib/domain/mcq/context';
import { preflightVariant } from '@/lib/domain/mcq/preflight';
import { renderVariant } from '@/lib/domain/mcq/render';
import { SAMPLE_CONTEXT } from '@/lib/domain/mcq/sample';
import { RECIPES } from '@/lib/domain/mcq/tokens';
import { validateVariant } from '@/lib/domain/mcq/validate';
import { OPTION_KEYS, type AppliesWhen } from '@/lib/domain/mcq/variant';

/** The sample company put into the status a variant is worded for. */
function contextFor(when: AppliesWhen | null): RenderContext {
  if (!when) return SAMPLE_CONTEXT;
  const facts = { ...SAMPLE_CONTEXT.facts, [when.fact]: when.value };
  if (when.fact === 'learner_is_shareholder' && !when.value) {
    facts.my_shares = null;
    facts.my_share_percent = null;
  }
  return { ...SAMPLE_CONTEXT, facts };
}

describe('the starter drafts', () => {
  it('holds eleven drafts under unique keys, with every recipe of D77 among them', () => {
    expect(MCQ_STARTER).toHaveLength(11);
    expect(new Set(MCQ_STARTER.map((s) => s.key)).size).toBe(11);
    const used = new Set(MCQ_STARTER.flatMap((s) => OPTION_KEYS.map((k) => s.optionRecipes[k])));
    expect([...used].sort()).toEqual([...RECIPES].sort());
  });

  it('keeps every rule, in all three languages', () => {
    for (const starter of MCQ_STARTER) {
      expect(Object.keys(starter.texts).sort(), starter.key).toEqual(['en', 'th', 'zh']);
      expect(validateVariant(starter), starter.key).toEqual([]);
    }
  });

  it('passes preflight for the sample company and reads the same in every language', () => {
    for (const starter of MCQ_STARTER) {
      const variant = { ...starter, id: starter.key, status: 'approved' as const };
      const ctx = contextFor(starter.appliesWhen);
      const result = preflightVariant(variant, ctx, 'seed');
      expect(result.ok, `${starter.key}: ${result.ok ? '' : result.code}`).toBe(true);
      for (const locale of ['en', 'zh'] as const) {
        const view = renderVariant(variant, ctx, 'seed', locale);
        expect(view.ok, `${starter.key} ${locale}`).toBe(true);
        expect(view.ok && new Set(view.rendered.options.map((o) => o.text)).size).toBe(4);
      }
    }
  });
});
```

Append to `tests/integration/mcq-bank.test.ts` (and add `loadStarterVariants` to the `@/lib/db/mcq-bank` import and `import { MCQ_STARTER } from '@/lib/content/mcq-starter';`):

```ts
describe('the starter drafts in the bank', () => {
  let owner: TestUser;
  let asOwner: Client;
  const keys = MCQ_STARTER.map((s) => s.key);
  const clear = () => svc.from('questions').delete().in('question_key', keys);

  beforeAll(async () => {
    owner = await createTestUser('admin');
    asOwner = await clientFor(owner);
    await clear();
  });

  afterAll(async () => {
    await clear();
    await deleteTestUser(owner.id);
  });

  it('loads every draft once, as drafts, and leaves them alone the second time', async () => {
    const first = await loadStarterVariants(asOwner, MCQ_STARTER, owner.id);
    expect(first.created).toEqual(keys);
    expect(first.skipped).toEqual([]);
    const loaded = (await listVariants(asOwner)).filter((v) => keys.includes(v.key));
    expect(loaded).toHaveLength(11);
    expect(loaded.every((v) => v.status === 'draft')).toBe(true);
    expect(loaded.every((v) => Object.keys(v.texts).length === 3)).toBe(true);

    // The Owner edits one; loading again does not put the starter text back.
    const capital = loaded.find((v) => v.key === 'mcq-registered-capital-1')!;
    const prompt = 'ทุนจดทะเบียนตามหนังสือรับรองของ {company_name_th} คือเท่าใด';
    await saveVariant(asOwner, { ...capital, texts: { th: { ...capital.texts.th!, prompt } } }, owner.id);
    const second = await loadStarterVariants(asOwner, MCQ_STARTER, owner.id);
    expect(second).toEqual({ created: [], skipped: keys });
    expect((await getVariant(asOwner, capital.id))!.texts.th!.prompt).toBe(prompt);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/mcq/starter.test.ts`
Expected: FAIL — `Cannot find module '@/lib/content/mcq-starter'`.

- [ ] **Step 3: The content**

```ts
// lib/content/mcq-starter.ts
import type { Recipe } from '@/lib/domain/mcq/tokens';
import type { StarterVariant, VariantText } from '@/lib/domain/mcq/variant';

/**
 * Eleven worked examples for the Owner's bank (P17d plan decision 12): one for every recipe of
 * D77, loaded as drafts and never approved by code. They show the grammar at work; the wording
 * is the Owner's to change, approve or retire, and the other concepts are the Owner's to write.
 */
const text = (
  prompt: string,
  options: [string, string, string, string],
  explanation: string,
): VariantText => ({
  prompt,
  options: { A: options[0], B: options[1], C: options[2], D: options[3] },
  explanation,
});
const recipes = (a: Recipe, b: Recipe, c: Recipe, d: Recipe) => ({ A: a, B: b, C: c, D: d });

const CAPITAL: [string, string, string, string] = [
  '{registered_capital}',
  '{registered_capital|numeric(x0.5)}',
  '{registered_capital|numeric(x2)}',
  '{registered_capital|numeric(x10)}',
];
const DIRECTORS: [string, string, string, string] = [
  '{director_count}',
  '{director_count|count(+1)}',
  '{director_count|count(+2)}',
  '{director_count|count(+3)}',
];
const DATES: [string, string, string, string] = [
  '{registered_on}',
  '{registered_on|date(-1y)}',
  '{registered_on|date(+1m)}',
  '{registered_on|date(-10d)}',
];
const IDS: [string, string, string, string] = [
  '{juristic_id}',
  '{juristic_id|id_mutation}',
  '{juristic_id|id_mutation}',
  '{juristic_id|id_mutation}',
];
const PROVINCES: [string, string, string, string] = [
  '{province}',
  '{province|geo_alt(region)}',
  '{province|geo_alt(region)}',
  '{province|geo_alt(region)}',
];
const BUSINESS: [string, string, string, string] = [
  '{nature_of_business}',
  '{business_category|business_alt}',
  '{business_category|business_alt}',
  '{business_category|business_alt}',
];

export const MCQ_STARTER: readonly StarterVariant[] = [
  {
    key: 'mcq-registered-capital-1',
    conceptKey: 'registered_capital',
    correctKey: 'A',
    optionRecipes: recipes(
      'DIRECT_FACT',
      'NUMERIC_VARIATION',
      'NUMERIC_VARIATION',
      'NUMERIC_VARIATION',
    ),
    appliesWhen: null,
    texts: {
      th: text(
        'ทุนจดทะเบียนของ {company_name_th} คือเท่าใด',
        CAPITAL,
        'ทุนจดทะเบียนตามหนังสือรับรองคือ {registered_capital}',
      ),
      en: text(
        'What is the registered capital of {company_name_th}?',
        CAPITAL,
        'The registered capital on the certificate is {registered_capital}.',
      ),
      zh: text(
        '{company_name_th} 的注册资本是多少？',
        CAPITAL,
        '公司登记证明上的注册资本为 {registered_capital}。',
      ),
    },
  },
  {
    key: 'mcq-director-count-1',
    conceptKey: 'director_count',
    correctKey: 'A',
    optionRecipes: recipes('DIRECT_FACT', 'COUNT_VARIATION', 'COUNT_VARIATION', 'COUNT_VARIATION'),
    appliesWhen: null,
    texts: {
      th: text(
        'ตามหนังสือรับรอง บริษัทมีกรรมการกี่คน',
        DIRECTORS,
        'หนังสือรับรองระบุกรรมการ {director_count} คน ได้แก่ {directors}',
      ),
      en: text(
        'According to the certificate, how many directors does the company have?',
        DIRECTORS,
        'The certificate lists {director_count} director(s): {directors}.',
      ),
      zh: text(
        '根据公司登记证明，公司有几名董事？',
        DIRECTORS,
        '登记证明列明 {director_count} 名董事：{directors}。',
      ),
    },
  },
  {
    key: 'mcq-registration-date-1',
    conceptKey: 'registration_date',
    correctKey: 'A',
    optionRecipes: recipes('DIRECT_FACT', 'DATE_VARIATION', 'DATE_VARIATION', 'DATE_VARIATION'),
    appliesWhen: null,
    texts: {
      th: text(
        'บริษัทจดทะเบียนจัดตั้งเมื่อวันที่เท่าใด',
        DATES,
        'วันจดทะเบียนตามหนังสือรับรองคือ {registered_on}',
      ),
      en: text(
        'On what date was the company registered?',
        DATES,
        'The registration date on the certificate is {registered_on}.',
      ),
      zh: text('公司是哪一天注册成立的？', DATES, '登记证明上的注册日期为 {registered_on}。'),
    },
  },
  {
    key: 'mcq-registration-number-1',
    conceptKey: 'registration_number',
    correctKey: 'A',
    optionRecipes: recipes('DIRECT_FACT', 'ID_MUTATION', 'ID_MUTATION', 'ID_MUTATION'),
    appliesWhen: null,
    texts: {
      th: text(
        'เลขทะเบียนนิติบุคคลของบริษัทคือข้อใด',
        IDS,
        'เลขทะเบียนนิติบุคคลมี 13 หลัก: {juristic_id}',
      ),
      en: text(
        "Which is the company's juristic registration number?",
        IDS,
        'The registration number has 13 digits: {juristic_id}.',
      ),
      zh: text('以下哪一个是公司的法人注册号？', IDS, '法人注册号共 13 位：{juristic_id}。'),
    },
  },
  {
    key: 'mcq-registered-location-1',
    conceptKey: 'registered_location',
    correctKey: 'A',
    optionRecipes: recipes(
      'DIRECT_FACT',
      'GEOGRAPHY_ALTERNATIVE',
      'GEOGRAPHY_ALTERNATIVE',
      'GEOGRAPHY_ALTERNATIVE',
    ),
    appliesWhen: null,
    texts: {
      th: text(
        'สำนักงานแห่งใหญ่ของบริษัทตั้งอยู่ในจังหวัดใด',
        PROVINCES,
        'ที่ตั้งสำนักงานแห่งใหญ่ตามหนังสือรับรอง: {address}',
      ),
      en: text(
        "In which province is the company's head office?",
        PROVINCES,
        'The head office address on the certificate: {address}',
      ),
      zh: text('公司总部位于哪个府？', PROVINCES, '登记证明上的总部地址：{address}'),
    },
  },
  {
    key: 'mcq-actual-business-1',
    conceptKey: 'actual_business',
    correctKey: 'A',
    optionRecipes: recipes(
      'DIRECT_FACT',
      'BUSINESS_ALTERNATIVE',
      'BUSINESS_ALTERNATIVE',
      'BUSINESS_ALTERNATIVE',
    ),
    appliesWhen: null,
    texts: {
      th: text(
        'ธุรกิจหลักที่บริษัทประกอบจริงคืออะไร',
        BUSINESS,
        'ธุรกิจหลักของบริษัท: {nature_of_business}',
      ),
      en: text(
        "What is the company's actual main business?",
        BUSINESS,
        "The company's main business: {nature_of_business}",
      ),
      zh: text('公司实际经营的主要业务是什么？', BUSINESS, '公司的主要业务：{nature_of_business}'),
    },
  },
  {
    key: 'mcq-internet-banking-control-1',
    conceptKey: 'internet_banking_control',
    correctKey: 'A',
    optionRecipes: recipes('STATIC', 'STATIC', 'STATIC', 'STATIC'),
    appliesWhen: null,
    texts: {
      th: text(
        'ใครควรเป็นผู้ถือและควบคุมการใช้งานอินเทอร์เน็ตแบงก์กิ้งของบัญชีบริษัท',
        [
          'กรรมการผู้มีอำนาจของบริษัทเท่านั้น',
          'สำนักงานบัญชีที่บริษัทจ้าง',
          'ตัวแทนที่ช่วยดำเนินการเปิดบัญชี',
          'พนักงานคนใดก็ได้ที่ทราบรหัสผ่าน',
        ],
        'ธนาคารคาดหวังให้กรรมการผู้มีอำนาจควบคุมบัญชีด้วยตนเอง ไม่มอบให้ผู้อื่น',
      ),
      en: text(
        'Who should hold and control internet banking for the company account?',
        [
          "Only the company's authorised director",
          'The accounting firm the company hires',
          'The agent who helped open the account',
          'Any employee who knows the password',
        ],
        'The bank expects the authorised director to control the account personally, never to hand it to someone else.',
      ),
      zh: text(
        '公司账户的网上银行应由谁持有并控制？',
        ['仅限公司的授权董事', '公司聘请的会计事务所', '协助开户的代理人', '任何知道密码的员工'],
        '银行要求授权董事亲自掌控账户，不得交给他人。',
      ),
    },
  },
  {
    key: 'mcq-learner-shareholding-1',
    conceptKey: 'learner_shareholding',
    correctKey: 'A',
    optionRecipes: recipes(
      'COMPOSITE_TEMPLATE',
      'COMPOSITE_TEMPLATE',
      'COMPOSITE_TEMPLATE',
      'STATIC',
    ),
    appliesWhen: { fact: 'learner_is_shareholder', value: true },
    texts: {
      th: text(
        'คุณถือหุ้นในบริษัทจำนวนเท่าใด',
        [
          '{my_shares} หุ้น ({my_share_percent})',
          '{my_shares|numeric(x0.5)} หุ้น ({my_share_percent|numeric(x0.5)})',
          '{my_shares|numeric(x2)} หุ้น',
          'ไม่ได้ถือหุ้น',
        ],
        'ตามบัญชีรายชื่อผู้ถือหุ้น คุณถือ {my_shares} หุ้น คิดเป็น {my_share_percent}',
      ),
      en: text(
        'How many shares do you hold in the company?',
        [
          '{my_shares} shares ({my_share_percent})',
          '{my_shares|numeric(x0.5)} shares ({my_share_percent|numeric(x0.5)})',
          '{my_shares|numeric(x2)} shares',
          'I hold no shares',
        ],
        'According to the list of shareholders you hold {my_shares} shares, which is {my_share_percent}.',
      ),
      zh: text(
        '您在公司持有多少股份？',
        [
          '{my_shares} 股（{my_share_percent}）',
          '{my_shares|numeric(x0.5)} 股（{my_share_percent|numeric(x0.5)}）',
          '{my_shares|numeric(x2)} 股',
          '未持有股份',
        ],
        '根据股东名册，您持有 {my_shares} 股，占 {my_share_percent}。',
      ),
    },
  },
  {
    key: 'mcq-learner-shareholding-2',
    conceptKey: 'learner_shareholding',
    correctKey: 'A',
    optionRecipes: recipes('STATIC', 'COMPOSITE_TEMPLATE', 'STATIC', 'STATIC'),
    appliesWhen: { fact: 'learner_is_shareholder', value: false },
    texts: {
      th: text(
        'คุณถือหุ้นในบริษัทหรือไม่',
        [
          'ไม่ได้ถือหุ้น',
          'ถือหุ้นทั้งหมด {total_shares} หุ้น',
          'ถือหุ้นร้อยละ 50',
          'ถือหุ้นร้อยละ 25',
        ],
        'ชื่อของคุณไม่อยู่ในบัญชีรายชื่อผู้ถือหุ้นของบริษัท',
      ),
      en: text(
        'Do you hold shares in the company?',
        ['I hold no shares', 'I hold all {total_shares} shares', 'I hold 50%', 'I hold 25%'],
        "Your name is not on the company's list of shareholders.",
      ),
      zh: text(
        '您是否持有公司股份？',
        ['未持有股份', '持有全部 {total_shares} 股', '持有 50%', '持有 25%'],
        '您的姓名不在公司的股东名册上。',
      ),
    },
  },
  {
    key: 'mcq-main-clients-1',
    conceptKey: 'main_clients',
    correctKey: 'A',
    optionRecipes: recipes('DIRECT_FACT', 'STATIC', 'STATIC', 'STATIC'),
    appliesWhen: { fact: 'has_existing_customers', value: true },
    texts: {
      th: text(
        'ลูกค้าหลักของบริษัทคือใคร',
        [
          '{main_clients}',
          'หน่วยงานราชการเท่านั้น',
          'ลูกค้าต่างประเทศทั้งหมด',
          'ยังไม่มีลูกค้าและยังไม่ทราบว่าจะขายให้ใคร',
        ],
        'ลูกค้าหลักตามข้อมูลบริษัท: {main_clients}',
      ),
      en: text(
        "Who are the company's main clients?",
        [
          '{main_clients}',
          'Government agencies only',
          'Overseas customers only',
          'No customers yet and no idea who to sell to',
        ],
        "The company's main clients: {main_clients}",
      ),
      zh: text(
        '公司的主要客户是谁？',
        ['{main_clients}', '仅政府机构', '全部为海外客户', '尚无客户，也不清楚卖给谁'],
        '公司的主要客户：{main_clients}',
      ),
    },
  },
  {
    key: 'mcq-main-clients-2',
    conceptKey: 'main_clients',
    correctKey: 'A',
    optionRecipes: recipes('DIRECT_FACT', 'STATIC', 'STATIC', 'STATIC'),
    appliesWhen: { fact: 'has_existing_customers', value: false },
    texts: {
      th: text(
        'บริษัทคาดว่าลูกค้าหลักจะเป็นใคร',
        [
          '{main_clients}',
          'หน่วยงานราชการเท่านั้น',
          'ลูกค้าต่างประเทศทั้งหมด',
          'ไม่ได้วางแผนเรื่องลูกค้าไว้',
        ],
        'กลุ่มลูกค้าที่บริษัทคาดหวัง: {main_clients}',
      ),
      en: text(
        'Who does the company expect its main clients to be?',
        [
          '{main_clients}',
          'Government agencies only',
          'Overseas customers only',
          'No plan for customers at all',
        ],
        'The clients the company expects: {main_clients}',
      ),
      zh: text(
        '公司预计主要客户会是谁？',
        ['{main_clients}', '仅政府机构', '全部为海外客户', '完全没有客户计划'],
        '公司预期的客户群：{main_clients}',
      ),
    },
  },
];
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/mcq/starter.test.ts && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/mcq-bank.test.ts && pnpm typecheck && pnpm lint && pnpm format:check`
Expected: PASS — `starter` 3 tests, `mcq-bank` 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/content/mcq-starter.ts tests/unit/domain/mcq/starter.test.ts tests/integration/mcq-bank.test.ts
git commit -m "feat(bank): eleven starter drafts, one for every recipe (P17d)"
```

---

## Task 8: The bank by concept, the earlier questions, the concept page

**Files:**
- Create: `app/[locale]/(admin)/admin/questions/page.tsx` (new content), `legacy/page.tsx` (the old list, moved), `concepts/[key]/page.tsx`, `bank-actions.ts`, `bank-forms.tsx`
- Modify: `messages/{th,en,zh}.json`, `app/[locale]/(admin)/admin/questions/[id]/page.tsx`
- Test: covered end to end in Task 11; this task ends on `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` (the message files must stay in step)

- [ ] **Step 1: Messages**

Save this as a script in the scratchpad and run it from the worktree root (`node <path>/p17d-messages.cjs`). It adds `admin.bank` to the three files; `tests/unit/messages.test.ts` holds them to the same keys.

```js
// p17d-messages.cjs
const fs = require('fs');

const en = {
  title: 'Question bank',
  intro:
    'One question per concept, thirty concepts. A concept is ready when it has an approved variant for every case.',
  ready: '{ready} of {total} concepts are ready',
  checkCompany: 'Check a company',
  legacy: 'Earlier questions',
  loadStarter: '{count, plural, one {Add # starter draft} other {Add # starter drafts}}',
  starterHint:
    'Worked examples, one for every recipe. They arrive as drafts for you to edit, approve or retire.',
  starterLoaded: '{count, plural, =0 {Nothing to add} one {# draft added} other {# drafts added}}',
  starterFailed: 'Could not add the drafts. Try again.',
  columns: { order: '#', concept: 'Concept', source: 'Reads', cases: 'Cases', variants: 'Variants' },
  critical: 'critical',
  caseAlways: 'every company',
  caseYes: '{fact}: yes',
  caseNo: '{fact}: no',
  covered: 'covered',
  uncovered: 'no approved variant',
  counts: '{approved} approved · {draft} draft · {retired} retired',
  statusFacts: {
    operations_started: 'Operations started',
    has_existing_customers: 'Has customers',
    has_completed_transactions: 'Has completed transactions',
    has_regular_suppliers: 'Has regular suppliers',
    learner_is_shareholder: 'Learner is a shareholder',
  },
  sources: {
    DBD_FACT: 'DBD facts',
    BUSINESS_PROFILE: 'Business profile',
    DERIVED: 'Derived',
    ROLE: 'The learner’s role',
    KYC_POLICY: 'Policy',
  },
  status: { draft: 'Draft', approved: 'Approved', retired: 'Retired' },
  recipes: {
    DIRECT_FACT: 'Fact as it is',
    NUMERIC_VARIATION: 'Number varied',
    COUNT_VARIATION: 'Count varied',
    DATE_VARIATION: 'Date varied',
    ID_MUTATION: 'Registration number mutated',
    GEOGRAPHY_ALTERNATIVE: 'Another place',
    BUSINESS_ALTERNATIVE: 'Another business',
    STATIC: 'Fixed text',
    COMPOSITE_TEMPLATE: 'Text with facts',
  },
  concept: {
    back: 'Question bank',
    facts: 'Facts the correct answer may use',
    noFacts: 'None: the correct answer is a fixed policy text.',
    grammarTitle: 'Placeholders and recipes',
    grammar: 'Write a fact in braces. In a wrong option a fact can be varied:',
    allTokens: 'Every placeholder',
    variants: 'Variants',
    none: 'No variants yet.',
    newVariant: 'New variant',
    columns: { key: 'Variant', when: 'For', prompt: 'Thai question', status: 'Status' },
  },
  variant: {
    new: 'New variant',
    structure: 'Options',
    correct: 'Correct',
    recipe: 'Recipe',
    appliesWhen: 'Worded for',
    thai: 'Thai (the text that is approved)',
    english: 'English (reference)',
    chinese: 'Chinese (reference)',
    prompt: 'Question',
    option: 'Option {key}',
    explanation: 'Explanation shown after a wrong answer',
    inheritHint: 'Leave an option blank to take the Thai option when it is placeholders only.',
    save: 'Save',
    saved: 'Saved',
    statusTitle: 'Status',
    approve: 'Approve',
    toDraft: 'Back to draft',
    retire: 'Retire',
    approveHint:
      'Approved on the Thai text. Changing it, the correct option, a recipe or the status it is worded for returns the variant to draft.',
  },
  issues: {
    unknown_concept: 'Unknown concept',
    thai_required: 'The Thai text is required',
    prompt_required: '{where}: the question is blank',
    option_required: '{where}: the option is blank',
    grammar: '{where}: {detail}',
    recipe_mismatch: '{where}: this text is “{detail}”, not the recipe chosen',
    prompt_varies: '{where}: only plain facts here, no varied ones',
    correct_varies: '{where}: the correct option must not vary a fact',
    correct_foreign_fact: '{where}: the correct option uses a fact that is not this concept’s ({detail})',
    correct_needs_fact: '{where}: the correct option must use one of the concept’s facts',
    duplicate_option: '{where}: the same text as option {detail}',
    applies_when_fact: 'This concept has no wording for that status',
    translation_placeholders: '{where}: must keep the Thai placeholders ({detail})',
    failed: 'Could not save. Try again.',
  },
  preview: {
    title: 'Preview',
    company: 'Company',
    sample: 'Sample company (fictional)',
    show: 'Show',
    redraw: 'Draw again',
    ok: 'Can be asked of this company',
    fail: 'Cannot be asked of this company: {reason}',
    noVersion: 'This company has no training version.',
  },
  failures: {
    no_text: 'no text',
    not_applicable: 'worded for another status',
    missing_fact: 'a fact is missing ({detail})',
    no_category: 'no business category is mapped',
    no_alternatives: 'not enough alternatives to draw from',
    out_of_range: 'a varied value is out of range ({detail})',
    grammar: 'a placeholder is not valid ({detail})',
    invalid: 'the variant breaks a rule ({detail})',
    empty_option: 'an option comes out empty ({detail})',
    duplicate_option: 'two options come out the same ({detail})',
  },
  check: {
    title: 'Check a company',
    intro: 'What the approved bank can ask one company today, concept by concept.',
    company: 'Company',
    choose: 'Choose a company',
    learner: 'Learner',
    companyOnly: 'Company only',
    run: 'Check',
    none: 'No company has a training version yet.',
    summary: '{ok} of {total} concepts can be asked',
    columns: { concept: 'Concept', variant: 'Variant', asks: 'It would ask', result: 'Result' },
    usable: 'can be asked',
    blocked: 'cannot be asked',
    noApproved: 'no approved variant',
  },
};

const th = {
  title: 'คลังคำถาม',
  intro:
    'แนวคิดละหนึ่งคำถาม รวมสามสิบแนวคิด แนวคิดจะพร้อมเมื่อมีคำถามที่อนุมัติแล้วครบทุกกรณี',
  ready: 'พร้อมแล้ว {ready} จาก {total} แนวคิด',
  checkCompany: 'ตรวจกับบริษัท',
  legacy: 'คำถามชุดเดิม',
  loadStarter: 'เพิ่มร่างตัวอย่าง {count} ข้อ',
  starterHint: 'ตัวอย่างที่ใช้ได้จริง ครบทุกสูตร เข้ามาเป็นร่างให้คุณแก้ไข อนุมัติ หรือเลิกใช้',
  starterLoaded: '{count, plural, =0 {ไม่มีร่างที่ต้องเพิ่ม} other {เพิ่มร่างแล้ว # ข้อ}}',
  starterFailed: 'เพิ่มร่างไม่สำเร็จ กรุณาลองอีกครั้ง',
  columns: { order: '#', concept: 'แนวคิด', source: 'อ่านจาก', cases: 'กรณี', variants: 'คำถาม' },
  critical: 'สำคัญ',
  caseAlways: 'ทุกบริษัท',
  caseYes: '{fact}: ใช่',
  caseNo: '{fact}: ไม่ใช่',
  covered: 'ครบแล้ว',
  uncovered: 'ยังไม่มีคำถามที่อนุมัติ',
  counts: 'อนุมัติ {approved} · ร่าง {draft} · เลิกใช้ {retired}',
  statusFacts: {
    operations_started: 'เริ่มดำเนินกิจการแล้ว',
    has_existing_customers: 'มีลูกค้าแล้ว',
    has_completed_transactions: 'มีรายการที่สำเร็จแล้ว',
    has_regular_suppliers: 'มีผู้ขายประจำ',
    learner_is_shareholder: 'ผู้เรียนเป็นผู้ถือหุ้น',
  },
  sources: {
    DBD_FACT: 'ข้อมูล DBD',
    BUSINESS_PROFILE: 'ข้อมูลธุรกิจ',
    DERIVED: 'คำนวณจากข้อมูล',
    ROLE: 'บทบาทของผู้เรียน',
    KYC_POLICY: 'นโยบาย',
  },
  status: { draft: 'ร่าง', approved: 'อนุมัติแล้ว', retired: 'เลิกใช้' },
  recipes: {
    DIRECT_FACT: 'ข้อเท็จจริงตามจริง',
    NUMERIC_VARIATION: 'ตัวเลขที่ปรับ',
    COUNT_VARIATION: 'จำนวนที่ปรับ',
    DATE_VARIATION: 'วันที่ที่ปรับ',
    ID_MUTATION: 'เลขทะเบียนที่เปลี่ยนหลัก',
    GEOGRAPHY_ALTERNATIVE: 'สถานที่อื่น',
    BUSINESS_ALTERNATIVE: 'ธุรกิจอื่น',
    STATIC: 'ข้อความคงที่',
    COMPOSITE_TEMPLATE: 'ข้อความผสมข้อเท็จจริง',
  },
  concept: {
    back: 'คลังคำถาม',
    facts: 'ข้อเท็จจริงที่คำตอบที่ถูกใช้ได้',
    noFacts: 'ไม่มี: คำตอบที่ถูกเป็นข้อความนโยบายคงที่',
    grammarTitle: 'ตัวแทนข้อเท็จจริงและสูตร',
    grammar: 'เขียนข้อเท็จจริงไว้ในวงเล็บปีกกา ในตัวเลือกที่ผิดสามารถปรับข้อเท็จจริงได้ดังนี้',
    allTokens: 'ตัวแทนข้อเท็จจริงทั้งหมด',
    variants: 'คำถาม',
    none: 'ยังไม่มีคำถาม',
    newVariant: 'คำถามใหม่',
    columns: { key: 'คำถาม', when: 'สำหรับ', prompt: 'คำถามภาษาไทย', status: 'สถานะ' },
  },
  variant: {
    new: 'คำถามใหม่',
    structure: 'ตัวเลือก',
    correct: 'คำตอบที่ถูก',
    recipe: 'สูตร',
    appliesWhen: 'เขียนสำหรับ',
    thai: 'ภาษาไทย (ข้อความที่อนุมัติ)',
    english: 'ภาษาอังกฤษ (อ้างอิง)',
    chinese: 'ภาษาจีน (อ้างอิง)',
    prompt: 'คำถาม',
    option: 'ตัวเลือก {key}',
    explanation: 'คำอธิบายที่แสดงเมื่อตอบผิด',
    inheritHint: 'เว้นตัวเลือกว่างไว้เพื่อใช้ตัวเลือกภาษาไทย เมื่อตัวเลือกนั้นมีแต่ตัวแทนข้อเท็จจริง',
    save: 'บันทึก',
    saved: 'บันทึกแล้ว',
    statusTitle: 'สถานะ',
    approve: 'อนุมัติ',
    toDraft: 'กลับเป็นร่าง',
    retire: 'เลิกใช้',
    approveHint:
      'อนุมัติจากข้อความภาษาไทย หากแก้ข้อความไทย คำตอบที่ถูก สูตร หรือกรณีที่เขียนไว้ คำถามจะกลับเป็นร่าง',
  },
  issues: {
    unknown_concept: 'ไม่รู้จักแนวคิดนี้',
    thai_required: 'ต้องมีข้อความภาษาไทย',
    prompt_required: '{where}: คำถามว่างอยู่',
    option_required: '{where}: ตัวเลือกว่างอยู่',
    grammar: '{where}: {detail}',
    recipe_mismatch: '{where}: ข้อความนี้เป็น “{detail}” ไม่ตรงกับสูตรที่เลือก',
    prompt_varies: '{where}: ใช้ได้เฉพาะข้อเท็จจริงตามจริง ไม่ใช้ค่าที่ปรับ',
    correct_varies: '{where}: คำตอบที่ถูกต้องไม่ปรับข้อเท็จจริง',
    correct_foreign_fact: '{where}: คำตอบที่ถูกใช้ข้อเท็จจริงที่ไม่ใช่ของแนวคิดนี้ ({detail})',
    correct_needs_fact: '{where}: คำตอบที่ถูกต้องใช้ข้อเท็จจริงของแนวคิดนี้อย่างน้อยหนึ่งรายการ',
    duplicate_option: '{where}: ข้อความซ้ำกับตัวเลือก {detail}',
    applies_when_fact: 'แนวคิดนี้ไม่มีถ้อยคำสำหรับกรณีนั้น',
    translation_placeholders: '{where}: ต้องคงตัวแทนข้อเท็จจริงตามภาษาไทย ({detail})',
    failed: 'บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง',
  },
  preview: {
    title: 'ตัวอย่าง',
    company: 'บริษัท',
    sample: 'บริษัทตัวอย่าง (สมมติ)',
    show: 'แสดง',
    redraw: 'สุ่มใหม่',
    ok: 'ใช้ถามบริษัทนี้ได้',
    fail: 'ใช้ถามบริษัทนี้ไม่ได้: {reason}',
    noVersion: 'บริษัทนี้ยังไม่มีรุ่นข้อมูล',
  },
  failures: {
    no_text: 'ไม่มีข้อความ',
    not_applicable: 'เขียนไว้สำหรับอีกกรณีหนึ่ง',
    missing_fact: 'ขาดข้อเท็จจริง ({detail})',
    no_category: 'ยังไม่ได้จับคู่หมวดธุรกิจ',
    no_alternatives: 'ตัวเลือกอื่นให้สุ่มไม่พอ',
    out_of_range: 'ค่าที่ปรับอยู่นอกช่วง ({detail})',
    grammar: 'ตัวแทนข้อเท็จจริงไม่ถูกต้อง ({detail})',
    invalid: 'คำถามผิดกฎ ({detail})',
    empty_option: 'มีตัวเลือกที่ออกมาว่าง ({detail})',
    duplicate_option: 'มีสองตัวเลือกที่ออกมาเหมือนกัน ({detail})',
  },
  check: {
    title: 'ตรวจกับบริษัท',
    intro: 'คลังที่อนุมัติแล้วถามบริษัทหนึ่งได้อะไรบ้างในวันนี้ ทีละแนวคิด',
    company: 'บริษัท',
    choose: 'เลือกบริษัท',
    learner: 'ผู้เรียน',
    companyOnly: 'เฉพาะบริษัท',
    run: 'ตรวจ',
    none: 'ยังไม่มีบริษัทที่มีรุ่นข้อมูล',
    summary: 'ถามได้ {ok} จาก {total} แนวคิด',
    columns: { concept: 'แนวคิด', variant: 'คำถาม', asks: 'จะถามว่า', result: 'ผล' },
    usable: 'ถามได้',
    blocked: 'ถามไม่ได้',
    noApproved: 'ยังไม่มีคำถามที่อนุมัติ',
  },
};

const zh = {
  title: '题库',
  intro: '每个概念一道题，共三十个概念。每种情况都有已批准的题目版本时，该概念即就绪。',
  ready: '{total} 个概念中已有 {ready} 个就绪',
  checkCompany: '按公司检查',
  legacy: '早期题目',
  loadStarter: '添加 {count} 道示例草稿',
  starterHint: '可直接使用的示例，覆盖每一种配方。它们以草稿形式加入，供您编辑、批准或停用。',
  starterLoaded: '{count, plural, =0 {没有需要添加的草稿} other {已添加 # 道草稿}}',
  starterFailed: '添加草稿失败，请重试。',
  columns: { order: '#', concept: '概念', source: '读取自', cases: '情况', variants: '题目版本' },
  critical: '关键',
  caseAlways: '所有公司',
  caseYes: '{fact}：是',
  caseNo: '{fact}：否',
  covered: '已覆盖',
  uncovered: '尚无已批准的版本',
  counts: '已批准 {approved} · 草稿 {draft} · 已停用 {retired}',
  statusFacts: {
    operations_started: '已开始经营',
    has_existing_customers: '已有客户',
    has_completed_transactions: '已有完成的交易',
    has_regular_suppliers: '有固定供应商',
    learner_is_shareholder: '学员是股东',
  },
  sources: {
    DBD_FACT: 'DBD 资料',
    BUSINESS_PROFILE: '业务资料',
    DERIVED: '推算',
    ROLE: '学员的角色',
    KYC_POLICY: '政策',
  },
  status: { draft: '草稿', approved: '已批准', retired: '已停用' },
  recipes: {
    DIRECT_FACT: '原样事实',
    NUMERIC_VARIATION: '数值变化',
    COUNT_VARIATION: '数量变化',
    DATE_VARIATION: '日期变化',
    ID_MUTATION: '注册号变位',
    GEOGRAPHY_ALTERNATIVE: '其他地点',
    BUSINESS_ALTERNATIVE: '其他业务',
    STATIC: '固定文字',
    COMPOSITE_TEMPLATE: '含事实的文字',
  },
  concept: {
    back: '题库',
    facts: '正确答案可用的事实',
    noFacts: '无：正确答案是固定的政策文字。',
    grammarTitle: '占位符与配方',
    grammar: '把事实写在花括号里。错误选项中可以这样变化事实：',
    allTokens: '全部占位符',
    variants: '题目版本',
    none: '还没有题目版本。',
    newVariant: '新建版本',
    columns: { key: '版本', when: '适用', prompt: '泰文题目', status: '状态' },
  },
  variant: {
    new: '新建版本',
    structure: '选项',
    correct: '正确',
    recipe: '配方',
    appliesWhen: '适用情况',
    thai: '泰文（据此批准）',
    english: '英文（参考）',
    chinese: '中文（参考）',
    prompt: '题目',
    option: '选项 {key}',
    explanation: '答错后显示的解释',
    inheritHint: '选项留空时，若泰文选项只含占位符，则沿用泰文选项。',
    save: '保存',
    saved: '已保存',
    statusTitle: '状态',
    approve: '批准',
    toDraft: '退回草稿',
    retire: '停用',
    approveHint: '按泰文文字批准。修改泰文、正确选项、配方或适用情况后，该版本会退回草稿。',
  },
  issues: {
    unknown_concept: '未知的概念',
    thai_required: '必须有泰文文字',
    prompt_required: '{where}：题目为空',
    option_required: '{where}：选项为空',
    grammar: '{where}：{detail}',
    recipe_mismatch: '{where}：该文字属于“{detail}”，与所选配方不符',
    prompt_varies: '{where}：此处只能使用原样事实，不能使用变化值',
    correct_varies: '{where}：正确选项不得变化事实',
    correct_foreign_fact: '{where}：正确选项使用了不属于本概念的事实（{detail}）',
    correct_needs_fact: '{where}：正确选项必须使用本概念的一项事实',
    duplicate_option: '{where}：与选项 {detail} 的文字相同',
    applies_when_fact: '该概念没有针对这种情况的措辞',
    translation_placeholders: '{where}：必须保留泰文中的占位符（{detail}）',
    failed: '保存失败，请重试。',
  },
  preview: {
    title: '预览',
    company: '公司',
    sample: '示例公司（虚构）',
    show: '显示',
    redraw: '重新抽取',
    ok: '可以向该公司提问',
    fail: '不能向该公司提问：{reason}',
    noVersion: '该公司还没有培训版本。',
  },
  failures: {
    no_text: '没有文字',
    not_applicable: '措辞针对另一种情况',
    missing_fact: '缺少事实（{detail}）',
    no_category: '尚未匹配业务类别',
    no_alternatives: '可抽取的备选项不足',
    out_of_range: '变化后的数值超出范围（{detail}）',
    grammar: '占位符无效（{detail}）',
    invalid: '该版本违反规则（{detail}）',
    empty_option: '有选项结果为空（{detail}）',
    duplicate_option: '有两个选项结果相同（{detail}）',
  },
  check: {
    title: '按公司检查',
    intro: '已批准的题库今天能向一家公司提出哪些问题，逐个概念列出。',
    company: '公司',
    choose: '选择公司',
    learner: '学员',
    companyOnly: '仅公司',
    run: '检查',
    none: '还没有公司拥有培训版本。',
    summary: '{total} 个概念中可提问 {ok} 个',
    columns: { concept: '概念', variant: '版本', asks: '将会提问', result: '结果' },
    usable: '可以提问',
    blocked: '不能提问',
    noApproved: '尚无已批准的版本',
  },
};

for (const [locale, bank] of Object.entries({ en, th, zh })) {
  const path = `messages/${locale}.json`;
  const messages = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (messages.admin.bank) throw new Error(`${locale}: admin.bank already there`);
  messages.admin.bank = bank;
  fs.writeFileSync(path, JSON.stringify(messages, null, 2) + '\n');
  console.log(locale, 'admin.bank:', Object.keys(bank).length, 'keys');
}
```

Run: `node <scratchpad>/p17d-messages.cjs && pnpm exec prettier --check messages/*.json && pnpm exec vitest run --config vitest.config.ts tests/unit/messages.test.ts`
Expected: three lines `admin.bank: 27 keys`; formatting clean; the message test passes.

- [ ] **Step 2: The earlier questions keep their list, one level down**

```bash
mkdir -p "app/[locale]/(admin)/admin/questions/legacy"
git mv "app/[locale]/(admin)/admin/questions/page.tsx" "app/[locale]/(admin)/admin/questions/legacy/page.tsx"
```

In `legacy/page.tsx`:
- the import `./actions` becomes `../actions`;
- rename the component to `LegacyQuestionsPage`;
- read only the earlier questions: `listQuestions(db, { legacyOnly: true })`;
- the header becomes a way back plus the title and the *New* link:

```tsx
      <Link href="/admin/questions" className="staff-link text-sm">
        ← {tb('title')}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="staff-title">{tb('legacy')}</h1>
        <Link href="/admin/questions/new" className="staff-btn staff-btn-sm">
          {t('new')}
        </Link>
      </div>
```

with `const tb = await getTranslations('admin.bank');` beside the other translators. The two filter forms and the table are unchanged (the *Generate* link already went in Task 2).

The inline *Approve* on that list must come back to it. In `app/[locale]/(admin)/admin/questions/actions.ts`, `approveQuestionAction`:

```ts
  revalidatePath(`/${locale}/admin/questions/legacy`);
```

```ts
  redirect(`/${locale}/admin/questions/legacy${suffix ? `?${suffix}` : ''}`);
```

In `app/[locale]/(admin)/admin/questions/[id]/page.tsx`: a variant opened through the old address goes to its own editor, and the way back is the earlier list.

```tsx
import { notFound, redirect } from 'next/navigation';
```

```tsx
  if (!question) notFound();
  if (question.concept_key) redirect(`/${locale}/admin/questions/variants/${question.id}`);
```

```tsx
      <Link href="/admin/questions/legacy" className="staff-link text-sm">
        ← {tb('legacy')}
      </Link>
```

(add `const tb = await getTranslations('admin.bank');`).

- [ ] **Step 3: The starter button**

```ts
// app/[locale]/(admin)/admin/questions/bank-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { MCQ_STARTER } from '@/lib/content/mcq-starter';
import { loadStarterVariants } from '@/lib/db/mcq-bank';
import { createSupabaseServerClient } from '@/lib/db/server';

export type StarterState = { done: boolean; created: number; failed: boolean };

/** Adds the starter drafts that are not in the bank yet, under the Owner's own session. */
export async function loadStarterAction(
  _prev: StarterState,
  formData: FormData,
): Promise<StarterState> {
  const locale = String(formData.get('locale') ?? 'th');
  const owner = await requireAdmin(locale);
  try {
    const { created } = await loadStarterVariants(
      await createSupabaseServerClient(),
      MCQ_STARTER,
      owner.id,
    );
    revalidatePath(`/${locale}/admin/questions`);
    return { done: true, created: created.length, failed: false };
  } catch (e) {
    console.error('starter drafts', e);
    return { done: false, created: 0, failed: true };
  }
}
```

```tsx
// app/[locale]/(admin)/admin/questions/bank-forms.tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { loadStarterAction, type StarterState } from './bank-actions';

const starterInitial: StarterState = { done: false, created: 0, failed: false };

/** Offered while some starter drafts are not in the bank yet. */
export function StarterForm({ count }: { count: number }) {
  const locale = useLocale();
  const t = useTranslations('admin.bank');
  const [state, formAction, pending] = useActionState(loadStarterAction, starterInitial);
  return (
    <form action={formAction} className="staff-card grid gap-2">
      <input type="hidden" name="locale" value={locale} />
      <p className="text-sm text-ink-700">{t('starterHint')}</p>
      {state.failed && (
        <p role="alert" className="text-sm text-bad-600">
          {t('starterFailed')}
        </p>
      )}
      {state.done && (
        <p role="status" data-testid="starter-loaded" className="text-sm text-ok-600">
          {t('starterLoaded', { count: state.created })}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        data-testid="load-starter"
        className="staff-btn-ghost justify-self-start"
      >
        {t('loadStarter', { count })}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: The bank by concept**

```tsx
// app/[locale]/(admin)/admin/questions/page.tsx
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { MCQ_STARTER } from '@/lib/content/mcq-starter';
import { listVariants } from '@/lib/db/mcq-bank';
import { createSupabaseServerClient } from '@/lib/db/server';
import { conceptTitle, MCQ_CONCEPTS } from '@/lib/domain/concepts/registry';
import { bankCoverage } from '@/lib/domain/mcq/coverage';
import type { AppliesWhen } from '@/lib/domain/mcq/variant';
import { StarterForm } from './bank-forms';

/** The Owner's bank, concept first (P17d): thirty concepts and what each still lacks. */
export default async function QuestionBankPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireAdmin(locale);
  const variants = await listVariants(await createSupabaseServerClient());
  const coverage = bankCoverage(variants);
  const held = new Set(variants.map((v) => v.key));
  const startersMissing = MCQ_STARTER.filter((s) => !held.has(s.key)).length;
  const t = await getTranslations('admin.bank');
  const caseLabel = (when: AppliesWhen | null) =>
    when === null
      ? t('caseAlways')
      : t(when.value ? 'caseYes' : 'caseNo', {
          fact: t(`statusFacts.${when.fact}` as 'statusFacts.operations_started'),
        });
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="staff-title">{t('title')}</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/questions/check"
            data-testid="bank-check"
            className="staff-btn-ghost staff-btn-sm"
          >
            {t('checkCompany')}
          </Link>
          <Link
            href="/admin/questions/legacy"
            data-testid="bank-legacy"
            className="staff-btn-ghost staff-btn-sm"
          >
            {t('legacy')}
          </Link>
        </div>
      </div>
      <p className="staff-intro">{t('intro')}</p>
      <p
        className={coverage.ready === coverage.total ? 'staff-notice-ok' : 'staff-notice-info'}
        data-testid="bank-ready"
        data-ready={coverage.ready}
      >
        {t('ready', { ready: coverage.ready, total: coverage.total })}
      </p>
      {startersMissing > 0 && <StarterForm count={startersMissing} />}

      <div className="staff-table-wrap">
        <table className="staff-table">
          <thead>
            <tr>
              <th>{t('columns.order')}</th>
              <th>{t('columns.concept')}</th>
              <th>{t('columns.source')}</th>
              <th>{t('columns.cases')}</th>
              <th>{t('columns.variants')}</th>
            </tr>
          </thead>
          <tbody>
            {coverage.concepts.map((c) => {
              const def = MCQ_CONCEPTS.find((d) => d.key === c.conceptKey)!;
              return (
                <tr
                  key={c.conceptKey}
                  className="align-top"
                  data-testid={`concept-${c.conceptKey}`}
                  data-covered={c.covered}
                >
                  <td className="tabular-nums">{def.mcqOrder}</td>
                  <td>
                    <Link
                      href={`/admin/questions/concepts/${c.conceptKey}`}
                      className="staff-link"
                    >
                      {conceptTitle(c.conceptKey, locale)}
                    </Link>
                    {def.critical && <span className="staff-tag ml-1">{t('critical')}</span>}
                  </td>
                  <td>{t(`sources.${def.source}` as 'sources.DBD_FACT')}</td>
                  <td>
                    <ul className="grid gap-1 text-sm">
                      {c.cases.map((k) => (
                        <li
                          key={k.when ? `${k.when.fact}:${k.when.value}` : 'always'}
                          className={k.approved > 0 ? 'text-ok-600' : 'text-warn-700'}
                        >
                          {caseLabel(k.when)} — {k.approved > 0 ? t('covered') : t('uncovered')}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="text-sm text-ink-700">{t('counts', c.counts)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: The concept page**

```tsx
// app/[locale]/(admin)/admin/questions/concepts/[key]/page.tsx
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { listVariants } from '@/lib/db/mcq-bank';
import { createSupabaseServerClient } from '@/lib/db/server';
import { conceptTitle, MCQ_CONCEPTS } from '@/lib/domain/concepts/registry';
import { TOKENS, type TokenName } from '@/lib/domain/mcq/tokens';

const EXAMPLES = [
  '{registered_capital|numeric(x0.5)}',
  '{registered_capital|numeric(+1000)}',
  '{director_count|count(+1)}',
  '{registered_on|date(-1y)}',
  '{juristic_id|id_mutation}',
  '{province|geo_alt(region)}',
  '{district|geo_alt(province)}',
  '{subdistrict|geo_alt(district)}',
  '{business_category|business_alt}',
];
const ALL_TOKENS = Object.keys(TOKENS) as TokenName[];

/** One concept: what its correct answer may be built from, and the variants written for it. */
export default async function ConceptPage({
  params,
}: {
  params: Promise<{ locale: string; key: string }>;
}) {
  const { locale, key } = await params;
  await requireAdmin(locale);
  const def = MCQ_CONCEPTS.find((c) => c.key === key);
  if (!def) notFound();
  const variants = (await listVariants(await createSupabaseServerClient())).filter(
    (v) => v.conceptKey === key,
  );
  const facts: readonly string[] = def.facts;
  const own = ALL_TOKENS.filter((name) => TOKENS[name].facts.every((f) => facts.includes(f)));
  const t = await getTranslations('admin.bank');
  return (
    <section className="grid gap-5">
      <Link href="/admin/questions" className="staff-link text-sm">
        ← {t('concept.back')}
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="staff-title">
          {def.mcqOrder}. {conceptTitle(def.key, locale)}
        </h1>
        {def.critical && <span className="staff-tag">{t('critical')}</span>}
        <span className="staff-tag">{t(`sources.${def.source}` as 'sources.DBD_FACT')}</span>
      </div>

      <div className="staff-card grid gap-3 text-sm">
        <div>
          <p className="font-semibold">{t('concept.facts')}</p>
          {own.length === 0 ? (
            <p className="text-ink-700">{t('concept.noFacts')}</p>
          ) : (
            <p data-testid="concept-tokens" className="flex flex-wrap gap-2">
              {own.map((name) => (
                <code key={name}>{`{${name}}`}</code>
              ))}
            </p>
          )}
        </div>
        <details>
          <summary className="cursor-pointer font-semibold">{t('concept.grammarTitle')}</summary>
          <p className="mt-2 text-ink-700">{t('concept.grammar')}</p>
          <p className="mt-1 flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <code key={example}>{example}</code>
            ))}
          </p>
          <p className="mt-3 font-semibold">{t('concept.allTokens')}</p>
          <p className="mt-1 flex flex-wrap gap-2">
            {ALL_TOKENS.map((name) => (
              <code key={name}>{`{${name}}`}</code>
            ))}
          </p>
        </details>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('concept.variants')}</h2>
        <Link
          href={`/admin/questions/variants/new?concept=${def.key}`}
          data-testid="variant-new"
          className="staff-btn staff-btn-sm"
        >
          {t('concept.newVariant')}
        </Link>
      </div>
      {variants.length === 0 ? (
        <p className="text-sm text-ink-700">{t('concept.none')}</p>
      ) : (
        <div className="staff-table-wrap">
          <table className="staff-table">
            <thead>
              <tr>
                <th>{t('concept.columns.key')}</th>
                <th>{t('concept.columns.when')}</th>
                <th>{t('concept.columns.prompt')}</th>
                <th>{t('concept.columns.status')}</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.id} className="align-top" data-testid={`variant-${v.key}`}>
                  <td className="whitespace-nowrap">
                    <Link href={`/admin/questions/variants/${v.id}`} className="staff-link">
                      {v.key}
                    </Link>
                  </td>
                  <td>
                    {v.appliesWhen
                      ? t(v.appliesWhen.value ? 'caseYes' : 'caseNo', {
                          fact: t(
                            `statusFacts.${v.appliesWhen.fact}` as 'statusFacts.operations_started',
                          ),
                        })
                      : t('caseAlways')}
                  </td>
                  <td className="max-w-md text-ink-700">{v.texts.th?.prompt ?? '—'}</td>
                  <td data-testid="variant-row-status" data-status={v.status}>
                    {t(`status.${v.status}` as 'status.draft')}
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

- [ ] **Step 6: Check**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:unit`
Expected: clean; the unit suite passes (the message parity test included). The variant links lead to pages that Task 9 creates.

- [ ] **Step 7: Commit**

```bash
git add messages "app/[locale]/(admin)/admin/questions"
git commit -m "feat(bank): the bank by concept with coverage, the concept page, the earlier questions one level down (P17d)"
```

---

## Task 9: The variant editor, its status, its preview

**Files:**
- Create: `app/[locale]/(admin)/admin/questions/variant-form.tsx`, `variants/new/page.tsx`, `variants/[id]/page.tsx`
- Modify: `app/[locale]/(admin)/admin/questions/bank-actions.ts`, `bank-forms.tsx`
- Test: covered end to end in Task 11; this task ends on `pnpm typecheck`, `pnpm lint` and a manual open of the page

- [ ] **Step 1: The actions**

Replace the imports of `bank-actions.ts` and append the two actions:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/session';
import { MCQ_STARTER } from '@/lib/content/mcq-starter';
import {
  loadStarterVariants,
  saveVariant,
  setVariantStatus,
  VariantError,
} from '@/lib/db/mcq-bank';
import { createSupabaseServerClient } from '@/lib/db/server';
import { STATUS_FACTS, type StatusFact } from '@/lib/domain/facts/fact-sheet';
import { RECIPES } from '@/lib/domain/mcq/tokens';
import type { VariantIssue } from '@/lib/domain/mcq/validate';
import {
  inheritPlaceholders,
  OPTION_KEYS,
  VARIANT_LOCALES,
  type Variant,
  type VariantOptionKey,
  type VariantText,
} from '@/lib/domain/mcq/variant';
import type { Locale } from '@/lib/domain/thai-date';
```

```ts
/**
 * `values` carries what was typed back to the form when a save is refused: React resets an
 * uncontrolled form after its action, and an editor must not lose the Owner's text to a rule.
 */
export type VariantState = {
  ok: boolean;
  failed: boolean;
  issues: VariantIssue[];
  values: Record<string, string> | null;
};

const recipe = z.enum(RECIPES);
const structureSchema = z.object({
  conceptKey: z.string().min(1).max(60),
  correctKey: z.enum(OPTION_KEYS),
  optionRecipes: z.object({ A: recipe, B: recipe, C: recipe, D: recipe }),
  appliesWhen: z
    .string()
    .regex(/^([a-z_]+):(true|false)$/)
    .refine((v) => (STATUS_FACTS as readonly string[]).includes(v.split(':')[0]))
    .nullable(),
});

function readText(formData: FormData, locale: Locale): VariantText | null {
  const field = (name: string) => String(formData.get(`${locale}_${name}`) ?? '').trim();
  const options = Object.fromEntries(
    OPTION_KEYS.map((key) => [key, field(`option_${key}`)]),
  ) as Record<VariantOptionKey, string>;
  const text = { prompt: field('prompt'), options, explanation: field('explanation') || null };
  // A translation nobody wrote is absent, not blank; the Thai text is always there to be checked.
  const blank = !text.prompt && !text.explanation && OPTION_KEYS.every((key) => !options[key]);
  return locale !== 'th' && blank ? null : text;
}

/** Creates or updates a variant under the Owner's own session; every rule is checked first. */
export async function saveVariantAction(
  _prev: VariantState,
  formData: FormData,
): Promise<VariantState> {
  const locale = String(formData.get('locale') ?? 'th');
  const owner = await requireAdmin(locale);
  const id = String(formData.get('id') ?? '') || null;
  const values = Object.fromEntries(
    [...formData.entries()].filter((e): e is [string, string] => typeof e[1] === 'string'),
  );
  const refused = (issues: VariantIssue[], failed: boolean): VariantState => ({
    ok: false,
    failed,
    issues,
    values,
  });
  const parsed = structureSchema.safeParse({
    conceptKey: formData.get('conceptKey'),
    correctKey: formData.get('correctKey'),
    optionRecipes: Object.fromEntries(OPTION_KEYS.map((key) => [key, formData.get(`recipe_${key}`)])),
    appliesWhen: String(formData.get('appliesWhen') ?? '') || null,
  });
  if (!parsed.success) return refused([], true);
  const texts: Variant['texts'] = {};
  for (const language of VARIANT_LOCALES) {
    const text = readText(formData, language);
    if (text) texts[language] = text;
  }
  const [fact, value] = parsed.data.appliesWhen?.split(':') ?? [];
  let savedId: string;
  try {
    savedId = await saveVariant(
      await createSupabaseServerClient(),
      {
        id,
        conceptKey: parsed.data.conceptKey,
        correctKey: parsed.data.correctKey,
        optionRecipes: parsed.data.optionRecipes,
        appliesWhen: fact ? { fact: fact as StatusFact, value: value === 'true' } : null,
        texts: inheritPlaceholders(texts),
      },
      owner.id,
    );
  } catch (e) {
    if (e instanceof VariantError) return refused(e.issues, false);
    console.error('variant save', e);
    return refused([], true);
  }
  revalidatePath(`/${locale}/admin/questions`);
  if (!id) redirect(`/${locale}/admin/questions/variants/${savedId}`);
  revalidatePath(`/${locale}/admin/questions/variants/${savedId}`);
  return { ok: true, failed: false, issues: [], values: null };
}

export type StatusState = { failed: boolean; issues: VariantIssue[] };

/** Approve, return to draft or retire; an approval checks the rules again. */
export async function setVariantStatusAction(
  _prev: StatusState,
  formData: FormData,
): Promise<StatusState> {
  const locale = String(formData.get('locale') ?? 'th');
  await requireAdmin(locale);
  const id = String(formData.get('id') ?? '');
  const status = formData.get('status');
  if (status !== 'draft' && status !== 'approved' && status !== 'retired') {
    return { failed: true, issues: [] };
  }
  try {
    await setVariantStatus(await createSupabaseServerClient(), id, status);
  } catch (e) {
    if (e instanceof VariantError) return { failed: false, issues: e.issues };
    console.error('variant status', e);
    return { failed: true, issues: [] };
  }
  revalidatePath(`/${locale}/admin/questions`);
  revalidatePath(`/${locale}/admin/questions/variants/${id}`);
  return { failed: false, issues: [] };
}
```

- [ ] **Step 2: The editor**

```tsx
// app/[locale]/(admin)/admin/questions/variant-form.tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import type { StatusFact } from '@/lib/domain/facts/fact-sheet';
import { RECIPES } from '@/lib/domain/mcq/tokens';
import type { VariantIssue } from '@/lib/domain/mcq/validate';
import { OPTION_KEYS, type Variant } from '@/lib/domain/mcq/variant';
import { saveVariantAction, type VariantState } from './bank-actions';

const initial: VariantState = { ok: false, failed: false, issues: [], values: null };

export function IssueList({ issues }: { issues: VariantIssue[] }) {
  const t = useTranslations('admin.bank');
  if (issues.length === 0) return null;
  return (
    <ul role="alert" data-testid="variant-issues" className="staff-notice-bad grid gap-1 text-sm">
      {issues.map((issue) => (
        <li key={`${issue.code}@${issue.where}`} data-code={issue.code} data-where={issue.where}>
          {t(`issues.${issue.code}` as 'issues.grammar', {
            where: issue.where,
            detail: issue.detail,
          })}
        </li>
      ))}
    </ul>
  );
}

/**
 * One variant: the Thai text it is approved on with the four options, their recipes and the
 * correct one; then the two reference translations. Inputs are solid, never glass (design brief).
 */
export function VariantForm({
  conceptKey,
  statusFacts,
  variant,
}: {
  conceptKey: string;
  statusFacts: readonly StatusFact[];
  variant: Variant | null;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.bank');
  const [state, formAction, pending] = useActionState(saveVariantAction, initial);
  // What was typed in a refused save wins over what is stored.
  const value = (name: string, stored: string) => state.values?.[name] ?? stored;
  const stored = (language: 'th' | 'en' | 'zh') => variant?.texts[language];
  const applies = variant?.appliesWhen
    ? `${variant.appliesWhen.fact}:${variant.appliesWhen.value}`
    : '';
  return (
    <form action={formAction} className="grid gap-4" data-testid="variant-form">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={variant?.id ?? ''} />
      <input type="hidden" name="conceptKey" value={conceptKey} />

      <fieldset className="staff-card grid gap-3">
        <legend className="px-1 text-sm font-semibold">{t('variant.thai')}</legend>
        <label className="text-sm">
          {t('variant.prompt')}
          <textarea
            name="th_prompt"
            rows={2}
            required
            defaultValue={value('th_prompt', stored('th')?.prompt ?? '')}
            className="staff-input mt-1"
          />
        </label>
        {OPTION_KEYS.map((key) => (
          <div key={key} className="grid gap-2 md:grid-cols-[auto_1fr_15rem] md:items-end">
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="correctKey"
                value={key}
                defaultChecked={value('correctKey', variant?.correctKey ?? 'A') === key}
              />
              {t('variant.correct')}
            </label>
            <label className="text-sm">
              {t('variant.option', { key })}
              <input
                name={`th_option_${key}`}
                defaultValue={value(`th_option_${key}`, stored('th')?.options[key] ?? '')}
                className="staff-input mt-1"
              />
            </label>
            <label className="text-sm">
              {t('variant.recipe')}
              <select
                name={`recipe_${key}`}
                defaultValue={value(
                  `recipe_${key}`,
                  variant?.optionRecipes[key] ?? (key === 'A' ? 'DIRECT_FACT' : 'STATIC'),
                )}
                className="staff-input mt-1"
              >
                {RECIPES.map((recipe) => (
                  <option key={recipe} value={recipe}>
                    {t(`recipes.${recipe}` as 'recipes.STATIC')}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
        <label className="text-sm">
          {t('variant.explanation')}
          <textarea
            name="th_explanation"
            rows={2}
            defaultValue={value('th_explanation', stored('th')?.explanation ?? '')}
            className="staff-input mt-1"
          />
        </label>
        {statusFacts.length > 0 && (
          <label className="text-sm">
            {t('variant.appliesWhen')}
            <select
              name="appliesWhen"
              defaultValue={value('appliesWhen', applies)}
              className="staff-input mt-1"
            >
              <option value="">{t('caseAlways')}</option>
              {statusFacts.flatMap((fact) =>
                [true, false].map((flag) => (
                  <option key={`${fact}:${flag}`} value={`${fact}:${flag}`}>
                    {t(flag ? 'caseYes' : 'caseNo', {
                      fact: t(`statusFacts.${fact}` as 'statusFacts.operations_started'),
                    })}
                  </option>
                )),
              )}
            </select>
          </label>
        )}
      </fieldset>

      {(['en', 'zh'] as const).map((language) => (
        <details
          key={language}
          open={Boolean(stored(language)) || Boolean(state.values?.[`${language}_prompt`])}
          className="staff-card"
          data-testid={`variant-${language}`}
        >
          <summary className="cursor-pointer text-sm font-semibold">
            {t(language === 'en' ? 'variant.english' : 'variant.chinese')}
          </summary>
          <div className="mt-3 grid gap-3">
            <label className="text-sm">
              {t('variant.prompt')}
              <textarea
                name={`${language}_prompt`}
                rows={2}
                defaultValue={value(`${language}_prompt`, stored(language)?.prompt ?? '')}
                className="staff-input mt-1"
              />
            </label>
            {OPTION_KEYS.map((key) => (
              <label key={key} className="text-sm">
                {t('variant.option', { key })}
                <input
                  name={`${language}_option_${key}`}
                  defaultValue={value(
                    `${language}_option_${key}`,
                    stored(language)?.options[key] ?? '',
                  )}
                  className="staff-input mt-1"
                />
              </label>
            ))}
            <p className="text-sm text-ink-700">{t('variant.inheritHint')}</p>
            <label className="text-sm">
              {t('variant.explanation')}
              <textarea
                name={`${language}_explanation`}
                rows={2}
                defaultValue={value(
                  `${language}_explanation`,
                  stored(language)?.explanation ?? '',
                )}
                className="staff-input mt-1"
              />
            </label>
          </div>
        </details>
      ))}

      <IssueList issues={state.issues} />
      {state.failed && (
        <p role="alert" className="text-sm text-bad-600">
          {t('issues.failed')}
        </p>
      )}
      {state.ok && (
        <p role="status" data-testid="variant-saved" className="text-sm text-ok-600">
          {t('variant.saved')}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        data-testid="variant-save"
        className="staff-btn justify-self-start"
      >
        {t('variant.save')}
      </button>
    </form>
  );
}
```

The hint under the translated options is 14px (`text-sm`): Thai is never set below that (design brief).

- [ ] **Step 3: The status buttons**

Append to `bank-forms.tsx` (add the imports `setVariantStatusAction, type StatusState` from `./bank-actions`, `type VariantStatus` from `@/lib/domain/mcq/variant`, and `IssueList` from `./variant-form`):

```tsx
const statusInitial: StatusState = { failed: false, issues: [] };
const MOVES: { to: VariantStatus; label: 'approve' | 'toDraft' | 'retire'; testId: string }[] = [
  { to: 'approved', label: 'approve', testId: 'variant-approve' },
  { to: 'draft', label: 'toDraft', testId: 'variant-draft' },
  { to: 'retired', label: 'retire', testId: 'variant-retire' },
];

/** Where the variant stands, and the two places it may go from there. */
export function VariantStatusForm({ id, status }: { id: string; status: VariantStatus }) {
  const locale = useLocale();
  const t = useTranslations('admin.bank');
  const [state, formAction, pending] = useActionState(setVariantStatusAction, statusInitial);
  return (
    <form action={formAction} className="staff-card grid gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={id} />
      <p className="text-sm">
        {t('variant.statusTitle')}:{' '}
        <span className="staff-tag" data-testid="variant-status" data-status={status}>
          {t(`status.${status}` as 'status.draft')}
        </span>
      </p>
      <p className="text-sm text-ink-700">{t('variant.approveHint')}</p>
      <IssueList issues={state.issues} />
      {state.failed && (
        <p role="alert" className="text-sm text-bad-600">
          {t('issues.failed')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {MOVES.filter((move) => move.to !== status).map((move) => (
          <button
            key={move.to}
            type="submit"
            name="status"
            value={move.to}
            disabled={pending}
            data-testid={move.testId}
            className={move.to === 'approved' ? 'staff-btn-ok' : 'staff-btn-ghost'}
          >
            {t(`variant.${move.label}` as 'variant.approve')}
          </button>
        ))}
      </div>
    </form>
  );
}
```

- [ ] **Step 4: The new-variant page**

```tsx
// app/[locale]/(admin)/admin/questions/variants/new/page.tsx
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { conceptTitle, MCQ_CONCEPTS } from '@/lib/domain/concepts/registry';
import { VariantForm } from '../../variant-form';

export default async function NewVariantPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ concept?: string }>;
}) {
  const { locale } = await params;
  const { concept } = await searchParams;
  await requireAdmin(locale);
  const def = MCQ_CONCEPTS.find((c) => c.key === concept);
  if (!def) notFound();
  const t = await getTranslations('admin.bank');
  return (
    <section className="grid gap-5">
      <Link href={`/admin/questions/concepts/${def.key}`} className="staff-link text-sm">
        ← {def.mcqOrder}. {conceptTitle(def.key, locale)}
      </Link>
      <h1 className="staff-title">{t('variant.new')}</h1>
      <VariantForm conceptKey={def.key} statusFacts={def.alternateWhen} variant={null} />
    </section>
  );
}
```

- [ ] **Step 5: The variant page with its preview**

```tsx
// app/[locale]/(admin)/admin/questions/variants/[id]/page.tsx
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { getVariant } from '@/lib/db/mcq-bank';
import { contextForRecord, listVersionedCompanies } from '@/lib/db/mcq-context';
import { createSupabaseServerClient } from '@/lib/db/server';
import { conceptTitle, MCQ_CONCEPTS } from '@/lib/domain/concepts/registry';
import { preflightVariant } from '@/lib/domain/mcq/preflight';
import { renderVariant } from '@/lib/domain/mcq/render';
import { SAMPLE_CONTEXT } from '@/lib/domain/mcq/sample';
import { VARIANT_LOCALES } from '@/lib/domain/mcq/variant';
import { VariantStatusForm } from '../../bank-forms';
import { VariantForm } from '../../variant-form';

const LANGUAGE_LABELS = { th: 'ไทย', en: 'English', zh: '中文' } as const;

export default async function VariantPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ company?: string; draw?: string }>;
}) {
  const { locale, id } = await params;
  const query = await searchParams;
  await requireAdmin(locale);
  const db = await createSupabaseServerClient();
  const variant = await getVariant(db, id);
  if (!variant) notFound();
  const def = MCQ_CONCEPTS.find((c) => c.key === variant.conceptKey);
  if (!def) notFound();

  // The preview: the fictional sample company, or a real one that has a training version.
  const companies = await listVersionedCompanies(db);
  const company = companies.find((c) => c.recordId === query.company) ?? null;
  const draw = Math.max(0, Number.parseInt(query.draw ?? '0', 10) || 0);
  const ctx = company ? await contextForRecord(db, company.recordId, null) : SAMPLE_CONTEXT;
  const seed = `preview:${variant.id}:${draw}`;
  const check = ctx ? preflightVariant(variant, ctx, seed) : null;
  const views = ctx
    ? VARIANT_LOCALES.map((language) => ({
        language,
        result: renderVariant(variant, ctx, seed, language),
      }))
    : [];
  const t = await getTranslations('admin.bank');
  const reason = (code: string, detail: string) =>
    t(`failures.${code}` as 'failures.missing_fact', { detail });
  const chosen = company?.recordId ?? 'sample';

  return (
    <section className="grid gap-5">
      <Link href={`/admin/questions/concepts/${def.key}`} className="staff-link text-sm">
        ← {def.mcqOrder}. {conceptTitle(def.key, locale)}
      </Link>
      <h1 className="staff-title">{variant.key}</h1>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <VariantForm conceptKey={def.key} statusFacts={def.alternateWhen} variant={variant} />

        <div className="grid content-start gap-4">
          <VariantStatusForm id={variant.id} status={variant.status} />

          <div className="staff-card grid gap-3">
            <h2 className="text-lg font-semibold">{t('preview.title')}</h2>
            <form method="get" className="flex flex-wrap items-end gap-2 text-sm">
              <label>
                {t('preview.company')}
                <select
                  name="company"
                  defaultValue={chosen}
                  data-testid="preview-company"
                  className="staff-input mt-1"
                >
                  <option value="sample">{t('preview.sample')}</option>
                  {companies.map((c) => (
                    <option key={c.recordId} value={c.recordId}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="staff-btn-ghost staff-btn-sm">
                {t('preview.show')}
              </button>
              <Link
                href={`/admin/questions/variants/${variant.id}?company=${chosen}&draw=${draw + 1}`}
                data-testid="preview-redraw"
                className="staff-link"
              >
                {t('preview.redraw')}
              </Link>
            </form>

            {check === null ? (
              <p className="staff-notice-warn text-sm">{t('preview.noVersion')}</p>
            ) : (
              <p
                className={check.ok ? 'staff-notice-ok text-sm' : 'staff-notice-warn text-sm'}
                data-testid="preflight"
                data-ok={check.ok}
              >
                {check.ok
                  ? t('preview.ok')
                  : t('preview.fail', { reason: reason(check.code, check.detail) })}
              </p>
            )}

            {views.map(({ language, result }) => (
              <div
                key={language}
                className="grid gap-1 border-t pt-3 text-sm"
                data-testid={`preview-${language}`}
              >
                <p className="text-xs font-semibold text-ink-700">{LANGUAGE_LABELS[language]}</p>
                {result.ok ? (
                  <>
                    <p className="font-semibold">{result.rendered.prompt}</p>
                    <ol className="grid gap-1">
                      {result.rendered.options.map((option) => (
                        <li
                          key={option.key}
                          data-correct={option.key === variant.correctKey}
                          className={
                            option.key === variant.correctKey ? 'font-semibold text-ok-600' : ''
                          }
                        >
                          {option.key}. {option.text}
                        </li>
                      ))}
                    </ol>
                    {result.rendered.explanation && (
                      <p className="text-ink-700">{result.rendered.explanation}</p>
                    )}
                  </>
                ) : (
                  <p className="text-warn-700">{reason(result.code, result.detail)}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Check, and open it**

Run: `pnpm typecheck && pnpm lint && pnpm format:check`
Expected: clean.

Then with `pnpm dev -p 3100` running, sign in as the Owner, open `/th/admin/questions`, load the starter drafts, open *ทุนจดทะเบียน* and its variant: the preview shows `2,000,000 บาท` first in Thai, `THB` in English, `泰铢` in Chinese, and *Draw again* leaves this variant unchanged (nothing in it is drawn) while it changes the provinces of `mcq-registered-location-1`.

- [ ] **Step 7: Commit**

```bash
git add "app/[locale]/(admin)/admin/questions"
git commit -m "feat(bank): the variant editor with its rules, status and a three-language preview (P17d)"
```

---

## Task 10: Check a company

**Files:**
- Create: `app/[locale]/(admin)/admin/questions/check/page.tsx`
- Test: covered end to end in Task 11

- [ ] **Step 1: The page**

```tsx
// app/[locale]/(admin)/admin/questions/check/page.tsx
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { listVariants } from '@/lib/db/mcq-bank';
import {
  contextForRecord,
  listRecordLearners,
  listVersionedCompanies,
} from '@/lib/db/mcq-context';
import { createSupabaseServerClient } from '@/lib/db/server';
import { conceptTitle } from '@/lib/domain/concepts/registry';
import { checkBank } from '@/lib/domain/mcq/preflight';

/**
 * What the approved bank can ask one company as its facts stand today (P17d plan decision 10):
 * per concept, the variant that would be asked, or why none can be. With a learner chosen the
 * per-learner concept is checked on their own role.
 */
export default async function CheckCompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ record?: string; learner?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  await requireAdmin(locale);
  const db = await createSupabaseServerClient();
  const companies = await listVersionedCompanies(db);
  const company = companies.find((c) => c.recordId === query.record) ?? null;
  const learners = company ? await listRecordLearners(db, company.recordId) : [];
  const learner = learners.find((l) => l.assignmentId === query.learner) ?? null;
  const ctx = company
    ? await contextForRecord(db, company.recordId, learner?.assignmentId ?? null)
    : null;
  const checks = ctx && company ? checkBank(await listVariants(db), ctx, `check:${company.recordId}`) : [];
  const usable = checks.filter((c) => c.variant).length;
  const t = await getTranslations('admin.bank');
  return (
    <section className="grid gap-4">
      <Link href="/admin/questions" className="staff-link text-sm">
        ← {t('title')}
      </Link>
      <h1 className="staff-title">{t('check.title')}</h1>
      <p className="staff-intro">{t('check.intro')}</p>

      {companies.length === 0 ? (
        <p className="staff-notice-info" data-testid="check-none">
          {t('check.none')}
        </p>
      ) : (
        <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
          <label>
            {t('check.company')}
            <select
              name="record"
              defaultValue={company?.recordId ?? ''}
              data-testid="check-company"
              className="staff-input mt-1"
            >
              <option value="">{t('check.choose')}</option>
              {companies.map((c) => (
                <option key={c.recordId} value={c.recordId}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {company && (
            <label>
              {t('check.learner')}
              <select
                name="learner"
                defaultValue={learner?.assignmentId ?? ''}
                data-testid="check-learner"
                className="staff-input mt-1"
              >
                <option value="">{t('check.companyOnly')}</option>
                {learners.map((l) => (
                  <option key={l.assignmentId} value={l.assignmentId}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" data-testid="check-run" className="staff-btn-ghost staff-btn-sm">
            {t('check.run')}
          </button>
        </form>
      )}

      {checks.length > 0 && (
        <>
          <p
            className={usable === checks.length ? 'staff-notice-ok' : 'staff-notice-warn'}
            data-testid="check-summary"
            data-usable={usable}
          >
            {t('check.summary', { ok: usable, total: checks.length })}
          </p>
          <div className="staff-table-wrap">
            <table className="staff-table">
              <thead>
                <tr>
                  <th>{t('check.columns.concept')}</th>
                  <th>{t('check.columns.variant')}</th>
                  <th>{t('check.columns.asks')}</th>
                  <th>{t('check.columns.result')}</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c, index) => (
                  <tr
                    key={c.conceptKey}
                    className="align-top"
                    data-testid={`check-${c.conceptKey}`}
                    data-state={c.variant ? 'usable' : 'blocked'}
                  >
                    <td>
                      <Link
                        href={`/admin/questions/concepts/${c.conceptKey}`}
                        className="staff-link"
                      >
                        {index + 1}. {conceptTitle(c.conceptKey, locale)}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap">
                      {c.variant ? (
                        <Link
                          href={`/admin/questions/variants/${c.variant.id}`}
                          className="staff-link"
                        >
                          {c.variant.key}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="max-w-md text-sm text-ink-700">
                      {c.rendered && c.variant ? (
                        <>
                          {c.rendered.prompt}
                          <br />
                          <span className="font-semibold text-ok-600">
                            {c.rendered.options.find((o) => o.key === c.variant?.correctKey)?.text}
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="text-sm">
                      <span className={c.variant ? 'text-ok-600' : 'text-warn-700'}>
                        {c.variant ? t('check.usable') : t('check.blocked')}
                      </span>
                      {!c.variant && c.skipped.length === 0 && <> — {t('check.noApproved')}</>}
                      {c.skipped.length > 0 && (
                        <ul className="mt-1 grid gap-1 text-ink-700">
                          {c.skipped.map((s) => (
                            <li key={s.key}>
                              {s.key}:{' '}
                              {t(`failures.${s.code}` as 'failures.missing_fact', {
                                detail: s.detail,
                              })}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Check**

Run: `pnpm typecheck && pnpm lint && pnpm format:check`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "app/[locale]/(admin)/admin/questions/check"
git commit -m "feat(bank): check a company — what the approved bank can ask it, concept by concept (P17d)"
```

---

## Task 11: End to end

**Files:**
- Create: `tests/e2e/mcq-bank.spec.ts`
- Modify: `tests/e2e/seed.ts`

- [ ] **Step 1: The seeds keep to the earlier questions**

Two seed helpers pick "any question" for a hand-made exam attempt; a variant has placeholders the old review does not render. In `tests/e2e/seed.ts`:

`seedPassedExam` — the question lookup becomes:

```ts
  const { data: question } = await admin
    .from('questions')
    .select('id')
    .is('concept_key', null)
    .limit(1)
    .single();
```

`seedExamWithAnswer` — the localization lookup becomes:

```ts
  const { data: loc, error: locError } = await admin
    .from('question_localizations')
    .select('question_id, prompt, options, correct_key, questions!inner(concept_key)')
    .eq('language', 'th')
    .is('questions.concept_key', null)
    .not('prompt', 'like', '%{%')
    .limit(1)
    .single();
```

- [ ] **Step 2: Write the spec**

```ts
// tests/e2e/mcq-bank.spec.ts
import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompleteCompany } from './seed';

/** The bank, with the starter drafts in it; then one of them, through its concept. */
async function openStarterVariant(page: Page, concept: string, key: string) {
  await page.goto('/th/admin/questions');
  const starter = page.getByTestId('load-starter');
  if (await starter.isVisible()) {
    await starter.click();
    await expect(starter).toHaveCount(0);
  }
  await page.getByTestId(`concept-${concept}`).getByRole('link').click();
  await page.waitForURL(new RegExp(`/th/admin/questions/concepts/${concept}$`));
  await page.getByTestId(`variant-${key}`).getByRole('link').click();
  await page.waitForURL(/\/th\/admin\/questions\/variants\/[0-9a-f-]{36}$/);
}

test('the Owner loads the starter drafts, previews a variant in three languages and approves it', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await openStarterVariant(page, 'registered_capital', 'mcq-registered-capital-1');

  // The fictional sample company: the same numbers in each language's own form.
  await expect(page.getByTestId('preflight')).toHaveAttribute('data-ok', 'true');
  const th = page.getByTestId('preview-th');
  await expect(th.locator('li[data-correct="true"]')).toHaveText('A. 2,000,000 บาท');
  await expect(th.locator('li')).toHaveText([
    'A. 2,000,000 บาท',
    'B. 1,000,000 บาท',
    'C. 4,000,000 บาท',
    'D. 20,000,000 บาท',
  ]);
  await expect(page.getByTestId('preview-en')).toContainText('2,000,000 THB');
  await expect(page.getByTestId('preview-zh')).toContainText('2,000,000 泰铢');

  // Approved on the Thai text; changing that text returns it to draft; approved again.
  const status = page.getByTestId('variant-status');
  if ((await status.getAttribute('data-status')) !== 'approved') {
    await page.getByTestId('variant-approve').click();
  }
  await expect(status).toHaveAttribute('data-status', 'approved');
  await page
    .locator('textarea[name="th_prompt"]')
    .fill(`ทุนจดทะเบียนของ {company_name_th} คือเท่าใด (${Date.now()})`);
  await page.getByTestId('variant-save').click();
  await expect(page.getByTestId('variant-saved')).toBeVisible();
  await expect(status).toHaveAttribute('data-status', 'draft');
  await page.getByTestId('variant-approve').click();
  await expect(status).toHaveAttribute('data-status', 'approved');

  await page.goto('/th/admin/questions');
  await expect(page.getByTestId('concept-registered_capital')).toHaveAttribute(
    'data-covered',
    'true',
  );
  // A concept with two cases is not covered by drafts.
  await expect(page.getByTestId('concept-main_clients')).toHaveAttribute('data-covered', 'false');
});

test('drawn places are different from each other and the same in every language', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await openStarterVariant(page, 'registered_location', 'mcq-registered-location-1');
  const th = page.getByTestId('preview-th');
  await expect(th.locator('li[data-correct="true"]')).toHaveText('A. ร้อยเอ็ด');
  await expect(page.getByTestId('preview-en').locator('li[data-correct="true"]')).toHaveText(
    'A. Roi Et',
  );
  await expect(page.getByTestId('preview-zh').locator('li[data-correct="true"]')).toHaveText(
    'A. ร้อยเอ็ด (Roi Et)',
  );
  const drawn = await th.locator('li').allTextContents();
  expect(new Set(drawn.map((text) => text.slice(3))).size).toBe(4);
  // The Chinese view shows the very places the Thai view drew.
  const zh = await page.getByTestId('preview-zh').locator('li').allTextContents();
  for (const [index, text] of drawn.entries()) {
    expect(zh[index]).toContain(text.slice(3));
  }
  await page.getByTestId('preview-redraw').click();
  await expect(page).toHaveURL(/draw=1$/);
  await expect(th.locator('li[data-correct="true"]')).toHaveText('A. ร้อยเอ็ด');
});

test('a new variant is refused until its options match their recipes, and nothing typed is lost', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/questions/variants/new?concept=director_count');
  await page.locator('textarea[name="th_prompt"]').fill('บริษัทมีกรรมการทั้งหมดกี่คน');
  await page.locator('input[name="th_option_A"]').fill('{director_count}');
  await page.locator('input[name="th_option_B"]').fill('{director_count|count(+1)}');
  await page.locator('input[name="th_option_C"]').fill('{director_count|count(+2)}');
  await page.locator('input[name="th_option_D"]').fill('{director_count|count(+3)}');
  await page.getByTestId('variant-save').click();

  // B, C and D were left as "fixed text": the editor says what each really is.
  const issues = page.getByTestId('variant-issues');
  await expect(issues.locator('li[data-code="recipe_mismatch"]')).toHaveCount(3);
  await expect(page.locator('input[name="th_option_B"]')).toHaveValue('{director_count|count(+1)}');
  for (const key of ['B', 'C', 'D']) {
    await page.locator(`select[name="recipe_${key}"]`).selectOption('COUNT_VARIATION');
  }
  await page.getByTestId('variant-save').click();
  await page.waitForURL(/\/th\/admin\/questions\/variants\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('variant-status')).toHaveAttribute('data-status', 'draft');
  await expect(page.getByTestId('preview-th').locator('li')).toHaveText([
    'A. 2',
    'B. 3',
    'C. 4',
    'D. 5',
  ]);

  // A placeholder the grammar does not know is named, and the stored variant is untouched.
  await page.locator('input[name="th_option_D"]').fill('{directors_total}');
  await page.getByTestId('variant-save').click();
  await expect(
    page.getByTestId('variant-issues').locator('li[data-code="grammar"]'),
  ).toContainText('{directors_total}');
  await page.reload();
  await expect(page.locator('input[name="th_option_D"]')).toHaveValue('{director_count|count(+3)}');

  // Leave the bank as it was: the experiment is retired.
  await page.getByTestId('variant-retire').click();
  await expect(page.getByTestId('variant-status')).toHaveAttribute('data-status', 'retired');
});

test('checking a company lists what the bank can ask it', async ({ page }) => {
  const company = `บริษัท ตรวจคลัง ${Date.now()} จำกัด`;
  await seedLearnerWithCompleteCompany(company);
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/questions');
  await page.getByTestId('bank-check').click();
  await page.waitForURL(/\/th\/admin\/questions\/check$/);
  await page.getByTestId('check-company').selectOption({ label: company });
  await page.getByTestId('check-run').click();

  await expect(page.locator('tr[data-testid^="check-"]')).toHaveCount(30);
  // Approved by the first test: this company's own capital, from its training version.
  const capital = page.getByTestId('check-registered_capital');
  await expect(capital).toHaveAttribute('data-state', 'usable');
  await expect(capital).toContainText('2,000,000 บาท');
  // Nobody has written a variant for the first concept yet.
  await expect(page.getByTestId('check-company_name')).toHaveAttribute('data-state', 'blocked');
  await expect(page.getByTestId('check-summary')).toBeVisible();
});

test('the earlier questions keep their own list', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/questions');
  await page.getByTestId('bank-legacy').click();
  await expect(page).toHaveURL(/\/th\/admin\/questions\/legacy$/);
  await expect(page.locator('tr[data-testid^="question-sample-"]').first()).toBeVisible();
  await expect(page.locator('tr[data-testid^="question-mcq-"]')).toHaveCount(0);
});
```

- [ ] **Step 3: Run it**

Run: `PLAYWRIGHT_PORT=3100 pnpm exec playwright test tests/e2e/mcq-bank.spec.ts`
Expected: 5 passed.

- [ ] **Step 4: Run the specs the bank touches**

Run: `PLAYWRIGHT_PORT=3100 pnpm exec playwright test tests/e2e/ai-questions.spec.ts tests/e2e/quiz.spec.ts tests/e2e/exam.spec.ts tests/e2e/learner-record.spec.ts tests/e2e/staff-shell.spec.ts tests/e2e/manager-manages.spec.ts tests/e2e/three-roles.spec.ts`
Expected: all pass. `staff-shell.spec.ts` opens `/th/admin/questions` on a phone: the concept table scrolls inside its wrapper, the page does not.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/mcq-bank.spec.ts tests/e2e/seed.ts
git commit -m "test(bank): starter drafts, preview in three languages, the rules in the editor, check a company (P17d)"
```

---

## Task 12: Documentation and the full gate

**Files:**
- Modify: `docs/decisions-log.md`, `docs/security-checklist.md`, `docs/runbooks/operations.md`, `docs/runbooks/production-setup.md`, `docs/uat-script.md`

- [ ] **Step 1: The documents**

Save as a script in the scratchpad and run it from the worktree root:

```js
// p17d-docs.cjs
const fs = require('fs');
const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => {
  fs.writeFileSync(p, s);
  console.log('edited', p);
};
const afterLine = (p, prefix, lines) => {
  const all = read(p).split('\n');
  const hits = all.map((l, i) => (l.startsWith(prefix) ? i : -1)).filter((i) => i >= 0);
  if (hits.length < 1) throw new Error(`${p}: no line starts with ${prefix}`);
  all.splice(hits[hits.length - 1] + 1, 0, ...lines);
  write(p, all.join('\n'));
};
const appendToRow = (p, rowPrefix, text) => {
  const all = read(p).split('\n');
  const i = all.findIndex((l) => l.startsWith(rowPrefix));
  if (i < 0) throw new Error(`${p}: row not found ${rowPrefix}`);
  const cells = all[i].split(' | ');
  if (cells.length < 4) throw new Error(`${p}: unexpected row shape for ${rowPrefix}`);
  cells[2] = cells[2] + ' ' + text;
  all[i] = cells.join(' | ');
  write(p, all.join('\n'));
};

// 1. Decisions.
const L = 'docs/decisions-log.md';
appendToRow(
  L,
  '| 2026-09-30 | D76 |',
  'Enforced in P17d: RLS lets only the Owner write `questions`, `question_localizations` and `question_generation_batches` (staff read); the bank screens, the sidebar entry and the home card are the Owner’s.',
);
appendToRow(
  L,
  '| 2026-09-30 | D77 |',
  'Implemented in P17d: `lib/domain/mcq/` holds the grammar, the validator, the seeded renderer and the preflight; a variant is a `questions` row with `concept_key`, `correct_option_key`, `option_recipes`, `applies_when`.',
);
afterLine(L, '| 2026-10-01 | D85 |', [
  '| 2026-10-01 | D86 | **How the MCQ bank works (P17d).** A variant is approved on its Thai text alone; changing that text, the correct option, a recipe or the status it is worded for returns it to draft, changing a translation does not, and a draft is always valid — the editor refuses to save a broken one. Exactly four options. The correct option uses no varying recipe and only placeholders of the concept’s own facts, so a business category is never a correct answer and a policy concept’s answer is static. A mutated registration number keeps a valid check digit. Geography has Thai and English names only, so the Chinese view prints both (`ร้อยเอ็ด (Roi Et)`); all three languages show the same draws. Preflight is on demand in P17d — the variant preview and *Check a company*; raising `render_failure` is P17e’s. AI generation is hidden (the address leads back to the bank) and stays in the code until P17i; *Fill missing languages* remains on earlier questions only. Eleven starter drafts, one for every recipe, are loaded by the Owner as drafts; the other concepts are written by the Owner. | `supabase/migrations/20261004010000_mcq_bank.sql`, `lib/domain/mcq/`, `lib/content/mcq-starter.ts`, plan `docs/superpowers/plans/2026-10-01-p17d-mcq-bank-and-recipes.md` |',
]);

// 2. Security checklist: the next free number after the two rows numbered 30.
afterLine('docs/security-checklist.md', '| 30 |', [
  '| 31 | The question bank is written only by the Owner under their own session (audited): managers read it and learners see none of it; a variant is approved on its Thai text and returns to draft when that text or its structure changes; an invalid variant is never stored | ✅ | `tests/integration/mcq-bank.db.test.ts`, `tests/integration/mcq-bank.test.ts`, `tests/e2e/mcq-bank.spec.ts`, `tests/e2e/manager-manages.spec.ts` |',
]);

// 3. Runbooks and UAT.
afterLine('docs/runbooks/operations.md', '| A record is not accepted / a company has no training version |', [
  '| A concept shows *no approved variant*, or a variant *cannot be asked* of a company | Admin → Question bank: the concept row lists its cases; a variant page previews it against any company with a training version; *Check a company* lists all thirty concepts for one company with the reason beside each | write or approve a variant for the missing case; supply the missing fact or map the business category on the company’s record; a variant whose options collide for one company yields to the next approved variant of that concept |',
]);
afterLine('docs/runbooks/production-setup.md', '   **Validation and exceptions (P17c).**', [
  '',
  '   **The MCQ bank (P17d).** Migration `20261004010000_mcq_bank.sql` adds the variant columns and makes the bank Owner-only: from this migration on a manager can no longer write or approve questions. Nothing is migrated; the earlier questions keep feeding the quiz and exam. The starter drafts are not in the migration: the Owner adds them from Admin → Question bank → *Add starter drafts*.',
]);
afterLine('docs/uat-script.md', '| A15 |', [
  '| A16 | The MCQ bank | Admin → Question bank → *Add starter drafts*; open *Registered capital* and its variant; choose a real company in *Preview*; *Approve*; change the Thai question and save; open *Check a company* for that company; sign in as a manager | The preview shows the company’s own capital first and three different wrong amounts, the same in Thai, English and Chinese; *Approve* turns the status to Approved and the changed question returns it to Draft; *Check a company* lists thirty concepts with the approved ones marked *can be asked*; the manager has no Question bank in the sidebar and its address sends them home | — |',
]);
```

Run: `node <scratchpad>/p17d-docs.cjs && pnpm exec prettier --check docs`
Expected: seven `edited` lines (the decisions log three times); formatting clean.

- [ ] **Step 2: The full gate**

```bash
pnpm lint && pnpm typecheck && pnpm format:check
pnpm test:unit
pnpm db:reset && pnpm test:integration
pnpm build && pnpm check:secrets
PLAYWRIGHT_PORT=3100 pnpm test:e2e
```

Expected: all green. The database is reset first so the integration suite runs on a clean local stack (a manager's audit-log read slows down on a stack that has seen many runs). The end-to-end count is 101 before this phase, minus two removed tests (AI generation by the Owner, by a manager), plus two that replace them, plus five in `mcq-bank.spec.ts`: 106.

- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs: D76 enforced, D77 implemented, D86, checklist row 31, runbooks and UAT A16 (P17d)"
```

- [ ] **Step 4: Stop and report**

Report: commits, the migration, tests added and their counts, deviations from this plan, debt, and what the Owner sees. Do not push, open a PR, or touch production: the Owner applies `20261004010000_mcq_bank.sql` to production before any merge.

---

## Self-review

**Spec coverage (§8, §6, §10 "P17d").**

| Spec | Task |
| --- | --- |
| Owner-only bank; managers read | 1 (RLS), 2 (screens) |
| A variant belongs to one concept, may carry `applies_when` | 1 (columns, guard), 5 (rule), 9 (editor) |
| Approved on Thai alone; translations keep the placeholders | 1 (trigger), 5 (`translation_placeholders`) |
| Editing an approved variant returns it to draft; retired stay linked | 1 (two triggers; no delete policy on `questions`) |
| Grammar `{fact}`, `{fact\|recipe(args)}`, STATIC, COMPOSITE | 3 |
| Each option declares its recipe; the editor checks | 5 (`recipe_mismatch`), 9 |
| Rendering seeded; alternates without replacement; languages reuse the seed | 4 |
| Preflight: four non-empty unique options, correct from the concept's facts, no distractor equal | 5 |
| A failing variant yields to the next | 5 (`pickVariant`) |
| BUSINESS_ALTERNATIVE unavailable without a mapped category | 4 (`no_category`), 5 |
| Geography distractors from the reference tables only, scoped | 4, 6 (`geoNeighbours`) |
| Preview | 9 |
| AI generation hidden | 2 |
| `render_failure` exception; attempt, shuffle, score | P17e — out of scope, stated |

**Placeholder scan.** No "TBD" or "similar to"; every step that changes code shows the code. Two steps describe small edits to existing files in prose with the exact replacement (Task 2 guards, Task 8 moved list): the lines to change are named and the new lines are given.

**Type consistency.** `Variant`, `VariantDraft`, `VariantText`, `AppliesWhen`, `StarterVariant` are defined once in `lib/domain/mcq/variant.ts` (Task 4) and used unchanged in Tasks 5–10. `RenderContext` (Task 4) is what `geoNeighbours`, `loadRenderContext` and `contextForRecord` return (Task 6). `VariantIssue` and `ISSUE_CODES` (Task 5) are the codes the messages carry (Task 8). `PreflightCode` (Task 5) is the set under `admin.bank.failures` (Task 8). `saveVariant(db, input, actorId)` and `setVariantStatus(db, id, status)` (Task 6) are called with those shapes in Task 9.
