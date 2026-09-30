# P17a — Facts and concepts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every fact the two evaluations will read exists and is visible — a structured registered address resolved against Thai geography, an automatically mapped business category, the expanded business profile with status facts, and a 37-row concept registry that reports, per record and per assignment, which MCQ and chatbot concepts already resolve.

**Architecture:** Reference data (geography, categories, concepts) lives in tables written by migrations (categories: by the Owner alone — P17 supersedes D54 for assessment content; managers read). Derived facts (address, category) are computed server-side by `refreshDerivedFacts` after every save, extraction and transcript fill, and stored under `dbd_records.structured_data` through `readStructuredData`, which every existing writer already round-trips. The category is non-blocking assessment metadata: a mapping failure never fails a save or an extraction and is not part of resolvability. Pure domain modules (`lib/domain/geo`, `lib/domain/facts`, `lib/domain/concepts`) build a canonical fact sheet and resolve concepts in two scopes — a record counts 29 MCQ / 12 chatbot company-level concepts, an assignment 30 / 13 once its role facts resolve; the admin record and user pages show the result. Nothing is gated yet — confirmation stays as it is until P17c. Owner-only writes on the MCQ bank and the chatbot script land with those banks (P17d, P17f).

**Tech Stack:** Next.js 16 App Router (read `node_modules/next/dist/docs/` for any API you touch — AGENTS.md), React 19, next-intl (th/en/zh), Supabase Postgres with RLS, zod 4, Vitest (unit + integration), Playwright, `@anthropic-ai/sdk` structured outputs.

**Spec:** `docs/superpowers/specs/2026-09-30-p17-evaluation-architecture-design.md` §5, §7, §13.

---

## Before you start

- Branch from the latest `main`: `git switch -c p17a/facts-and-concepts origin/main`.
- Docker Desktop running, then `pnpm db:start && pnpm db:env && pnpm db:reset`.
- Test commands used below:
  - one unit file: `pnpm exec vitest run --config vitest.config.ts <path>`
  - one integration file: `pnpm exec vitest run --config vitest.integration.config.ts <path>`
  - one e2e file: `pnpm exec playwright test <path> --reporter=line`
- After every migration: `pnpm db:reset` then `pnpm db:types` (commit `lib/db/database.types.ts` with the migration).
- New migrations are timestamped after `20260930000000`: `20261001010000` (geography), `20261001020000` (categories), `20261001030000` (concepts).

> **Execution notes (2026-09-30, Owner-approved run).** A parallel, uncommitted work stream (D80, branch `feat/learners-and-dbd`) already uses `20260930010000`, so P17a's three migrations were moved to `2026100101/02/03 0000` to sort after it. P17a runs in its own worktree (`../portal-p17a`) with its own local Supabase stack (project id `thailand-training-portal-p17a`, ports 553xx; that `supabase/config.toml` change is local only and never committed), so neither stream resets the other's database. The category mapper follows the repository's model convention — one `MODEL` constant per Claude adapter (`lib/integrations/{extraction,question-gen,rag}/…`) — rather than a new configuration scheme.

- Every user-facing string goes into all three of `messages/th.json`, `en.json`, `zh.json` (the unit suite fails on a missing or empty key). Thai text is never below 14px in new UI (`text-sm` or larger).

## File map

| File | Status | Responsibility |
| --- | --- | --- |
| `scripts/build-geo-migration.mjs` | create | builds the geography migration from the pinned dataset |
| `supabase/migrations/20261001010000_thai_geography.sql` | create (generated) | regions, provinces, districts, subdistricts |
| `supabase/migrations/20261001020000_business_categories.sql` | create | category dictionary, draft seed, confidence policy row |
| `supabase/migrations/20261001030000_evaluation_concepts.sql` | create | the 37-row registry |
| `lib/domain/geo/address.ts` | create | printed-address parser, place-name normalisation |
| `lib/domain/geo/types.ts` | create | geography row types, `GeoLookup` |
| `lib/domain/geo/resolve.ts` | create | `RegisteredAddress`, `resolveRegisteredAddress` |
| `lib/db/geo.ts` | create | `GeoLookup` over the tables |
| `lib/domain/business-category.ts` | create | `CategoryAssignment`, input hash, decisions |
| `lib/domain/dbd-profile.ts` | modify | `structured_data.address` / `.category` |
| `lib/domain/bank-interview.ts` | modify | expanded profile, status facts, `isShareholder` |
| `lib/integrations/category-map/*` | create | `CATEGORY_MAP_PROVIDER` = claude \| fake \| off |
| `lib/db/business-categories.ts` | create | dictionary reads and Owner writes |
| `lib/db/derived-facts.ts` | create | `refreshDerivedFacts`, manual set, remap |
| `lib/domain/facts/fact-sheet.ts` | create | `FactSheet`, `buildFactSheet` |
| `lib/domain/concepts/registry.ts` | create | `EVALUATION_CONCEPTS` |
| `lib/domain/concepts/resolve.ts` | create | resolvability and coverage |
| `lib/config/policy-defaults.ts`, `policy-schema.ts` | modify | `business_category_min_confidence_percent` |
| `app/[locale]/(admin)/admin/dbd-records/actions.ts` | modify | refresh after saves; category actions |
| `app/api/cron/index/route.ts` | modify | refresh after extraction / transcript address |
| `app/api/health/route.ts` | modify | `categoryMap` provider |
| `app/[locale]/(admin)/admin/dbd-records/[id]/{address-panel,category-panel,coverage-panel}.tsx` | create | record panels |
| `app/[locale]/(admin)/admin/dbd-records/[id]/interview-form.tsx` | modify | status facts, groups, alternate labels |
| `app/[locale]/(admin)/admin/dbd-records/[id]/page.tsx` | modify | panels wired |
| `app/[locale]/(admin)/admin/business-categories/{page,actions,category-form}.tsx` | create | Owner-only dictionary page |
| `components/staff/staff-nav.tsx`, `app/[locale]/(admin)/admin/page.tsx`, `lib/db/middleware.ts` | modify | nav, hub, guard |
| `app/[locale]/(admin)/admin/users/[id]/page.tsx` | modify | assignment coverage |
| `tests/integration/setup.ts`, `playwright.config.ts`, `.env.example` | modify | fake mapper in suites |
| tests (unit, integration, e2e) | create | per task |
| docs | modify | decisions D70–D79, checklists, runbooks |

---

## Task 1: Thai geography reference tables

**Files:**
- Create: `scripts/build-geo-migration.mjs`
- Create (generated): `supabase/migrations/20261001010000_thai_geography.sql`
- Modify: `package.json` (script `geo:migration`), `lib/db/database.types.ts` (regenerated)
- Test: `tests/integration/geo.test.ts`

- [ ] **Step 1: Write the failing integration test**

```ts
// tests/integration/geo.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  anonClient,
  clientFor,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers';

const svc = adminClient();

type GeoTable = 'geo_regions' | 'geo_provinces' | 'geo_districts' | 'geo_subdistricts';

async function count(table: GeoTable): Promise<number | null> {
  const { count: n, error } = await svc.from(table).select('*', { count: 'exact', head: true });
  if (error) throw error;
  return n;
}

/** The geography is reference data (spec 2026-09-30 §5.2): the whole country, read-only. */
describe('Thai geography', () => {
  let learner: TestUser;
  beforeAll(async () => {
    learner = await createTestUser('learner');
  });
  afterAll(async () => {
    await deleteTestUser(learner.id);
  });

  it('holds the whole country from the pinned dataset', async () => {
    expect(await count('geo_regions')).toBe(6);
    expect(await count('geo_provinces')).toBe(77);
    expect(await count('geo_districts')).toBe(930);
    expect(await count('geo_subdistricts')).toBe(7436);
  });

  it('chains Nong Yai to Phon Thong to Roi Et, postcode 45110', async () => {
    const { data: province } = await svc
      .from('geo_provinces')
      .select('id, region_id, name_en')
      .eq('name_th', 'ร้อยเอ็ด')
      .single();
    expect(province).toMatchObject({ region_id: 3, name_en: 'Roi Et' });
    const { data: district } = await svc
      .from('geo_districts')
      .select('id, prefix_th')
      .eq('province_id', province!.id)
      .eq('name_th', 'โพนทอง')
      .single();
    expect(district!.prefix_th).toBe('อำเภอ');
    const { data: subdistrict } = await svc
      .from('geo_subdistricts')
      .select('postcode, name_en')
      .eq('district_id', district!.id)
      .eq('name_th', 'หนองใหญ่')
      .single();
    expect(subdistrict).toEqual({ postcode: '45110', name_en: 'Nong Yai' });
  });

  it('is read by any signed-in user and by nobody anonymous', async () => {
    const { data } = await (await clientFor(learner))
      .from('geo_provinces')
      .select('id')
      .eq('name_th', 'กรุงเทพมหานคร');
    expect(data).toHaveLength(1);
    const { data: anon } = await anonClient().from('geo_provinces').select('id').limit(1);
    expect(anon).toEqual([]);
  });

  it('is never written by a signed-in user', async () => {
    const { error } = await (await clientFor(learner))
      .from('geo_regions')
      .insert({ id: 99, name_th: 'ทดสอบ', name_en: 'Test' });
    expect(error?.code).toBe('42501');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/geo.test.ts`
Expected: FAIL — `relation "public.geo_regions" does not exist`.

- [ ] **Step 3: Write the generator**

```js
// scripts/build-geo-migration.mjs
// Builds supabase/migrations/20261001010000_thai_geography.sql from kongvut/thai-province-data
// pinned at one commit (MIT licence). Run once; a newer dataset goes into a NEW migration.
import { writeFileSync } from 'node:fs';

const COMMIT = '7d689e478a577a1c9348f2b998c39dd4c2bf153d';
const BASE = `https://raw.githubusercontent.com/kongvut/thai-province-data/${COMMIT}/api/latest`;
const OUT = new URL('../supabase/migrations/20261001010000_thai_geography.sql', import.meta.url);

// The dataset's geography_id (verified against Chiang Mai 1, Bangkok 2, Roi Et 3,
// Kanchanaburi 4, Chon Buri 5, Phuket 6).
const REGIONS = [
  { id: 1, th: 'ภาคเหนือ', en: 'North' },
  { id: 2, th: 'ภาคกลาง', en: 'Central' },
  { id: 3, th: 'ภาคตะวันออกเฉียงเหนือ', en: 'Northeast' },
  { id: 4, th: 'ภาคตะวันตก', en: 'West' },
  { id: 5, th: 'ภาคตะวันออก', en: 'East' },
  { id: 6, th: 'ภาคใต้', en: 'South' },
];

async function load(name) {
  const res = await fetch(`${BASE}/${name}.json`);
  if (!res.ok) throw new Error(`${name}.json: HTTP ${res.status}`);
  return (await res.json()).filter((row) => !row.deleted_at);
}

const q = (s) => `'${String(s).trim().replaceAll("'", "''")}'`;
const values = (rows, cols) => rows.map((r) => `  (${cols(r).join(', ')})`).join(',\n');

const [provinces, districts, subdistricts] = await Promise.all(
  ['province', 'district', 'sub_district'].map(load),
);

const sql = `-- P17a: Thai administrative geography — the only source of province, district and subdistrict
-- names, of postcodes derived from a subdistrict, and of geography distractors (spec 2026-09-30
-- §5.2, decision D73). Generated by scripts/build-geo-migration.mjs from
-- kongvut/thai-province-data @ ${COMMIT} (MIT licence). Names repeat across the country, so every
-- lookup is scoped to its parent; the unique keys below hold that shape.

create table public.geo_regions (
  id smallint primary key,
  name_th text not null,
  name_en text not null
);

create table public.geo_provinces (
  id integer primary key,
  region_id smallint not null references public.geo_regions (id),
  name_th text not null unique,
  name_en text not null
);

create table public.geo_districts (
  id integer primary key,
  province_id integer not null references public.geo_provinces (id),
  name_th text not null,
  name_en text not null,
  prefix_th text not null,
  unique (province_id, name_th)
);

create table public.geo_subdistricts (
  id integer primary key,
  district_id integer not null references public.geo_districts (id),
  name_th text not null,
  name_en text not null,
  prefix_th text not null,
  postcode text not null check (postcode ~ '^[0-9]{5}$'),
  unique (district_id, name_th)
);
create index geo_subdistricts_postcode_idx on public.geo_subdistricts (postcode);

alter table public.geo_regions enable row level security;
alter table public.geo_provinces enable row level security;
alter table public.geo_districts enable row level security;
alter table public.geo_subdistricts enable row level security;

-- Reference data: any signed-in user reads it; only migrations write it (no write policy).
create policy "geo regions: signed-in users read" on public.geo_regions
  for select to authenticated using (true);
create policy "geo provinces: signed-in users read" on public.geo_provinces
  for select to authenticated using (true);
create policy "geo districts: signed-in users read" on public.geo_districts
  for select to authenticated using (true);
create policy "geo subdistricts: signed-in users read" on public.geo_subdistricts
  for select to authenticated using (true);

insert into public.geo_regions (id, name_th, name_en) values
${values(REGIONS, (r) => [r.id, q(r.th), q(r.en)])};

insert into public.geo_provinces (id, region_id, name_th, name_en) values
${values(provinces, (r) => [r.id, r.geography_id, q(r.name.th), q(r.name.en)])};

insert into public.geo_districts (id, province_id, name_th, name_en, prefix_th) values
${values(districts, (r) => [r.id, r.province_id, q(r.name.th), q(r.name.en), q(r.prefix.th)])};

insert into public.geo_subdistricts (id, district_id, name_th, name_en, prefix_th, postcode) values
${values(subdistricts, (r) => [
  r.id,
  r.district_id,
  q(r.name.th),
  q(r.name.en),
  q(r.prefix.th),
  q(String(r.zip_code).padStart(5, '0')),
])};
`;

writeFileSync(OUT, sql);
console.log(
  `wrote ${provinces.length} provinces, ${districts.length} districts, ${subdistricts.length} subdistricts`,
);
```

Add to `package.json` `scripts` (after `vector:smoke`):

```json
    "geo:migration": "node scripts/build-geo-migration.mjs"
```

- [ ] **Step 4: Generate the migration**

Run: `pnpm geo:migration`
Expected: `wrote 77 provinces, 930 districts, 7436 subdistricts`, and the file `supabase/migrations/20261001010000_thai_geography.sql` exists (about 0.7 MB).

- [ ] **Step 5: Apply it and regenerate types**

Run: `pnpm db:reset && pnpm db:types`
Expected: reset finishes without error; `lib/db/database.types.ts` now contains `geo_subdistricts`.

- [ ] **Step 6: Run the test to see it pass**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/geo.test.ts`
Expected: 4 passed.

- [ ] **Step 7: Commit**

```bash
git add scripts/build-geo-migration.mjs supabase/migrations/20261001010000_thai_geography.sql package.json lib/db/database.types.ts tests/integration/geo.test.ts
git commit -m "feat(facts): Thai administrative geography as reference data (P17a, D73)"
```

---

## Task 2: Printed-address parser

**Files:**
- Create: `lib/domain/geo/address.ts`
- Test: `tests/unit/domain/geo-address.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/domain/geo-address.test.ts
import { describe, expect, it } from 'vitest';
import { normalizePlaceName, parseThaiAddress } from '@/lib/domain/geo/address';

describe('parseThaiAddress', () => {
  it('reads a DBD-style provincial address', () => {
    expect(
      parseThaiAddress('เลขที่ 87 หมู่ที่ 9 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด 45110'),
    ).toEqual({
      house_no: '87',
      moo: '9',
      road: null,
      subdistrict: 'หนองใหญ่',
      district: 'โพนทอง',
      province: 'ร้อยเอ็ด',
      postcode: '45110',
    });
  });

  it('reads the abbreviated markers', () => {
    expect(parseThaiAddress('87 ม.9 ต.หนองใหญ่ อ.โพนทอง จ.ร้อยเอ็ด')).toEqual({
      house_no: '87',
      moo: '9',
      road: null,
      subdistrict: 'หนองใหญ่',
      district: 'โพนทอง',
      province: 'ร้อยเอ็ด',
      postcode: null,
    });
  });

  it('reads a Bangkok address with แขวง/เขต, a road with a number and "กรุงเทพฯ"', () => {
    expect(
      parseThaiAddress('เลขที่ 999/9 ถนนพระราม 4 แขวงสุริยวงศ์ เขตบางรัก กรุงเทพฯ 10500'),
    ).toEqual({
      house_no: '999/9',
      moo: null,
      road: 'พระราม 4',
      subdistrict: 'สุริยวงศ์',
      district: 'บางรัก',
      province: 'กรุงเทพมหานคร',
      postcode: '10500',
    });
  });

  it('skips a soi without letting it into the road', () => {
    expect(
      parseThaiAddress(
        '99 ซอยสุขุมวิท 21 ถนนสุขุมวิท แขวงคลองเตยเหนือ เขตวัฒนา กรุงเทพมหานคร 10110',
      ),
    ).toMatchObject({
      house_no: '99',
      road: 'สุขุมวิท',
      subdistrict: 'คลองเตยเหนือ',
      district: 'วัฒนา',
      province: 'กรุงเทพมหานคร',
      postcode: '10110',
    });
  });

  it('returns nothing for a blank address', () => {
    expect(parseThaiAddress('   ')).toEqual({
      house_no: null,
      moo: null,
      road: null,
      subdistrict: null,
      district: null,
      province: null,
      postcode: null,
    });
  });
});

describe('normalizePlaceName', () => {
  it('drops spaces and a stray prefix, and spells Bangkok one way', () => {
    expect(normalizePlaceName('เมือง ร้อยเอ็ด')).toBe('เมืองร้อยเอ็ด');
    expect(normalizePlaceName('อำเภอโพนทอง')).toBe('โพนทอง');
    expect(normalizePlaceName('กรุงเทพฯ')).toBe('กรุงเทพมหานคร');
    expect(normalizePlaceName('กทม.')).toBe('กรุงเทพมหานคร');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/geo-address.test.ts`
Expected: FAIL — cannot resolve `@/lib/domain/geo/address`.

- [ ] **Step 3: Implement the parser**

```ts
// lib/domain/geo/address.ts
/**
 * Splits a printed Thai registered address into its parts (spec 2026-09-30 §5.2, D73). Purely
 * textual: the parts are names as printed; `resolve.ts` checks them against the geography tables
 * and nothing here guesses a missing part.
 */
export type ParsedAddress = {
  house_no: string | null;
  moo: string | null;
  road: string | null;
  subdistrict: string | null;
  district: string | null;
  province: string | null;
  postcode: string | null;
};

type Part = 'moo' | 'road' | 'subdistrict' | 'district' | 'province' | 'skip';

/** Printed markers, longest first so "หมู่ที่" wins over "หมู่" and "ตำบล" over "ต.". */
const MARKERS: [string, Part][] = [
  ['หมู่ที่', 'moo'],
  ['จังหวัด', 'province'],
  ['อำเภอ', 'district'],
  ['ตำบล', 'subdistrict'],
  ['แขวง', 'subdistrict'],
  ['หมู่', 'moo'],
  ['ถนน', 'road'],
  ['ซอย', 'skip'],
  ['เขต', 'district'],
  ['ม.', 'moo'],
  ['ถ.', 'road'],
  ['ซ.', 'skip'],
  ['ต.', 'subdistrict'],
  ['อ.', 'district'],
  ['จ.', 'province'],
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A marker counts only at the start or after a space or comma, never inside a word. */
const MARKER_RE = new RegExp(`(^|[\\s,])(${MARKERS.map(([m]) => escape(m)).join('|')})`, 'g');
const PART_OF = new Map(MARKERS);

const BANGKOK_NAMES = /^(กรุงเทพมหานคร|กรุงเทพฯ|กรุงเทพ|กทม\.?)$/;
/** Bangkok is printed without "จังหวัด"; give it one so it parses like any province. */
const BANGKOK_IN_TEXT = /(^|[\s,])(กรุงเทพมหานคร|กรุงเทพฯ|กรุงเทพ|กทม\.?)(?=$|[\s,\d])/;
const POSTCODE_RE = /(^|[\s,])(\d{5})(?=$|[\s,])/g;
const HOUSE_RE = /^\s*(?:เลขที่\s*)?(\d+(?:\/\d+)*(?:-\d+)?)/;

const EMPTY: ParsedAddress = {
  house_no: null,
  moo: null,
  road: null,
  subdistrict: null,
  district: null,
  province: null,
  postcode: null,
};

export function normalizePlaceName(name: string): string {
  const compact = name
    .replace(/\s+/g, '')
    .replace(/^(จังหวัด|อำเภอ|เขต|ตำบล|แขวง|จ\.|อ\.|ต\.)/, '');
  return BANGKOK_NAMES.test(compact) ? 'กรุงเทพมหานคร' : compact;
}

function clean(value: string): string | null {
  const v = value.replace(/\s+/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '');
  return v.length > 0 ? v : null;
}

export function parseThaiAddress(printed: string): ParsedAddress {
  let text = printed.replace(/\s+/g, ' ').trim();
  if (!text) return { ...EMPTY };
  const result: ParsedAddress = { ...EMPTY };

  const house = HOUSE_RE.exec(text);
  if (house) result.house_no = house[1];

  // The postcode is the last standalone five-digit number after the house number.
  const houseEnd = house ? house[0].length : 0;
  const postcodes = [...text.matchAll(POSTCODE_RE)].filter((m) => (m.index ?? 0) >= houseEnd);
  const postcode = postcodes.at(-1);
  if (postcode) {
    result.postcode = postcode[2];
    const at = (postcode.index ?? 0) + postcode[1].length;
    text = `${text.slice(0, at)} ${text.slice(at + 5)}`;
  }

  text = text.replace(BANGKOK_IN_TEXT, '$1จังหวัดกรุงเทพมหานคร');

  const hits = [...text.matchAll(MARKER_RE)].map((m) => {
    const start = (m.index ?? 0) + m[1].length;
    return { part: PART_OF.get(m[2]) ?? 'skip', start, end: start + m[2].length };
  });
  hits.forEach((hit, i) => {
    if (hit.part === 'skip') return;
    const raw = text.slice(hit.end, hits[i + 1]?.start ?? text.length);
    const value = clean(raw);
    if (!value || result[hit.part] !== null) return;
    if (hit.part === 'moo') {
      result.moo = /\d+/.exec(value)?.[0] ?? null;
    } else if (hit.part === 'province') {
      result.province = normalizePlaceName(value);
    } else {
      result[hit.part] = value;
    }
  });
  return result;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/geo-address.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/geo/address.ts tests/unit/domain/geo-address.test.ts
git commit -m "feat(facts): split a printed Thai address into its parts (P17a)"
```

---

## Task 3: Address resolver and the geography lookup

**Files:**
- Create: `lib/domain/geo/types.ts`, `lib/domain/geo/resolve.ts`, `lib/db/geo.ts`
- Test: `tests/unit/domain/geo-resolve.test.ts`; modify `tests/integration/geo.test.ts`

- [ ] **Step 1: Write the failing unit test**

```ts
// tests/unit/domain/geo-resolve.test.ts
import { describe, expect, it } from 'vitest';
import { resolveRegisteredAddress } from '@/lib/domain/geo/resolve';
import type { GeoLookup } from '@/lib/domain/geo/types';

/** A tiny slice of the country, shaped like the tables. */
function memoryLookup(): GeoLookup {
  const provinces = [
    { id: 33, regionId: 3, nameTh: 'ร้อยเอ็ด', nameEn: 'Roi Et' },
    { id: 1, regionId: 2, nameTh: 'กรุงเทพมหานคร', nameEn: 'Bangkok' },
  ];
  const districts = [
    { id: 4507, provinceId: 33, nameTh: 'โพนทอง', nameEn: 'Phon Thong', prefixTh: 'อำเภอ' },
    { id: 1004, provinceId: 1, nameTh: 'บางรัก', nameEn: 'Bang Rak', prefixTh: 'เขต' },
  ];
  const subdistricts = [
    {
      id: 450705,
      districtId: 4507,
      nameTh: 'หนองใหญ่',
      nameEn: 'Nong Yai',
      prefixTh: 'ตำบล',
      postcode: '45110',
    },
    {
      id: 100403,
      districtId: 1004,
      nameTh: 'สุริยวงศ์',
      nameEn: 'Suriyawong',
      prefixTh: 'แขวง',
      postcode: '10500',
    },
  ];
  return {
    provinceByName: async (n) => provinces.find((p) => p.nameTh === n) ?? null,
    districtByName: async (pid, n) =>
      districts.find((d) => d.provinceId === pid && d.nameTh === n) ?? null,
    subdistrictByName: async (did, n) =>
      subdistricts.find((s) => s.districtId === did && s.nameTh === n) ?? null,
  };
}

const ROI_ET = 'เลขที่ 87 หมู่ที่ 9 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด';

describe('resolveRegisteredAddress', () => {
  it('resolves to the subdistrict and takes the postcode from geography when none is printed', async () => {
    const a = await resolveRegisteredAddress(ROI_ET, memoryLookup());
    expect(a).toMatchObject({
      status: 'resolved',
      issues: [],
      house_no: '87',
      moo: '9',
      subdistrict: 'หนองใหญ่',
      district: 'โพนทอง',
      province: 'ร้อยเอ็ด',
      province_id: 33,
      district_id: 4507,
      subdistrict_id: 450705,
      postcode: '45110',
      postcode_source: 'geography',
    });
  });

  it('keeps a printed postcode and flags one that disagrees', async () => {
    const ok = await resolveRegisteredAddress(`${ROI_ET} 45110`, memoryLookup());
    expect(ok).toMatchObject({ status: 'resolved', postcode_source: 'printed' });
    const bad = await resolveRegisteredAddress(`${ROI_ET} 45000`, memoryLookup());
    expect(bad).toMatchObject({ status: 'partial', issues: ['postcode_mismatch'] });
  });

  it('reports a district it cannot find instead of guessing, keeping the province', async () => {
    const a = await resolveRegisteredAddress(
      'เลขที่ 1 ตำบลหนองใหญ่ อำเภอไม่มีจริง จังหวัดร้อยเอ็ด',
      memoryLookup(),
    );
    expect(a).toMatchObject({
      status: 'partial',
      issues: ['district_not_found'],
      province_id: 33,
      district_id: null,
    });
  });

  it('is unresolved without an address or a known province', async () => {
    expect(await resolveRegisteredAddress(null, memoryLookup())).toMatchObject({
      status: 'unresolved',
      issues: ['no_address'],
    });
    expect(
      await resolveRegisteredAddress('เลขที่ 1 จังหวัดไม่มีจริง', memoryLookup()),
    ).toMatchObject({ status: 'unresolved', issues: ['province_not_found'] });
  });

  it('resolves Bangkok through แขวง and เขต', async () => {
    const a = await resolveRegisteredAddress(
      'เลขที่ 999/9 ถนนพระราม 4 แขวงสุริยวงศ์ เขตบางรัก กรุงเทพฯ',
      memoryLookup(),
    );
    expect(a).toMatchObject({ status: 'resolved', postcode: '10500', road: 'พระราม 4' });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/geo-resolve.test.ts`
Expected: FAIL — cannot resolve `@/lib/domain/geo/resolve`.

- [ ] **Step 3: Implement types and resolver**

```ts
// lib/domain/geo/types.ts
export type GeoProvince = { id: number; regionId: number; nameTh: string; nameEn: string };
export type GeoDistrict = {
  id: number;
  provinceId: number;
  nameTh: string;
  nameEn: string;
  prefixTh: string;
};
export type GeoSubdistrict = {
  id: number;
  districtId: number;
  nameTh: string;
  nameEn: string;
  prefixTh: string;
  postcode: string;
};

/** Name lookups scoped to the parent: 795 subdistrict names occur more than once in Thailand. */
export interface GeoLookup {
  provinceByName(nameTh: string): Promise<GeoProvince | null>;
  districtByName(provinceId: number, nameTh: string): Promise<GeoDistrict | null>;
  subdistrictByName(districtId: number, nameTh: string): Promise<GeoSubdistrict | null>;
}
```

```ts
// lib/domain/geo/resolve.ts
import { z } from 'zod';
import { normalizePlaceName, parseThaiAddress } from './address';
import type { GeoLookup } from './types';

export const ADDRESS_ISSUES = [
  'no_address',
  'province_not_found',
  'district_not_found',
  'subdistrict_not_found',
  'postcode_mismatch',
] as const;
export type AddressIssue = (typeof ADDRESS_ISSUES)[number];

/** Stored under `dbd_records.structured_data.address` (spec §5.2). */
export const registeredAddressSchema = z.object({
  full: z.string(),
  house_no: z.string().nullable(),
  moo: z.string().nullable(),
  road: z.string().nullable(),
  subdistrict: z.string().nullable(),
  district: z.string().nullable(),
  province: z.string().nullable(),
  postcode: z.string().nullable(),
  province_id: z.number().int().nullable(),
  district_id: z.number().int().nullable(),
  subdistrict_id: z.number().int().nullable(),
  postcode_source: z.enum(['printed', 'geography']).nullable(),
  status: z.enum(['resolved', 'partial', 'unresolved']),
  issues: z.array(z.enum(ADDRESS_ISSUES)),
});
export type RegisteredAddress = z.output<typeof registeredAddressSchema>;

/**
 * Resolves the printed address top-down against the geography tables. A part that does not
 * resolve is reported as an issue; nothing is guessed (D73). A postcode is taken from the
 * subdistrict only when none is printed, and marked so.
 */
export async function resolveRegisteredAddress(
  printed: string | null | undefined,
  lookup: GeoLookup,
): Promise<RegisteredAddress> {
  const full = printed?.replace(/\s+/g, ' ').trim() ?? '';
  const parsed = parseThaiAddress(full);
  const base: RegisteredAddress = {
    full,
    ...parsed,
    province_id: null,
    district_id: null,
    subdistrict_id: null,
    postcode_source: parsed.postcode ? 'printed' : null,
    status: 'unresolved',
    issues: [],
  };
  if (!full) return { ...base, issues: ['no_address'] };

  const province = parsed.province
    ? await lookup.provinceByName(normalizePlaceName(parsed.province))
    : null;
  if (!province) return { ...base, issues: ['province_not_found'] };
  const withProvince = { ...base, province: province.nameTh, province_id: province.id };

  const district = parsed.district
    ? await lookup.districtByName(province.id, normalizePlaceName(parsed.district))
    : null;
  if (!district) return { ...withProvince, status: 'partial', issues: ['district_not_found'] };
  const withDistrict = { ...withProvince, district: district.nameTh, district_id: district.id };

  const subdistrict = parsed.subdistrict
    ? await lookup.subdistrictByName(district.id, normalizePlaceName(parsed.subdistrict))
    : null;
  if (!subdistrict) {
    return { ...withDistrict, status: 'partial', issues: ['subdistrict_not_found'] };
  }

  const issues: AddressIssue[] = [];
  if (parsed.postcode && parsed.postcode !== subdistrict.postcode) issues.push('postcode_mismatch');
  return {
    ...withDistrict,
    subdistrict: subdistrict.nameTh,
    subdistrict_id: subdistrict.id,
    postcode: parsed.postcode ?? subdistrict.postcode,
    postcode_source: parsed.postcode ? 'printed' : 'geography',
    status: issues.length === 0 ? 'resolved' : 'partial',
    issues,
  };
}
```

- [ ] **Step 4: Run the unit test to see it pass**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/geo-resolve.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Add the database lookup**

```ts
// lib/db/geo.ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GeoLookup } from '@/lib/domain/geo/types';
import type { Database } from './database.types';

type Db = SupabaseClient<Database>;

/** The geography tables as a `GeoLookup`; any signed-in client or the service role may read them. */
export function geoLookup(db: Db): GeoLookup {
  return {
    async provinceByName(nameTh) {
      const { data, error } = await db
        .from('geo_provinces')
        .select('id, region_id, name_th, name_en')
        .eq('name_th', nameTh)
        .maybeSingle();
      if (error) throw error;
      return data
        ? { id: data.id, regionId: data.region_id, nameTh: data.name_th, nameEn: data.name_en }
        : null;
    },
    async districtByName(provinceId, nameTh) {
      const { data, error } = await db
        .from('geo_districts')
        .select('id, province_id, name_th, name_en, prefix_th')
        .eq('province_id', provinceId)
        .eq('name_th', nameTh)
        .maybeSingle();
      if (error) throw error;
      return data
        ? {
            id: data.id,
            provinceId: data.province_id,
            nameTh: data.name_th,
            nameEn: data.name_en,
            prefixTh: data.prefix_th,
          }
        : null;
    },
    async subdistrictByName(districtId, nameTh) {
      const { data, error } = await db
        .from('geo_subdistricts')
        .select('id, district_id, name_th, name_en, prefix_th, postcode')
        .eq('district_id', districtId)
        .eq('name_th', nameTh)
        .maybeSingle();
      if (error) throw error;
      return data
        ? {
            id: data.id,
            districtId: data.district_id,
            nameTh: data.name_th,
            nameEn: data.name_en,
            prefixTh: data.prefix_th,
            postcode: data.postcode,
          }
        : null;
    },
  };
}
```

Append to `tests/integration/geo.test.ts` (and add the two imports at the top of the file):

```ts
import { geoLookup } from '@/lib/db/geo';
import { resolveRegisteredAddress } from '@/lib/domain/geo/resolve';

describe('resolving against the real tables', () => {
  it('resolves provincial and Bangkok addresses to the dataset postcodes', async () => {
    const lookup = geoLookup(svc);
    const roiEt = await resolveRegisteredAddress(
      'เลขที่ 87 หมู่ที่ 9 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด',
      lookup,
    );
    expect(roiEt).toMatchObject({ status: 'resolved', postcode: '45110' });
    const bangkok = await resolveRegisteredAddress(
      '99 ซอยสุขุมวิท 21 ถนนสุขุมวิท แขวงคลองเตยเหนือ เขตวัฒนา กรุงเทพมหานคร',
      lookup,
    );
    expect(bangkok).toMatchObject({ status: 'resolved', postcode: '10110' });
  });
});
```

- [ ] **Step 6: Run both suites**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/geo.test.ts`
Expected: 5 passed.

- [ ] **Step 7: Commit**

```bash
git add lib/domain/geo lib/db/geo.ts tests/unit/domain/geo-resolve.test.ts tests/integration/geo.test.ts
git commit -m "feat(facts): resolve the registered address against Thai geography (P17a, D73)"
```

---

## Task 4: Structured data carries the address and the category

`readStructuredData` returns only the keys it knows, and every writer spreads its result back
(`{ ...stored, interview }`). A key it does not return is erased by the next save — so the new
keys go in here, before anything writes them.

**Files:**
- Create: `lib/domain/business-category.ts`
- Modify: `lib/domain/dbd-profile.ts`
- Test: `tests/unit/domain/dbd-profile.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/domain/dbd-profile.test.ts
import { describe, expect, it } from 'vitest';
import { categoryInputHash } from '@/lib/domain/business-category';
import { readStructuredData } from '@/lib/domain/dbd-profile';

const address = {
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
const category = {
  key: 'clothing_fashion',
  candidate_key: null,
  confidence: 0.95,
  source: 'auto',
  status: 'mapped',
  model: null,
  input_hash: 'abcd1234',
  error: null,
  decided_at: '2026-09-30T00:00:00.000Z',
};

describe('readStructuredData', () => {
  it('keeps the derived address and category so a save spreading it back keeps them', () => {
    const read = readStructuredData({ address, category, interview: {} });
    expect(read.address).toEqual(address);
    expect(read.category).toEqual(category);
    const resaved = readStructuredData({ ...read, interview: { nature_of_business: 'x' } });
    expect(resaved.address).toEqual(address);
    expect(resaved.category).toEqual(category);
  });

  it('reads a malformed address or category as absent without losing the rest', () => {
    const read = readStructuredData({
      address: { full: 1 },
      category: { status: 'maybe' },
      interview: { nature_of_business: 'ขายเสื้อผ้า' },
    });
    expect(read.address).toBeNull();
    expect(read.category).toBeNull();
    expect(read.interview?.nature_of_business).toBe('ขายเสื้อผ้า');
  });

  it('reads an empty column with neither', () => {
    expect(readStructuredData(null)).toMatchObject({ address: null, category: null });
  });
});

describe('categoryInputHash', () => {
  it('changes with the business words and ignores spacing', () => {
    const a = categoryInputHash('ขายเสื้อผ้า', 'เสื้อสตรี');
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(categoryInputHash('ขายเสื้อผ้า ', ' เสื้อสตรี')).toBe(a);
    expect(categoryInputHash('ขายรองเท้า', 'เสื้อสตรี')).not.toBe(a);
  });

  it('has nothing to hash without a nature of business', () => {
    expect(categoryInputHash(null, 'เสื้อ')).toBeNull();
    expect(categoryInputHash('  ', null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/dbd-profile.test.ts`
Expected: FAIL — cannot resolve `@/lib/domain/business-category`.

- [ ] **Step 3: Create the category module (schema and hash only; decisions come in Task 8)**

```ts
// lib/domain/business-category.ts
import { z } from 'zod';

/**
 * The record's business category (spec 2026-09-30 §5.3, D73), stored under
 * `structured_data.category`. `key` is set only when mapped (automatically at or above the
 * confidence threshold, or by a person); `candidate_key` holds a low-confidence suggestion.
 * Pure — this module reaches client bundles through `dbd-profile.ts`.
 */
export const categoryAssignmentSchema = z.object({
  key: z.string().nullable(),
  candidate_key: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  source: z.enum(['auto', 'manual']).nullable(),
  status: z.enum(['mapped', 'needs_review', 'unmapped']),
  model: z.string().nullable(),
  input_hash: z.string().nullable(),
  error: z.string().nullable(),
  decided_at: z.string().nullable(),
});
export type CategoryAssignment = z.output<typeof categoryAssignmentSchema>;

/**
 * FNV-1a over the business text, so the category is re-mapped only when the words change.
 * Null without a nature of business: there is nothing to map.
 */
export function categoryInputHash(
  natureOfBusiness: string | null,
  productsServices: string | null,
): string | null {
  const nature = (natureOfBusiness ?? '').replace(/\s+/g, ' ').trim();
  if (!nature) return null;
  const products = (productsServices ?? '').replace(/\s+/g, ' ').trim();
  const text = `${nature}\n${products}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
```

- [ ] **Step 4: Teach `readStructuredData` the two keys**

In `lib/domain/dbd-profile.ts`, change the import block at the top to:

```ts
import { z } from 'zod';
import { interviewProfileSchema, type InterviewProfile } from './bank-interview';
import { categoryAssignmentSchema, type CategoryAssignment } from './business-category';
import { registeredAddressSchema, type RegisteredAddress } from './geo/resolve';
```

Replace the `StructuredData` type and `readStructuredData` with:

```ts
export type StructuredData = {
  business?: BusinessProfile;
  /** Bank-interview answers the DBD cannot supply (decision D39). */
  interview?: InterviewProfile;
  document_type?: string | null;
  provenance?: Provenance;
  /** The printed address resolved against Thai geography (P17a, D73). */
  address?: RegisteredAddress | null;
  /** The mapped business category (P17a, D73). */
  category?: CategoryAssignment | null;
};

/**
 * Reads the JSON column defensively: anything malformed counts as empty. Every writer spreads
 * this result back, so a key missing here is erased by the next save — new keys start here.
 */
export function readStructuredData(raw: unknown): StructuredData {
  if (!raw || typeof raw !== 'object') return { address: null, category: null };
  const data = raw as Record<string, unknown>;
  const business = businessProfileSchema.safeParse(data.business ?? {});
  const interview = interviewProfileSchema.safeParse(data.interview ?? {});
  const address = registeredAddressSchema.safeParse(data.address);
  const category = categoryAssignmentSchema.safeParse(data.category);
  return {
    business: business.success ? business.data : EMPTY_BUSINESS_PROFILE,
    interview: interview.success ? interview.data : interviewProfileSchema.parse({}),
    document_type: typeof data.document_type === 'string' ? data.document_type : null,
    provenance:
      data.provenance && typeof data.provenance === 'object' ? (data.provenance as Provenance) : {},
    address: address.success ? address.data : null,
    category: category.success ? category.data : null,
  };
}
```

- [ ] **Step 5: Run the test and the existing suite**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/dbd-profile.test.ts && pnpm test:unit && pnpm typecheck`
Expected: all pass. (If a unit test compared `readStructuredData(...)` to an exact object, add `address: null, category: null` to its expectation.)

- [ ] **Step 6: Commit**

```bash
git add lib/domain/business-category.ts lib/domain/dbd-profile.ts tests/unit/domain/dbd-profile.test.ts
git commit -m "feat(facts): structured data keeps the resolved address and the category (P17a)"
```

---

## Task 5: Expanded business profile and status facts

**Files:**
- Modify: `lib/domain/bank-interview.ts`
- Test: `tests/unit/domain/business-profile.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/domain/business-profile.test.ts
import { describe, expect, it } from 'vitest';
import {
  COMPANY_STATUS_FACTS,
  EMPTY_INTERVIEW_PROFILE,
  LEGACY_INTERVIEW_FIELDS,
  interviewProfileSchema,
  isShareholder,
} from '@/lib/domain/bank-interview';
import { EMPTY_BUSINESS_PROFILE } from '@/lib/domain/dbd-profile';

describe('the expanded business profile (spec §5.4)', () => {
  it('has every field the registry needs, empty by default', () => {
    for (const field of [
      'business_purpose',
      'main_clients',
      'client_origin',
      'main_suppliers',
      'monthly_revenue',
      'revenue_basis',
      'average_transaction',
      'monthly_transactions',
      'first_incoming_funds',
      'promptpay_qr_purpose',
      'customer_examples',
      'customer_profile',
      'transaction_details',
    ] as const) {
      expect(EMPTY_INTERVIEW_PROFILE[field]).toBeNull();
    }
    expect(interviewProfileSchema.parse({ main_clients: '   ' }).main_clients).toBeNull();
  });

  it('takes status facts as yes or no, blank as unset, and refuses anything else', () => {
    expect(COMPANY_STATUS_FACTS).toEqual([
      'operations_started',
      'has_existing_customers',
      'has_completed_transactions',
      'has_regular_suppliers',
    ]);
    const p = interviewProfileSchema.parse({ operations_started: 'yes', has_existing_customers: '' });
    expect(p.operations_started).toBe('yes');
    expect(p.has_existing_customers).toBeNull();
    expect(interviewProfileSchema.safeParse({ operations_started: 'maybe' }).success).toBe(false);
  });

  it('keeps the earlier answers exactly as written', () => {
    expect(LEGACY_INTERVIEW_FIELDS).toEqual([
      'monthly_volume',
      'clients_location',
      'suppliers_location',
      'operations_status',
    ]);
    expect(interviewProfileSchema.parse({ monthly_volume: 'ประมาณ 1 ล้าน' }).monthly_volume).toBe(
      'ประมาณ 1 ล้าน',
    );
  });
});

describe('isShareholder', () => {
  const business = {
    ...EMPTY_BUSINESS_PROFILE,
    shareholders: [{ name: 'นางสาว กุลธิดา พลเยี่ยม', nationality: null, shares: 90, percent: null }],
  };

  it('matches the role name against the list, ignoring spaces', () => {
    expect(isShareholder(business, 'นางสาวกุลธิดา พลเยี่ยม')).toBe(true);
    expect(isShareholder(business, 'นายสมชาย ใจดี')).toBe(false);
  });

  it('does not know without a name or a shareholder list', () => {
    expect(isShareholder(business, null)).toBeNull();
    expect(isShareholder(EMPTY_BUSINESS_PROFILE, 'นายสมชาย ใจดี')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/business-profile.test.ts`
Expected: FAIL — `COMPANY_STATUS_FACTS` is not exported.

- [ ] **Step 3: Extend the profile**

In `lib/domain/bank-interview.ts`, replace `interviewProfileSchema` (and the three lines after it) with:

```ts
/** A yes/no company fact the manager states; blank is "not stated yet" (spec §5.4). */
const yesNo = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.enum(['yes', 'no']).nullable().default(null),
);
export type YesNo = 'yes' | 'no';

/**
 * Status facts select alternate question wording (D73). They are stated before an evaluation and
 * never inferred during one; `learner_is_shareholder` is derived per assignment instead.
 */
export const COMPANY_STATUS_FACTS = [
  'operations_started',
  'has_existing_customers',
  'has_completed_transactions',
  'has_regular_suppliers',
] as const;
export type CompanyStatusFact = (typeof COMPANY_STATUS_FACTS)[number];

/** Answers written before P17a; kept as written and never remapped (spec §5.4). */
export const LEGACY_INTERVIEW_FIELDS = [
  'monthly_volume',
  'clients_location',
  'suppliers_location',
  'operations_status',
] as const;

export const interviewProfileSchema = z.object({
  contact_email: optionalEmail,
  contact_phone: optionalText,
  nature_of_business: optionalProse,
  products_services: optionalProse,
  account_purpose: optionalText,
  source_of_funds: optionalText,
  business_address: optionalText,
  // P17a (spec §5.4): the facts the 37 registry concepts read.
  business_purpose: optionalProse,
  main_clients: optionalProse,
  client_origin: optionalProse,
  main_suppliers: optionalProse,
  monthly_revenue: optionalText,
  revenue_basis: optionalProse,
  average_transaction: optionalText,
  monthly_transactions: optionalText,
  first_incoming_funds: optionalProse,
  promptpay_qr_purpose: optionalProse,
  customer_examples: optionalProse,
  customer_profile: optionalProse,
  transaction_details: optionalProse,
  operations_started: yesNo,
  has_existing_customers: yesNo,
  has_completed_transactions: yesNo,
  has_regular_suppliers: yesNo,
  // Earlier answers, kept as written.
  monthly_volume: optionalText,
  clients_location: optionalText,
  suppliers_location: optionalText,
  operations_status: optionalText,
});
export type InterviewProfile = z.output<typeof interviewProfileSchema>;
export type InterviewTextField = Exclude<keyof InterviewProfile, CompanyStatusFact>;
export const EMPTY_INTERVIEW_PROFILE: InterviewProfile = interviewProfileSchema.parse({});
export const INTERVIEW_FIELDS = Object.keys(EMPTY_INTERVIEW_PROFILE) as (keyof InterviewProfile)[];
```

Add after `myShareholding` at the end of the file:

```ts
/**
 * Whether the learner holds shares, by the same name match as `myShareholding`; null when there
 * is no role name or no shareholder list to match against (spec §7.2).
 */
export function isShareholder(
  business: BusinessProfile | null,
  holderName: string | null,
): boolean | null {
  if (!business || !holderName?.trim() || business.shareholders.length === 0) return null;
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  return business.shareholders.some((s) => norm(s.name) === norm(holderName));
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/business-profile.test.ts && pnpm test:unit && pnpm typecheck`
Expected: all pass. `interview-form.tsx` still compiles (it renders every non-contact field as a text input until Task 13).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/bank-interview.ts tests/unit/domain/business-profile.test.ts
git commit -m "feat(facts): the business profile the registry needs, with status facts (P17a, D73)"
```

---

## Task 6: Business categories table and the draft dictionary

**Files:**
- Create: `supabase/migrations/20261001020000_business_categories.sql`
- Modify: `lib/db/database.types.ts` (regenerated)
- Test: `tests/integration/business-categories.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/business-categories.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  clientFor,
  createTestManager,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers';

const svc = adminClient();

/** Spec §5.3 (D73): an Owner-controlled dictionary; staff read it, only the Owner edits it. */
describe('business categories', () => {
  let owner: TestUser;
  let manager: TestUser;
  let learner: TestUser;
  const key = `test_${Date.now()}`;

  beforeAll(async () => {
    owner = await createTestUser('admin');
    manager = await createTestManager();
    learner = await createTestUser('learner');
  });
  afterAll(async () => {
    await svc.from('business_categories').delete().eq('key', key);
    for (const u of [learner, manager, owner]) await deleteTestUser(u.id);
  });

  it('ships a draft dictionary and the confidence threshold', async () => {
    const { count } = await svc
      .from('business_categories')
      .select('*', { count: 'exact', head: true })
      .eq('active', true);
    expect(count).toBeGreaterThanOrEqual(20);
    const { data } = await svc
      .from('policy_config')
      .select('value')
      .eq('key', 'business_category_min_confidence_percent')
      .single();
    expect(data!.value).toBe(85);
  });

  it('lets a manager read but never write', async () => {
    const asManager = await clientFor(manager);
    const { data } = await asManager.from('business_categories').select('key').limit(1);
    expect(data).toHaveLength(1);
    const insert = await asManager
      .from('business_categories')
      .insert({ key, label_th: 'ทดสอบ', label_en: 'Test', label_zh: '测试' });
    expect(insert.error?.code).toBe('42501');
    const update = await asManager
      .from('business_categories')
      .update({ label_en: 'Changed' })
      .eq('key', 'clothing_fashion')
      .select('key');
    expect(update.data ?? []).toEqual([]);
  });

  it('shows a learner nothing', async () => {
    const { data } = await (await clientFor(learner)).from('business_categories').select('key');
    expect(data).toEqual([]);
  });

  it('lets the Owner add and retire a category, audited as the Owner', async () => {
    const asOwner = await clientFor(owner);
    const insert = await asOwner
      .from('business_categories')
      .insert({ key, label_th: 'ทดสอบ', label_en: 'Test', label_zh: '测试', sort_order: 999 });
    expect(insert.error).toBeNull();
    const retire = await asOwner
      .from('business_categories')
      .update({ active: false })
      .eq('key', key)
      .select('active');
    expect(retire.data).toEqual([{ active: false }]);
    const { data: audit } = await svc
      .from('audit_logs')
      .select('actor_id, action')
      .eq('entity_id', key)
      .order('created_at');
    expect(audit?.map((a) => a.action)).toEqual([
      'business_categories.insert',
      'business_categories.update',
    ]);
    expect(audit?.every((a) => a.actor_id === owner.id)).toBe(true);
  });
});
```

> `audit_logs` has `created_at` and the trigger writes `action` as `<table>.<op>` with a lower-case op (`supabase/migrations/20260911000002_dbd_records.sql`).

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/business-categories.test.ts`
Expected: FAIL — `relation "public.business_categories" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20261001020000_business_categories.sql
-- P17a: the Owner's controlled business categories (spec 2026-09-30 §5.3, decision D73). They feed
-- BUSINESS_ALTERNATIVE distractors (P17d) and the automatic mapping of `nature_of_business`.
-- The seed is a draft for the Owner to edit in Admin → Business categories.

create table public.business_categories (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,59}$'),
  label_th text not null check (length(trim(label_th)) > 0),
  label_en text not null check (length(trim(label_en)) > 0),
  label_zh text not null check (length(trim(label_zh)) > 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger business_categories_set_updated_at
  before update on public.business_categories
  for each row execute function public.set_updated_at();

create trigger business_categories_audit
  after insert or update or delete on public.business_categories
  for each row execute function public.audit_row_change();

alter table public.business_categories enable row level security;

-- Staff read the dictionary; only the Owner edits it, through their own session so the audit
-- names them (D30). Nothing deletes a key: a category is retired by switching it off, because
-- stored mappings and future questions refer to it.
create policy "business categories: staff read" on public.business_categories
  for select to authenticated using (public.is_staff());
create policy "business categories: owner inserts" on public.business_categories
  for insert to authenticated with check (public.is_admin());
create policy "business categories: owner updates" on public.business_categories
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.business_categories (key, label_th, label_en, label_zh, sort_order) values
  ('clothing_fashion', 'ค้าส่งและค้าปลีกเสื้อผ้าและเครื่องแต่งกาย', 'Clothing and apparel wholesale and retail', '服装批发与零售', 10),
  ('cosmetics_beauty', 'ค้าเครื่องสำอางและผลิตภัณฑ์ความงาม', 'Cosmetics and beauty products', '化妆品与美容产品', 20),
  ('food_beverage_trade', 'ค้าส่งและค้าปลีกอาหารและเครื่องดื่ม', 'Food and beverage wholesale and retail', '食品饮料批发零售', 30),
  ('restaurant_catering', 'ร้านอาหารและบริการจัดเลี้ยง', 'Restaurants and catering', '餐饮与宴会服务', 40),
  ('electronics_it_equipment', 'ค้าเครื่องใช้ไฟฟ้า อุปกรณ์อิเล็กทรอนิกส์และคอมพิวเตอร์', 'Electronics, appliances and computer equipment', '电子电器与电脑设备', 50),
  ('software_it_services', 'บริการซอฟต์แวร์และเทคโนโลยีสารสนเทศ', 'Software and IT services', '软件与信息技术服务', 60),
  ('construction_contracting', 'รับเหมาก่อสร้างและตกแต่ง', 'Construction and renovation contracting', '建筑与装修承包', 70),
  ('building_materials', 'ค้าวัสดุก่อสร้าง', 'Building materials trading', '建材贸易', 80),
  ('real_estate', 'พัฒนาและบริหารอสังหาริมทรัพย์', 'Real estate development and management', '房地产开发与管理', 90),
  ('logistics_transport', 'ขนส่งและโลจิสติกส์', 'Transport and logistics', '运输与物流', 100),
  ('import_export_general', 'นำเข้าและส่งออกสินค้าทั่วไป', 'General import and export trading', '一般进出口贸易', 110),
  ('agriculture_produce', 'ค้าผลผลิตและสินค้าเกษตร', 'Agricultural produce trading', '农产品贸易', 120),
  ('jewelry_gems_gold', 'ค้าอัญมณี เครื่องประดับและทองคำ', 'Jewellery, gems and gold', '珠宝、宝石与黄金', 130),
  ('auto_parts_vehicles', 'ค้ายานยนต์และอะไหล่', 'Vehicles and auto parts', '汽车与汽车零部件', 140),
  ('furniture_home', 'ค้าเฟอร์นิเจอร์และของใช้ในบ้าน', 'Furniture and household goods', '家具与家居用品', 150),
  ('health_medical', 'ค้าอุปกรณ์การแพทย์และผลิตภัณฑ์สุขภาพ', 'Medical supplies and health products', '医疗用品与健康产品', 160),
  ('tourism_travel', 'ท่องเที่ยวและบริการนำเที่ยว', 'Tourism and travel services', '旅游与导游服务', 170),
  ('education_training', 'การศึกษาและฝึกอบรม', 'Education and training', '教育与培训', 180),
  ('consulting_services', 'บริการที่ปรึกษาธุรกิจ', 'Business consulting services', '商业咨询服务', 190),
  ('marketing_advertising', 'การตลาด โฆษณาและสิ่งพิมพ์', 'Marketing, advertising and printing', '市场营销、广告与印刷', 200),
  ('cleaning_facility', 'บริการทำความสะอาดและดูแลอาคาร', 'Cleaning and facility services', '清洁与物业服务', 210),
  ('brokerage_agency', 'ตัวแทนและนายหน้าซื้อขายสินค้า', 'Trading agent and brokerage', '贸易代理与经纪', 220);

-- The automatic mapping is accepted at or above this confidence (percent); below it the
-- candidate waits for review. Seeded with the code default (lib/config/policy-defaults.ts).
insert into public.policy_config (key, value)
values ('business_category_min_confidence_percent', '85'::jsonb)
on conflict (key) do nothing;
```

- [ ] **Step 4: Apply, regenerate types, run the test**

Run: `pnpm db:reset && pnpm db:types && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/business-categories.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261001020000_business_categories.sql lib/db/database.types.ts tests/integration/business-categories.test.ts
git commit -m "feat(facts): the Owner's business-category dictionary with a draft seed (P17a, D73)"
```

---

## Task 7: The category mapper adapter

**Files:**
- Create: `lib/integrations/category-map/types.ts`, `index.ts`, `fake.ts`, `claude.ts`
- Modify: `app/api/health/route.ts`, `tests/integration/setup.ts`, `playwright.config.ts`, `.env.example`
- Test: `tests/unit/integrations/category-map.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/integrations/category-map.test.ts
import { describe, expect, it } from 'vitest';
import { resolveCategoryMapProvider } from '@/lib/integrations/category-map';
import { ClaudeCategoryMapper } from '@/lib/integrations/category-map/claude';
import { FakeCategoryMapper } from '@/lib/integrations/category-map/fake';

const categories = [
  {
    key: 'clothing_fashion',
    label_th: 'ค้าส่งและค้าปลีกเสื้อผ้าและเครื่องแต่งกาย',
    label_en: 'Clothing and apparel wholesale and retail',
  },
  {
    key: 'furniture_home',
    label_th: 'ค้าเฟอร์นิเจอร์และของใช้ในบ้าน',
    label_en: 'Furniture and household goods',
  },
];

describe('resolveCategoryMapProvider', () => {
  it('follows the same rule as every adapter', () => {
    expect(resolveCategoryMapProvider({ CATEGORY_MAP_PROVIDER: 'off' })).toBe('off');
    expect(resolveCategoryMapProvider({ ANTHROPIC_API_KEY: 'k' })).toBe('claude');
    expect(resolveCategoryMapProvider({ NODE_ENV: 'production' })).toBe('off');
    expect(resolveCategoryMapProvider({})).toBe('fake');
  });
});

describe('FakeCategoryMapper', () => {
  const fake = new FakeCategoryMapper();

  it('maps a clear description with high confidence', async () => {
    await expect(
      fake.map({ natureOfBusiness: 'ขายเสื้อผ้าออนไลน์', productsServices: null, categories }),
    ).resolves.toEqual({ key: 'clothing_fashion', confidence: 0.95 });
  });

  it('offers a weak match at low confidence', async () => {
    await expect(
      fake.map({ natureOfBusiness: 'ขายบ้าน', productsServices: null, categories }),
    ).resolves.toEqual({ key: 'furniture_home', confidence: 0.6 });
  });

  it('maps nothing it cannot recognise', async () => {
    await expect(
      fake.map({ natureOfBusiness: 'zzzz qqqq', productsServices: null, categories }),
    ).resolves.toEqual({ key: null, confidence: 0 });
  });
});

function stub(parsed: unknown) {
  const calls: unknown[] = [];
  const client = {
    messages: {
      stream: (params: unknown) => {
        calls.push(params);
        return { finalMessage: async () => ({ stop_reason: 'end_turn', parsed_output: parsed }) };
      },
    },
  };
  return { client: client as never, calls };
}

describe('ClaudeCategoryMapper', () => {
  it('sends the dictionary and the business text, and takes the chosen key', async () => {
    const { client, calls } = stub({ key: 'clothing_fashion', confidence: 0.91 });
    const mapper = new ClaudeCategoryMapper(client);
    const result = await mapper.map({
      natureOfBusiness: 'ขายเสื้อผ้า',
      productsServices: 'เสื้อสตรี',
      categories,
    });
    expect(result).toEqual({ key: 'clothing_fashion', confidence: 0.91 });
    const params = calls[0] as { model: string; messages: { content: string }[] };
    expect(params.model).toBe('claude-sonnet-5');
    expect(params.messages[0].content).toContain('furniture_home');
    expect(params.messages[0].content).toContain('ขายเสื้อผ้า');
  });

  it('reads "none" as no category', async () => {
    const { client } = stub({ key: 'none', confidence: 0.2 });
    await expect(
      new ClaudeCategoryMapper(client).map({
        natureOfBusiness: 'x',
        productsServices: null,
        categories,
      }),
    ).resolves.toEqual({ key: null, confidence: 0.2 });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/integrations/category-map.test.ts`
Expected: FAIL — cannot resolve `@/lib/integrations/category-map`.

- [ ] **Step 3: Implement the adapter**

```ts
// lib/integrations/category-map/types.ts
export type CategoryOption = { key: string; label_th: string; label_en: string };
export type CategoryMapInput = {
  natureOfBusiness: string;
  productsServices: string | null;
  categories: CategoryOption[];
};
/** `key` is one of the given keys or null; `confidence` is 0–1. */
export type CategoryMapResult = { key: string | null; confidence: number };

export interface CategoryMapper {
  readonly name: 'claude' | 'fake';
  /** Recorded on the stored decision; null for the fake. */
  readonly model: string | null;
  map(input: CategoryMapInput): Promise<CategoryMapResult>;
}
```

```ts
// lib/integrations/category-map/fake.ts
import type { CategoryMapInput, CategoryMapResult, CategoryMapper } from './types';

const compact = (s: string) => s.toLowerCase().replace(/\s+/g, '');

/** Longest common substring length; the strings are a few hundred characters at most. */
function commonRun(a: string, b: string): number {
  let best = 0;
  const prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : 0;
      if (prev[j] > best) best = prev[j];
      diag = up;
    }
  }
  return best;
}

/**
 * Deterministic stand-in for tests and local work: the longest shared run of characters with a
 * category label. Six or more is a confident match, four or five a weak one to review.
 */
export class FakeCategoryMapper implements CategoryMapper {
  readonly name = 'fake' as const;
  readonly model = null;

  async map(input: CategoryMapInput): Promise<CategoryMapResult> {
    const text = compact(`${input.natureOfBusiness} ${input.productsServices ?? ''}`);
    let best: { key: string | null; run: number } = { key: null, run: 0 };
    for (const c of input.categories) {
      const run = Math.max(commonRun(text, compact(c.label_th)), commonRun(text, compact(c.label_en)));
      if (run > best.run) best = { key: c.key, run };
    }
    if (best.run >= 6) return { key: best.key, confidence: 0.95 };
    if (best.run >= 4) return { key: best.key, confidence: 0.6 };
    return { key: null, confidence: 0 };
  }
}
```

```ts
// lib/integrations/category-map/claude.ts
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { CategoryMapInput, CategoryMapResult, CategoryMapper } from './types';

const MODEL = 'claude-sonnet-5';
const TIMEOUT_MS = 20_000;

const SYSTEM = `You classify what a Thai company actually does into exactly one category from a fixed list.
Rules:
- Answer only with a key from the list, or "none" when no category fits.
- confidence is your probability (0 to 1) that the key describes the company's main business.
- Judge only from the text given; never add facts that are not written.`;

/** Maps the manager's business text to one Owner-controlled category (spec §5.3, D73). */
export class ClaudeCategoryMapper implements CategoryMapper {
  readonly name = 'claude' as const;
  readonly model = MODEL;

  constructor(private readonly client: Anthropic = new Anthropic()) {}

  async map(input: CategoryMapInput): Promise<CategoryMapResult> {
    const keys = input.categories.map((c) => c.key);
    if (keys.length === 0) return { key: null, confidence: 0 };
    const schema = z.object({
      key: z.enum([...keys, 'none'] as [string, ...string[]]),
      confidence: z.number().min(0).max(1),
    });
    const list = input.categories.map((c) => `${c.key}: ${c.label_th} / ${c.label_en}`).join('\n');
    const response = await this.client.messages
      .stream(
        {
          model: MODEL,
          max_tokens: 200,
          system: SYSTEM,
          messages: [
            {
              role: 'user',
              content: `CATEGORIES:\n${list}\n\nNATURE OF BUSINESS:\n${input.natureOfBusiness}\n\nPRODUCTS OR SERVICES:\n${input.productsServices ?? '-'}`,
            },
          ],
          output_config: { format: zodOutputFormat(schema) },
        },
        { timeout: TIMEOUT_MS },
      )
      .finalMessage();
    const parsed = response.parsed_output as z.infer<typeof schema> | null;
    if (!parsed) throw new Error('The category mapper returned nothing');
    if (parsed.key === 'none' || !keys.includes(parsed.key)) {
      return { key: null, confidence: parsed.confidence };
    }
    return { key: parsed.key, confidence: parsed.confidence };
  }
}
```

```ts
// lib/integrations/category-map/index.ts
import 'server-only';
import { ClaudeCategoryMapper } from './claude';
import { FakeCategoryMapper } from './fake';
import type { CategoryMapper } from './types';

export type CategoryMapProvider = 'claude' | 'fake' | 'off';

/**
 * CATEGORY_MAP_PROVIDER=claude|fake|off. Default: claude when ANTHROPIC_API_KEY is set,
 * otherwise fake outside production and off in production.
 */
export function resolveCategoryMapProvider(
  env: Record<string, string | undefined> = process.env,
): CategoryMapProvider {
  const configured = env.CATEGORY_MAP_PROVIDER;
  if (configured === 'claude' || configured === 'fake' || configured === 'off') return configured;
  if (env.ANTHROPIC_API_KEY) return 'claude';
  return env.NODE_ENV === 'production' ? 'off' : 'fake';
}

export function getCategoryMapper(): CategoryMapper | null {
  switch (resolveCategoryMapProvider()) {
    case 'claude':
      return new ClaudeCategoryMapper();
    case 'fake':
      return new FakeCategoryMapper();
    case 'off':
      return null;
  }
}
```

- [ ] **Step 4: Report it in health and force the fake in both suites**

`app/api/health/route.ts` — add the import and the provider line:

```ts
import { resolveCategoryMapProvider } from '@/lib/integrations/category-map';
```

```ts
      vector: resolveVectorProvider(),
      categoryMap: resolveCategoryMapProvider(),
```

`tests/integration/setup.ts` — add `'CATEGORY_MAP_PROVIDER',` to the list of forced providers.

`playwright.config.ts` — add `CATEGORY_MAP_PROVIDER: 'fake',` to `webServer.env`.

`.env.example` — under the AI block add:

```
# Business-category mapping (P17a): claude | fake | off; defaults like EXTRACTION_PROVIDER
CATEGORY_MAP_PROVIDER=
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/integrations/category-map.test.ts && pnpm typecheck`
Expected: 6 passed; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add lib/integrations/category-map app/api/health/route.ts tests/integration/setup.ts playwright.config.ts .env.example tests/unit/integrations/category-map.test.ts
git commit -m "feat(facts): the business-category mapper behind CATEGORY_MAP_PROVIDER (P17a, D73)"
```

---

## Task 8: Category decisions, the threshold key, and `refreshDerivedFacts`

**Files:**
- Modify: `lib/domain/business-category.ts`, `lib/config/policy-defaults.ts`, `lib/config/policy-schema.ts`, `messages/{th,en,zh}.json`
- Create: `lib/db/business-categories.ts`, `lib/db/derived-facts.ts`
- Test: `tests/unit/domain/business-category.test.ts`, `tests/integration/derived-facts.test.ts`

- [ ] **Step 1: Write the failing unit test**

```ts
// tests/unit/domain/business-category.test.ts
import { describe, expect, it } from 'vitest';
import {
  decideCategory,
  failedCategory,
  manualCategory,
  needsRemap,
} from '@/lib/domain/business-category';

const at = '2026-09-30T00:00:00.000Z';
const active = new Set(['clothing_fashion', 'furniture_home']);

describe('decideCategory', () => {
  it('accepts a mapping at or above the threshold automatically', () => {
    expect(
      decideCategory({
        result: { key: 'clothing_fashion', confidence: 0.85 },
        activeKeys: active,
        minConfidencePercent: 85,
        model: 'claude-sonnet-5',
        inputHash: 'h1',
        at,
      }),
    ).toMatchObject({ status: 'mapped', key: 'clothing_fashion', source: 'auto', confidence: 0.85 });
  });

  it('keeps a weaker one as a candidate for review, never as the category', () => {
    expect(
      decideCategory({
        result: { key: 'furniture_home', confidence: 0.6 },
        activeKeys: active,
        minConfidencePercent: 85,
        model: null,
        inputHash: 'h1',
        at,
      }),
    ).toMatchObject({ status: 'needs_review', key: null, candidate_key: 'furniture_home' });
  });

  it('never takes a key that is not an active category', () => {
    expect(
      decideCategory({
        result: { key: 'retired_key', confidence: 0.99 },
        activeKeys: active,
        minConfidencePercent: 85,
        model: null,
        inputHash: 'h1',
        at,
      }),
    ).toMatchObject({ status: 'unmapped', key: null, candidate_key: null });
  });
});

describe('needsRemap', () => {
  it('maps when the business words change, and only then', () => {
    const manual = manualCategory('clothing_fashion', 'h1', at);
    expect(needsRemap(manual, 'h1')).toBe(false);
    expect(needsRemap(manual, 'h2')).toBe(true);
    expect(needsRemap(null, 'h1')).toBe(true);
  });

  it('resets to unmapped once the nature of business is emptied', () => {
    expect(needsRemap(manualCategory('clothing_fashion', 'h1', at), null)).toBe(true);
    expect(needsRemap(failedCategory('no_text', null, at), null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/business-category.test.ts`
Expected: FAIL — `decideCategory` is not exported.

- [ ] **Step 3: Add the decisions**

Append to `lib/domain/business-category.ts`:

```ts
/**
 * The mapper's answer as a stored decision (spec §5.3): accepted at or above the threshold,
 * kept as a candidate below it, discarded when the key is not an active category.
 */
export function decideCategory(input: {
  result: { key: string | null; confidence: number };
  activeKeys: ReadonlySet<string>;
  minConfidencePercent: number;
  model: string | null;
  inputHash: string;
  at: string;
}): CategoryAssignment {
  const { result } = input;
  const known = result.key !== null && input.activeKeys.has(result.key);
  const base = {
    confidence: result.confidence,
    source: 'auto' as const,
    model: input.model,
    input_hash: input.inputHash,
    error: null,
    decided_at: input.at,
  };
  if (!known) return { ...base, key: null, candidate_key: null, status: 'unmapped' };
  if (result.confidence * 100 >= input.minConfidencePercent) {
    return { ...base, key: result.key, candidate_key: null, status: 'mapped' };
  }
  return { ...base, key: null, candidate_key: result.key, status: 'needs_review' };
}

/** A person's choice; it holds until the business text changes. */
export function manualCategory(
  key: string,
  inputHash: string | null,
  at: string,
): CategoryAssignment {
  return {
    key,
    candidate_key: null,
    confidence: null,
    source: 'manual',
    status: 'mapped',
    model: null,
    input_hash: inputHash,
    error: null,
    decided_at: at,
  };
}

/** Nothing mapped, with the reason (`no_text`, `not_configured`, `no_categories`, or an error). */
export function failedCategory(
  error: string,
  inputHash: string | null,
  at: string,
): CategoryAssignment {
  return {
    key: null,
    candidate_key: null,
    confidence: null,
    source: null,
    status: 'unmapped',
    model: null,
    input_hash: inputHash,
    error,
    decided_at: at,
  };
}

/** Re-map when the business words changed since the stored decision, and only then. */
export function needsRemap(current: CategoryAssignment | null, inputHash: string | null): boolean {
  if (!current) return true;
  return current.input_hash !== inputHash;
}
```

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/business-category.test.ts`
Expected: 5 passed.

- [ ] **Step 4: Add the policy key**

`lib/config/policy-defaults.ts` — inside `POLICY_DEFAULTS`, after `appointment_holidays`:

```ts
  // P17a (spec §5.3): an automatic business-category mapping is accepted at or above this.
  business_category_min_confidence_percent: 85 as number,
```

`lib/config/policy-schema.ts` — inside `POLICY_FIELDS`, after `appointment_holidays`:

```ts
  business_category_min_confidence_percent: {
    control: { kind: 'number', min: 50, max: 100, nullable: false },
    schema: intRange(50, 100),
  },
```

Add under `admin.settings.keys` in each message file:

`messages/en.json`
```json
"business_category_min_confidence_percent": {
  "label": "Business category: minimum confidence to accept automatically (%)",
  "help": "At or above this, the mapped category is used without review; below it the suggestion waits for a manager or the Owner."
}
```
`messages/th.json`
```json
"business_category_min_confidence_percent": {
  "label": "หมวดธุรกิจ: ความมั่นใจขั้นต่ำที่ระบบยอมรับอัตโนมัติ (%)",
  "help": "หากความมั่นใจถึงค่านี้ ระบบใช้หมวดที่จับคู่ได้ทันที หากต่ำกว่า หมวดที่แนะนำจะรอผู้จัดการหรือเจ้าของตรวจสอบ"
}
```
`messages/zh.json`
```json
"business_category_min_confidence_percent": {
  "label": "业务类别：自动采用的最低置信度（%）",
  "help": "达到此值时直接采用匹配的类别；低于此值时，建议的类别需由经理或所有者审核。"
}
```

- [ ] **Step 5: Write the dictionary access**

```ts
// lib/db/business-categories.ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from './database.types';

type Db = SupabaseClient<Database>;
export type BusinessCategoryRow = Database['public']['Tables']['business_categories']['Row'];

const label = z.string().trim().min(1).max(200);
export const businessCategoryInputSchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{1,59}$/),
  label_th: label,
  label_en: label,
  label_zh: label,
  sort_order: z.coerce.number().int().min(0).max(10000).default(0),
  active: z.boolean().default(true),
});
export type BusinessCategoryInput = z.output<typeof businessCategoryInputSchema>;

/** Staff read the dictionary through their own session (RLS: `is_staff()`). */
export async function listBusinessCategories(
  db: Db,
  opts: { activeOnly?: boolean } = {},
): Promise<BusinessCategoryRow[]> {
  let query = db.from('business_categories').select('*').order('sort_order').order('key');
  if (opts.activeOnly) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/** The Owner's session only (RLS: `is_admin()`), so the audit names them. */
export async function createBusinessCategory(db: Db, input: BusinessCategoryInput): Promise<void> {
  const { error } = await db.from('business_categories').insert(input);
  if (error) throw error;
}

export async function updateBusinessCategory(
  db: Db,
  key: string,
  input: Omit<BusinessCategoryInput, 'key'>,
): Promise<void> {
  const { data, error } = await db
    .from('business_categories')
    .update(input)
    .eq('key', key)
    .select('key');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('not-found');
}
```

- [ ] **Step 6: Write the failing integration test for the refresh**

```ts
// tests/integration/derived-facts.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { refreshDerivedFacts, remapBusinessCategory, setBusinessCategory } from '@/lib/db/derived-facts';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import { FakeCategoryMapper } from '@/lib/integrations/category-map/fake';
import { adminClient, createTestUser, deleteTestUser, type TestUser } from './helpers';

const svc = adminClient();
const deps = { mapper: new FakeCategoryMapper(), minConfidencePercent: 85 };
const ROI_ET = 'เลขที่ 87 หมู่ที่ 9 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด';

async function stored(id: string) {
  const { data, error } = await svc.from('dbd_records').select('*').eq('id', id).single();
  if (error) throw error;
  return readStructuredData(data.structured_data);
}

async function setInterview(id: string, patch: Record<string, string | null>) {
  const current = await stored(id);
  const { error } = await svc
    .from('dbd_records')
    .update({ structured_data: { ...current, interview: { ...current.interview, ...patch } } as never })
    .eq('id', id);
  if (error) throw error;
}

describe('refreshDerivedFacts (spec §5.2–5.3)', () => {
  let owner: TestUser;
  let recordId: string;

  beforeAll(async () => {
    owner = await createTestUser('admin');
    const { data, error } = await svc
      .from('dbd_records')
      .insert({
        company_name_th: 'บริษัท ข้อเท็จจริง จำกัด',
        head_office_address: ROI_ET,
        created_by: owner.id,
        structured_data: { interview: { nature_of_business: 'ขายเสื้อผ้าออนไลน์' } } as never,
      })
      .select('id')
      .single();
    if (error) throw error;
    recordId = data.id;
  });
  afterAll(async () => {
    await svc.from('dbd_records').delete().eq('id', recordId);
    await deleteTestUser(owner.id);
  });

  it('derives the address and maps the category, then leaves them alone', async () => {
    expect(await refreshDerivedFacts(svc, recordId, deps)).toBe('updated');
    const s = await stored(recordId);
    expect(s.address).toMatchObject({ status: 'resolved', postcode: '45110' });
    expect(s.category).toMatchObject({ status: 'mapped', key: 'clothing_fashion', source: 'auto' });
    expect(await refreshDerivedFacts(svc, recordId, deps)).toBe('unchanged');
  });

  it('keeps both through a save that spreads the stored data back', async () => {
    await setInterview(recordId, { main_clients: 'ร้านค้าปลีกในร้อยเอ็ด' });
    const s = await stored(recordId);
    expect(s.address?.status).toBe('resolved');
    expect(s.category?.key).toBe('clothing_fashion');
  });

  it('re-derives the address when the printed address changes', async () => {
    await svc
      .from('dbd_records')
      .update({ head_office_address: 'เลขที่ 1 ตำบลหนองใหญ่ อำเภอไม่มีจริง จังหวัดร้อยเอ็ด' })
      .eq('id', recordId);
    await refreshDerivedFacts(svc, recordId, deps);
    expect((await stored(recordId)).address).toMatchObject({
      status: 'partial',
      issues: ['district_not_found'],
    });
    await svc.from('dbd_records').update({ head_office_address: ROI_ET }).eq('id', recordId);
    await refreshDerivedFacts(svc, recordId, deps);
  });

  it('holds a person’s choice until the business words change', async () => {
    await setBusinessCategory(svc, recordId, 'furniture_home');
    await refreshDerivedFacts(svc, recordId, deps);
    expect((await stored(recordId)).category).toMatchObject({
      key: 'furniture_home',
      source: 'manual',
    });
    await setInterview(recordId, { nature_of_business: 'ขายบ้าน' });
    await refreshDerivedFacts(svc, recordId, deps);
    expect((await stored(recordId)).category).toMatchObject({
      status: 'needs_review',
      candidate_key: 'furniture_home',
      key: null,
    });
  });

  it('refuses a category that is not in the dictionary', async () => {
    await expect(setBusinessCategory(svc, recordId, 'no_such_key')).rejects.toThrow(
      'unknown-category',
    );
  });

  it('records why nothing was mapped when no mapper is configured, and maps again on request', async () => {
    await setInterview(recordId, { nature_of_business: 'ขายเสื้อผ้าออนไลน์' });
    await refreshDerivedFacts(svc, recordId, { mapper: null, minConfidencePercent: 85 });
    expect((await stored(recordId)).category).toMatchObject({
      status: 'unmapped',
      error: 'not_configured',
    });
    await remapBusinessCategory(svc, recordId, deps);
    expect((await stored(recordId)).category).toMatchObject({ status: 'mapped' });
  });

  it('never lets a failing mapper cost the address or throw (D73: category is metadata)', async () => {
    const broken = {
      name: 'fake' as const,
      model: null,
      map: async () => {
        throw new Error('mapper down');
      },
    };
    const { data, error } = await svc
      .from('dbd_records')
      .insert({
        company_name_th: 'บริษัท ตัวจับคู่ล่ม จำกัด',
        head_office_address: ROI_ET,
        created_by: owner.id,
        structured_data: { interview: { nature_of_business: 'ขายเสื้อผ้าออนไลน์' } } as never,
      })
      .select('id')
      .single();
    if (error) throw error;
    try {
      await expect(
        refreshDerivedFacts(svc, data.id, { mapper: broken, minConfidencePercent: 85 }),
      ).resolves.toBe('updated');
      const s = await stored(data.id);
      expect(s.address).toMatchObject({ status: 'resolved', postcode: '45110' });
      expect(s.category).toMatchObject({ status: 'unmapped', error: 'mapper down' });
    } finally {
      await svc.from('dbd_records').delete().eq('id', data.id);
    }
  });
});
```

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/derived-facts.test.ts`
Expected: FAIL — cannot resolve `@/lib/db/derived-facts`.

- [ ] **Step 7: Implement the refresh**

```ts
// lib/db/derived-facts.ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPolicy } from '@/lib/config/policy';
import { EMPTY_INTERVIEW_PROFILE, type InterviewProfile } from '@/lib/domain/bank-interview';
import {
  categoryInputHash,
  decideCategory,
  failedCategory,
  manualCategory,
  needsRemap,
  type CategoryAssignment,
} from '@/lib/domain/business-category';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import { resolveRegisteredAddress } from '@/lib/domain/geo/resolve';
import { getCategoryMapper } from '@/lib/integrations/category-map';
import type { CategoryMapper } from '@/lib/integrations/category-map/types';
import { listBusinessCategories } from './business-categories';
import type { Database, Json } from './database.types';
import { getDbdRecord } from './dbd-records';
import { geoLookup } from './geo';

type Db = SupabaseClient<Database>;

export type DerivedFactsDeps = {
  mapper: CategoryMapper | null;
  /** Tests pass it; otherwise the policy key is read. */
  minConfidencePercent?: number;
  now?: () => Date;
};

const defaultDeps = (): DerivedFactsDeps => ({ mapper: getCategoryMapper() });

/**
 * Re-derives what the record's own words imply (spec §5.2–5.3): the structured address when the
 * printed address changed, the category when the business text changed. Written with a
 * compare-and-set on `updated_at`, so an edit landing meanwhile wins and the next save derives
 * again. A mapper failure never throws: the category is stored unmapped with the reason.
 */
export async function refreshDerivedFacts(
  db: Db,
  recordId: string,
  deps: DerivedFactsDeps = defaultDeps(),
): Promise<'updated' | 'unchanged' | 'not_found' | 'raced'> {
  const record = await getDbdRecord(db, recordId);
  if (!record) return 'not_found';
  const stored = readStructuredData(record.structured_data);
  const at = (deps.now?.() ?? new Date()).toISOString();
  let changed = false;

  const printed = record.head_office_address?.replace(/\s+/g, ' ').trim() ?? '';
  let address = stored.address ?? null;
  if (!address || address.full !== printed) {
    address = await resolveRegisteredAddress(printed, geoLookup(db));
    changed = true;
  }

  const interview = stored.interview ?? EMPTY_INTERVIEW_PROFILE;
  const hash = categoryInputHash(interview.nature_of_business, interview.products_services);
  let category = stored.category ?? null;
  if (needsRemap(category, hash)) {
    category =
      hash === null
        ? failedCategory('no_text', null, at)
        : await mapCategory(db, interview, hash, deps, at);
    changed = true;
  }

  if (!changed) return 'unchanged';
  const { data, error } = await db
    .from('dbd_records')
    .update({ structured_data: { ...stored, address, category } as unknown as Json })
    .eq('id', recordId)
    .eq('updated_at', record.updated_at)
    .select('id');
  if (error) throw error;
  return data && data.length > 0 ? 'updated' : 'raced';
}

async function mapCategory(
  db: Db,
  interview: InterviewProfile,
  hash: string,
  deps: DerivedFactsDeps,
  at: string,
): Promise<CategoryAssignment> {
  if (!deps.mapper) return failedCategory('not_configured', hash, at);
  try {
    const categories = await listBusinessCategories(db, { activeOnly: true });
    if (categories.length === 0) return failedCategory('no_categories', hash, at);
    const result = await deps.mapper.map({
      natureOfBusiness: interview.nature_of_business ?? '',
      productsServices: interview.products_services,
      categories: categories.map((c) => ({ key: c.key, label_th: c.label_th, label_en: c.label_en })),
    });
    const minConfidencePercent =
      deps.minConfidencePercent ?? (await getPolicy('business_category_min_confidence_percent'));
    return decideCategory({
      result,
      activeKeys: new Set(categories.map((c) => c.key)),
      minConfidencePercent,
      model: deps.mapper.model,
      inputHash: hash,
      at,
    });
  } catch (e) {
    return failedCategory(e instanceof Error ? e.message.slice(0, 300) : 'failed', hash, at);
  }
}

/** A person picks the category (staff, through RLS on the record); it holds until the text changes. */
export async function setBusinessCategory(
  db: Db,
  recordId: string,
  key: string,
  now: Date = new Date(),
): Promise<void> {
  const record = await getDbdRecord(db, recordId);
  if (!record) throw new Error('not-found');
  const categories = await listBusinessCategories(db, { activeOnly: true });
  if (!categories.some((c) => c.key === key)) throw new Error('unknown-category');
  const stored = readStructuredData(record.structured_data);
  const interview = stored.interview ?? EMPTY_INTERVIEW_PROFILE;
  const category = manualCategory(
    key,
    categoryInputHash(interview.nature_of_business, interview.products_services),
    now.toISOString(),
  );
  const { error } = await db
    .from('dbd_records')
    .update({ structured_data: { ...stored, category } as unknown as Json })
    .eq('id', recordId);
  if (error) throw error;
}

/** "Map again": forget the stored decision and derive afresh. */
export async function remapBusinessCategory(
  db: Db,
  recordId: string,
  deps: DerivedFactsDeps = defaultDeps(),
): Promise<void> {
  const record = await getDbdRecord(db, recordId);
  if (!record) throw new Error('not-found');
  const stored = readStructuredData(record.structured_data);
  const { error } = await db
    .from('dbd_records')
    .update({ structured_data: { ...stored, category: null } as unknown as Json })
    .eq('id', recordId);
  if (error) throw error;
  await refreshDerivedFacts(db, recordId, deps);
}
```

- [ ] **Step 8: Run the tests**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/derived-facts.test.ts && pnpm test:unit && pnpm typecheck`
Expected: 7 passed; unit suite (including the messages and policy-schema tests) passes; typecheck clean.

- [ ] **Step 9: Commit**

```bash
git add lib/domain/business-category.ts lib/config lib/db/business-categories.ts lib/db/derived-facts.ts messages tests/unit/domain/business-category.test.ts tests/integration/derived-facts.test.ts
git commit -m "feat(facts): derive the address and map the category after every change (P17a, D73)"
```

---

## Task 9: Refresh after saves, extraction and transcripts; category actions

**Files:**
- Modify: `app/[locale]/(admin)/admin/dbd-records/actions.ts`, `app/api/cron/index/route.ts`

- [ ] **Step 1: Refresh after the record and answers saves**

In `app/[locale]/(admin)/admin/dbd-records/actions.ts`, add the import:

```ts
import {
  refreshDerivedFacts,
  remapBusinessCategory,
  setBusinessCategory,
} from '@/lib/db/derived-facts';
```

Add this helper next to `errorMessage`:

```ts
/** A save has succeeded; a failure to derive must not undo it (the next save derives again). */
async function deriveAfterSave(db: Awaited<ReturnType<typeof createSupabaseServerClient>>, id: string) {
  await refreshDerivedFacts(db, id).catch((e) => console.error('derived facts', id, e));
}
```

In `saveDbdRecordAction`, after `await updateDbdRecord(db, id, parsed.data, {...});` add:

```ts
      await deriveAfterSave(db, id);
```

and after `createdId = row.id;` add:

```ts
    await deriveAfterSave(db, row.id);
```

In `saveInterviewAnswersAction`, after `if (error) throw error;` add:

```ts
    await deriveAfterSave(db, id);
```

- [ ] **Step 2: Add the two category actions (end of the file)**

```ts
/** A person chooses the category (spec §5.3); it holds until the business text changes. */
export async function setBusinessCategoryAction(
  _prev: ToolState,
  formData: FormData,
): Promise<ToolState> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  const key = String(formData.get('categoryKey') ?? '');
  await requireStaff(locale);
  if (!key) return { ok: false, error: 'choose-category' };
  const db = await createSupabaseServerClient();
  try {
    await setBusinessCategory(db, id, key);
    revalidatePath(`/${locale}/admin/dbd-records/${id}`);
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** "Map again": forget the stored decision and map afresh. */
export async function remapBusinessCategoryAction(
  _prev: ToolState,
  formData: FormData,
): Promise<ToolState> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  await requireStaff(locale);
  const db = await createSupabaseServerClient();
  try {
    await remapBusinessCategory(db, id);
    revalidatePath(`/${locale}/admin/dbd-records/${id}`);
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
```

- [ ] **Step 3: Refresh after the background reads**

In `app/api/cron/index/route.ts`, add the import:

```ts
import { refreshDerivedFacts } from '@/lib/db/derived-facts';
```

Replace the `extract` and `transcript` entries of `processIndexJobs({...})` with:

```ts
      extract: async ({ recordId }) => {
        if (!extractor) return { status: 'skipped' };
        try {
          await extractAndApply(createSupabaseAdminClient(), recordId, extractor, vector);
          // The printed address may have just arrived (spec §5.2); a failure here never fails the job.
          await refreshDerivedFacts(createSupabaseAdminClient(), recordId).catch((e) =>
            console.error('derived facts', recordId, e),
          );
          return { status: 'done' };
        } catch (e) {
          if (e instanceof ExtractionError && TERMINAL_EXTRACTION.has(e.code)) {
            return { status: 'failed', error: e.code };
          }
          throw e;
        }
      },
      transcript: async (input) => {
        const run = await fillRecordFromTranscripts(createSupabaseAdminClient(), input.recordId, {
          extractor,
          vector,
          budgetMs: input.budgetMs,
          facts: input.facts,
          sweepPages: sweepPagesFromEnv(),
        });
        if (run.applied.includes('head_office_address')) {
          await refreshDerivedFacts(createSupabaseAdminClient(), input.recordId).catch((e) =>
            console.error('derived facts', input.recordId, e),
          );
        }
        return run;
      },
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/dbd-records.db.test.ts tests/integration/extraction.test.ts tests/integration/transcript-extraction.test.ts`
Expected: typecheck and lint clean; those integration files still pass (they do not go through the route or the actions).

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/(admin)/admin/dbd-records/actions.ts" app/api/cron/index/route.ts
git commit -m "feat(facts): derive after record saves, answers, extraction and transcript fills (P17a)"
```

---

## Task 10: The fact sheet

**Files:**
- Create: `lib/domain/facts/fact-sheet.ts`
- Test: `tests/unit/domain/fact-sheet.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/domain/fact-sheet.test.ts
import { describe, expect, it } from 'vitest';
import { EMPTY_INTERVIEW_PROFILE } from '@/lib/domain/bank-interview';
import { EMPTY_BUSINESS_PROFILE } from '@/lib/domain/dbd-profile';
import { STATUS_FACTS, buildFactSheet } from '@/lib/domain/facts/fact-sheet';

const record = {
  company_name_th: 'บริษัท ซินเนอร์จี แล็บ จำกัด',
  company_name_en: 'SYNERGY LAB CO., LTD.',
  juristic_id: '0455569000808',
  registered_on: '2026-04-16',
  registered_capital: 2_000_000,
  directors: [{ name_th: 'นางสาวกุลธิดา พลเยี่ยม', name_en: null }],
  signing_authority: 'กรรมการหนึ่งคนลงลายมือชื่อและประทับตราสำคัญของบริษัท',
};
const structured = {
  business: {
    ...EMPTY_BUSINESS_PROFILE,
    shareholders: [
      { name: 'นางสาวกุลธิดา พลเยี่ยม', nationality: null, shares: 18_000, percent: null },
      { name: 'นายสมชาย ใจดี', nationality: null, shares: 2_000, percent: null },
    ],
    share_structure: { total_shares: 20_000, par_value: 100, paid_up_capital: null, share_type: null },
  },
  interview: {
    ...EMPTY_INTERVIEW_PROFILE,
    nature_of_business: 'ค้าส่งและค้าปลีกเสื้อผ้า',
    has_existing_customers: 'no' as const,
    operations_started: 'yes' as const,
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
};

describe('buildFactSheet (spec §7.2)', () => {
  it('lists the five status facts', () => {
    expect(STATUS_FACTS).toEqual([
      'operations_started',
      'has_existing_customers',
      'has_completed_transactions',
      'has_regular_suppliers',
      'learner_is_shareholder',
    ]);
  });

  it('builds the company facts, status facts as booleans, and the derived counts', () => {
    const f = buildFactSheet({ record, structured, address: null, role: null });
    expect(f).toMatchObject({
      company_name_th: 'บริษัท ซินเนอร์จี แล็บ จำกัด',
      juristic_id: '0455569000808',
      director_count: 1,
      shareholder_count: 2,
      operations_started: true,
      has_existing_customers: false,
      has_completed_transactions: null,
      business_category: 'clothing_fashion',
      learner_is_shareholder: null,
      holder_name: null,
    });
  });

  it('adds the learner: shareholder or not, and their shares', () => {
    const holder = buildFactSheet({
      record,
      structured,
      address: null,
      role: {
        holder_name: 'นางสาวกุลธิดา พลเยี่ยม',
        position: 'กรรมการ',
        responsibilities: null,
        relationship_to_shareholders: null,
      },
    });
    expect(holder).toMatchObject({ learner_is_shareholder: true, my_shares: 18_000, my_share_percent: 90 });
    const outsider = buildFactSheet({
      record,
      structured,
      address: null,
      role: {
        holder_name: 'นายภายนอก',
        position: null,
        responsibilities: null,
        relationship_to_shareholders: null,
      },
    });
    expect(outsider).toMatchObject({ learner_is_shareholder: false, my_shares: null });
  });

  it('uses a category only once it is mapped', () => {
    const f = buildFactSheet({
      record,
      structured: {
        ...structured,
        category: { ...structured.category, status: 'needs_review' as const, key: null },
      },
      address: null,
      role: null,
    });
    expect(f.business_category).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/fact-sheet.test.ts`
Expected: FAIL — cannot resolve `@/lib/domain/facts/fact-sheet`.

- [ ] **Step 3: Implement the fact sheet**

```ts
// lib/domain/facts/fact-sheet.ts
import {
  COMPANY_STATUS_FACTS,
  EMPTY_INTERVIEW_PROFILE,
  isShareholder,
  myShareholding,
  type LearnerRole,
  type YesNo,
} from '@/lib/domain/bank-interview';
import {
  EMPTY_BUSINESS_PROFILE,
  type Shareholder,
  type StructuredData,
} from '@/lib/domain/dbd-profile';
import type { Director } from '@/lib/domain/dbd-record';
import type { RegisteredAddress } from '@/lib/domain/geo/resolve';

/** The status facts that select alternate wording (D73); the last is derived per assignment. */
export const STATUS_FACTS = [...COMPANY_STATUS_FACTS, 'learner_is_shareholder'] as const;
export type StatusFact = (typeof STATUS_FACTS)[number];

/** The record columns the fact sheet reads (a `dbd_records` row satisfies it). */
export type RecordColumns = {
  company_name_th: string | null;
  company_name_en: string | null;
  juristic_id: string | null;
  registered_on: string | null;
  registered_capital: number | null;
  directors: unknown;
  signing_authority: string | null;
};

/**
 * The canonical facts both evaluations read (spec §7.2). P17b freezes exactly this object into a
 * training version, so every consumer builds it here and nowhere else.
 */
export type FactSheet = {
  company_name_th: string | null;
  company_name_en: string | null;
  juristic_id: string | null;
  registered_on: string | null;
  registered_capital: number | null;
  directors: Director[];
  signing_authority: string | null;
  address: RegisteredAddress | null;
  shareholders: Shareholder[];
  total_shares: number | null;
  nature_of_business: string | null;
  products_services: string | null;
  business_purpose: string | null;
  main_clients: string | null;
  client_origin: string | null;
  main_suppliers: string | null;
  business_address: string | null;
  monthly_revenue: string | null;
  revenue_basis: string | null;
  average_transaction: string | null;
  monthly_transactions: string | null;
  source_of_funds: string | null;
  first_incoming_funds: string | null;
  account_purpose: string | null;
  promptpay_qr_purpose: string | null;
  customer_examples: string | null;
  customer_profile: string | null;
  transaction_details: string | null;
  operations_started: boolean | null;
  has_existing_customers: boolean | null;
  has_completed_transactions: boolean | null;
  has_regular_suppliers: boolean | null;
  learner_is_shareholder: boolean | null;
  business_category: string | null;
  holder_name: string | null;
  position: string | null;
  director_count: number | null;
  shareholder_count: number | null;
  my_shares: number | null;
  my_share_percent: number | null;
};
export type FactKey = keyof FactSheet;

const bool = (v: YesNo | null): boolean | null => (v === null ? null : v === 'yes');

export function buildFactSheet(input: {
  record: RecordColumns;
  structured: StructuredData;
  address: RegisteredAddress | null;
  role: LearnerRole | null;
}): FactSheet {
  const business = input.structured.business ?? EMPTY_BUSINESS_PROFILE;
  const p = input.structured.interview ?? EMPTY_INTERVIEW_PROFILE;
  const directors = Array.isArray(input.record.directors)
    ? (input.record.directors as Director[])
    : [];
  const holder = input.role?.holder_name?.trim() || null;
  const mine = myShareholding(business, holder);
  const category = input.structured.category;
  return {
    company_name_th: input.record.company_name_th,
    company_name_en: input.record.company_name_en,
    juristic_id: input.record.juristic_id,
    registered_on: input.record.registered_on,
    registered_capital: input.record.registered_capital,
    directors,
    signing_authority: input.record.signing_authority,
    address: input.address,
    shareholders: business.shareholders,
    total_shares: business.share_structure.total_shares,
    nature_of_business: p.nature_of_business,
    products_services: p.products_services,
    business_purpose: p.business_purpose,
    main_clients: p.main_clients,
    client_origin: p.client_origin,
    main_suppliers: p.main_suppliers,
    business_address: p.business_address,
    monthly_revenue: p.monthly_revenue,
    revenue_basis: p.revenue_basis,
    average_transaction: p.average_transaction,
    monthly_transactions: p.monthly_transactions,
    source_of_funds: p.source_of_funds,
    first_incoming_funds: p.first_incoming_funds,
    account_purpose: p.account_purpose,
    promptpay_qr_purpose: p.promptpay_qr_purpose,
    customer_examples: p.customer_examples,
    customer_profile: p.customer_profile,
    transaction_details: p.transaction_details,
    operations_started: bool(p.operations_started),
    has_existing_customers: bool(p.has_existing_customers),
    has_completed_transactions: bool(p.has_completed_transactions),
    has_regular_suppliers: bool(p.has_regular_suppliers),
    learner_is_shareholder: isShareholder(business, holder),
    business_category: category?.status === 'mapped' ? category.key : null,
    holder_name: holder,
    position: input.role?.position ?? null,
    director_count: directors.length > 0 ? directors.length : null,
    shareholder_count: business.shareholders.length > 0 ? business.shareholders.length : null,
    my_shares: mine.shares,
    my_share_percent: mine.percent,
  };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/fact-sheet.test.ts && pnpm typecheck`
Expected: 4 passed; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/facts tests/unit/domain/fact-sheet.test.ts
git commit -m "feat(facts): one fact sheet for both evaluations (P17a, spec §7.2)"
```

---

## Task 11: The concept registry

**Files:**
- Create: `lib/domain/concepts/registry.ts`, `supabase/migrations/20261001030000_evaluation_concepts.sql`
- Modify: `lib/db/database.types.ts` (regenerated)
- Test: `tests/unit/domain/concept-registry.test.ts`, `tests/integration/evaluation-concepts.test.ts`

- [ ] **Step 1: Write the failing unit test**

```ts
// tests/unit/domain/concept-registry.test.ts
import { describe, expect, it } from 'vitest';
import {
  CRITICAL_CONCEPT_KEYS,
  EVALUATION_CONCEPTS,
  INTERVIEW_CONCEPTS,
  MCQ_CONCEPTS,
  conceptTitle,
} from '@/lib/domain/concepts/registry';
import { STATUS_FACTS } from '@/lib/domain/facts/fact-sheet';

describe('the concept registry (spec §7.1)', () => {
  it('has 37 distinct concepts', () => {
    expect(EVALUATION_CONCEPTS).toHaveLength(37);
    expect(new Set(EVALUATION_CONCEPTS.map((c) => c.key)).size).toBe(37);
  });

  it('has exactly the 30 MCQ concepts in order 1–30', () => {
    expect(MCQ_CONCEPTS.map((c) => c.mcqOrder)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it('has exactly the nine critical concepts (D72)', () => {
    expect([...CRITICAL_CONCEPT_KEYS].sort()).toEqual(
      [
        'company_name',
        'registration_number',
        'registration_date',
        'registered_location',
        'registered_capital',
        'director_identity',
        'director_count',
        'actual_business',
        'signing_authority',
      ].sort(),
    );
  });

  it('has the 13 chatbot slots in the Owner’s order with the Owner’s match types (D78)', () => {
    expect(INTERVIEW_CONCEPTS.map((c) => [c.key, c.interviewMatch])).toEqual([
      ['company_name', 'normalized'],
      ['registration_number', 'exact'],
      ['registered_address', 'structured'],
      ['actual_business', 'semantic'],
      ['products_services', 'semantic'],
      ['authorized_representative', 'structured'],
      ['attendee_identity', 'normalized'],
      ['registration_date', 'normalized'],
      ['account_purpose', 'semantic'],
      ['main_clients', 'semantic'],
      ['customer_examples', 'semantic'],
      ['customer_profile', 'semantic'],
      ['transaction_details', 'semantic'],
    ]);
  });

  it('allows semantic grading only on open-text concepts', () => {
    for (const c of EVALUATION_CONCEPTS.filter((x) => x.interviewMatch === 'semantic')) {
      expect(c.answer, c.key).toBe('open_text');
    }
  });

  it('gives KYC policy concepts no facts, and every other concept at least one', () => {
    for (const c of EVALUATION_CONCEPTS) {
      expect(c.facts.length === 0, c.key).toBe(c.source === 'KYC_POLICY');
    }
  });

  it('only names known status facts as alternates', () => {
    for (const c of EVALUATION_CONCEPTS) {
      for (const s of c.alternateWhen) expect(STATUS_FACTS, c.key).toContain(s);
    }
  });

  it('holds exactly the alternate conditions the Owner confirmed (correction 4)', () => {
    const alt = Object.fromEntries(
      EVALUATION_CONCEPTS.filter((c) => c.alternateWhen.length > 0).map((c) => [
        c.key,
        [...c.alternateWhen],
      ]),
    );
    expect(alt).toEqual({
      learner_shareholding: ['learner_is_shareholder'],
      main_clients: ['has_existing_customers'],
      client_origin: ['has_existing_customers'],
      main_suppliers: ['has_regular_suppliers'],
      actual_business_location: ['operations_started'],
      monthly_revenue: ['operations_started'],
      revenue_basis: ['operations_started'],
      average_transaction: ['has_completed_transactions'],
      monthly_transactions: ['has_completed_transactions'],
      customer_examples: ['has_existing_customers'],
      customer_profile: ['has_existing_customers'],
      transaction_details: ['has_completed_transactions'],
    });
  });

  it('titles every concept in three languages', () => {
    expect(conceptTitle('registered_capital', 'th')).toBe('ทุนจดทะเบียน');
    expect(conceptTitle('registered_capital', 'en')).toBe('Registered capital');
    expect(conceptTitle('registered_capital', 'zh')).toBe('注册资本');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/concept-registry.test.ts`
Expected: FAIL — cannot resolve `@/lib/domain/concepts/registry`.

- [ ] **Step 3: Write the registry**

Create `lib/domain/concepts/registry.ts` with exactly this content (the rows match spec §7.1; the
file has no value imports so client components and scripts may both read it):

```ts
// lib/domain/concepts/registry.ts
import type { FactKey, StatusFact } from '@/lib/domain/facts/fact-sheet';

/**
 * The shared concept registry (spec 2026-09-30 §7; decisions D72, D76, D78). One row per concept
 * either evaluation asks about: the 30 MCQ concepts are fixed product decisions, the 13 chatbot
 * slots are fixed in the Owner's order. `supabase/migrations/20261001030000_evaluation_concepts.sql`
 * seeds the same rows and `tests/integration/evaluation-concepts.test.ts` holds the two equal.
 */
export const CONCEPT_SOURCES = ['DBD_FACT', 'BUSINESS_PROFILE', 'DERIVED', 'ROLE', 'KYC_POLICY'] as const;
export type ConceptSource = (typeof CONCEPT_SOURCES)[number];

export const CONCEPT_DOMAINS = [
  'identity',
  'authority',
  'ownership',
  'business',
  'financial',
  'funds',
  'banking',
  'kyc',
  'attendance',
] as const;
export type ConceptDomain = (typeof CONCEPT_DOMAINS)[number];

export const ANSWER_TYPES = [
  'name',
  'id',
  'date',
  'address',
  'count',
  'names',
  'text',
  'money',
  'shareholding',
  'open_text',
  'static',
] as const;
export type AnswerType = (typeof ANSWER_TYPES)[number];

export const MATCH_TYPES = ['exact', 'normalized', 'structured', 'semantic'] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

export type ConceptDef = {
  key: string;
  domain: ConceptDomain;
  source: ConceptSource;
  /** Facts that must be present for the concept to resolve (spec §7.3). */
  facts: readonly FactKey[];
  answer: AnswerType;
  /** 1–30: position in the MCQ; null = chatbot only. */
  mcqOrder: number | null;
  critical: boolean;
  /** 1–13: chatbot slot; null = MCQ only. */
  interviewSlot: number | null;
  interviewMatch: MatchType | null;
  /** Status facts that select alternate wording; they must be set for the concept to resolve. */
  alternateWhen: readonly StatusFact[];
  title: { th: string; en: string; zh: string };
};

type Row = Omit<ConceptDef, 'critical' | 'interviewSlot' | 'interviewMatch' | 'alternateWhen'> &
  Partial<Pick<ConceptDef, 'critical' | 'interviewSlot' | 'interviewMatch' | 'alternateWhen'>>;

const row = (r: Row): ConceptDef => ({
  critical: false,
  interviewSlot: null,
  interviewMatch: null,
  alternateWhen: [],
  ...r,
});

export const EVALUATION_CONCEPTS: readonly ConceptDef[] = [
  row({ key: 'company_name', domain: 'identity', source: 'DBD_FACT', facts: ['company_name_th'], answer: 'name', mcqOrder: 1, critical: true, interviewSlot: 1, interviewMatch: 'normalized', title: { th: 'ชื่อบริษัท', en: 'Company name', zh: '公司名称' } }),
  row({ key: 'registration_number', domain: 'identity', source: 'DBD_FACT', facts: ['juristic_id'], answer: 'id', mcqOrder: 2, critical: true, interviewSlot: 2, interviewMatch: 'exact', title: { th: 'เลขทะเบียนนิติบุคคล', en: 'Juristic registration number', zh: '法人注册号' } }),
  row({ key: 'registration_date', domain: 'identity', source: 'DBD_FACT', facts: ['registered_on'], answer: 'date', mcqOrder: 3, critical: true, interviewSlot: 8, interviewMatch: 'normalized', title: { th: 'วันที่จดทะเบียนบริษัท', en: 'Registration date', zh: '公司注册日期' } }),
  row({ key: 'registered_location', domain: 'identity', source: 'DBD_FACT', facts: ['address'], answer: 'address', mcqOrder: 4, critical: true, title: { th: 'ที่ตั้งสำนักงานที่จดทะเบียน', en: 'Registered office location', zh: '注册办公地点' } }),
  row({ key: 'director_count', domain: 'authority', source: 'DERIVED', facts: ['directors'], answer: 'count', mcqOrder: 5, critical: true, title: { th: 'จำนวนกรรมการ', en: 'Number of directors', zh: '董事人数' } }),
  row({ key: 'director_identity', domain: 'authority', source: 'DBD_FACT', facts: ['directors'], answer: 'names', mcqOrder: 6, critical: true, title: { th: 'รายชื่อกรรมการ', en: 'Registered directors', zh: '注册董事' } }),
  row({ key: 'signing_authority', domain: 'authority', source: 'DBD_FACT', facts: ['signing_authority'], answer: 'text', mcqOrder: 7, critical: true, title: { th: 'อำนาจกรรมการลงนาม', en: 'Company signing authority', zh: '公司签字权' } }),
  row({ key: 'registered_capital', domain: 'ownership', source: 'DBD_FACT', facts: ['registered_capital'], answer: 'money', mcqOrder: 8, critical: true, title: { th: 'ทุนจดทะเบียน', en: 'Registered capital', zh: '注册资本' } }),
  row({ key: 'shareholder_count', domain: 'ownership', source: 'DERIVED', facts: ['shareholders'], answer: 'count', mcqOrder: 9, title: { th: 'จำนวนผู้ถือหุ้น', en: 'Number of shareholders', zh: '股东人数' } }),
  row({ key: 'learner_shareholding', domain: 'ownership', source: 'ROLE', facts: ['holder_name', 'shareholders'], answer: 'shareholding', mcqOrder: 10, alternateWhen: ['learner_is_shareholder'], title: { th: 'หุ้นที่ผู้เรียนถือ', en: "Learner's shareholding", zh: '学员持股情况' } }),
  row({ key: 'actual_business', domain: 'business', source: 'BUSINESS_PROFILE', facts: ['nature_of_business'], answer: 'open_text', mcqOrder: 11, critical: true, interviewSlot: 4, interviewMatch: 'semantic', title: { th: 'ธุรกิจหลักที่ทำจริง', en: 'Actual main business', zh: '实际主营业务' } }),
  row({ key: 'products_services', domain: 'business', source: 'BUSINESS_PROFILE', facts: ['products_services'], answer: 'open_text', mcqOrder: 12, interviewSlot: 5, interviewMatch: 'semantic', title: { th: 'สินค้าหรือบริการ', en: 'Products or services', zh: '产品或服务' } }),
  row({ key: 'business_purpose', domain: 'business', source: 'BUSINESS_PROFILE', facts: ['business_purpose'], answer: 'open_text', mcqOrder: 13, title: { th: 'เหตุผลที่ตั้งบริษัท', en: 'Why the company was established', zh: '公司成立原因' } }),
  row({ key: 'main_clients', domain: 'business', source: 'BUSINESS_PROFILE', facts: ['main_clients'], answer: 'open_text', mcqOrder: 14, interviewSlot: 10, interviewMatch: 'semantic', alternateWhen: ['has_existing_customers'], title: { th: 'ลูกค้าหลัก', en: 'Main customers', zh: '主要客户' } }),
  row({ key: 'client_origin', domain: 'business', source: 'BUSINESS_PROFILE', facts: ['client_origin'], answer: 'open_text', mcqOrder: 15, alternateWhen: ['has_existing_customers'], title: { th: 'ที่มาของลูกค้า', en: 'Where customers come from', zh: '客户来源' } }),
  row({ key: 'main_suppliers', domain: 'business', source: 'BUSINESS_PROFILE', facts: ['main_suppliers'], answer: 'open_text', mcqOrder: 16, alternateWhen: ['has_regular_suppliers'], title: { th: 'ซัพพลายเออร์หลัก', en: 'Main suppliers', zh: '主要供应商' } }),
  row({ key: 'actual_business_location', domain: 'business', source: 'BUSINESS_PROFILE', facts: ['business_address'], answer: 'text', mcqOrder: 17, alternateWhen: ['operations_started'], title: { th: 'สถานที่ประกอบกิจการจริง', en: 'Actual place of business', zh: '实际经营地点' } }),
  row({ key: 'monthly_revenue', domain: 'financial', source: 'BUSINESS_PROFILE', facts: ['monthly_revenue'], answer: 'text', mcqOrder: 18, alternateWhen: ['operations_started'], title: { th: 'รายได้ต่อเดือนโดยประมาณ', en: 'Estimated monthly revenue', zh: '预计月收入' } }),
  row({ key: 'revenue_basis', domain: 'financial', source: 'BUSINESS_PROFILE', facts: ['revenue_basis'], answer: 'open_text', mcqOrder: 19, alternateWhen: ['operations_started'], title: { th: 'ที่มาของการประมาณรายได้', en: 'Basis of the revenue estimate', zh: '收入估算依据' } }),
  row({ key: 'average_transaction', domain: 'financial', source: 'BUSINESS_PROFILE', facts: ['average_transaction'], answer: 'text', mcqOrder: 20, alternateWhen: ['has_completed_transactions'], title: { th: 'ยอดธุรกรรมเฉลี่ยต่อครั้ง', en: 'Average transaction amount', zh: '平均每笔交易金额' } }),
  row({ key: 'monthly_transactions', domain: 'financial', source: 'BUSINESS_PROFILE', facts: ['monthly_transactions'], answer: 'text', mcqOrder: 21, alternateWhen: ['has_completed_transactions'], title: { th: 'จำนวนธุรกรรมต่อเดือน', en: 'Transactions per month', zh: '每月交易笔数' } }),
  row({ key: 'startup_source_of_funds', domain: 'funds', source: 'BUSINESS_PROFILE', facts: ['source_of_funds'], answer: 'open_text', mcqOrder: 22, title: { th: 'ที่มาของเงินทุนเริ่มต้น', en: 'Source of start-up capital', zh: '启动资金来源' } }),
  row({ key: 'first_incoming_funds', domain: 'funds', source: 'BUSINESS_PROFILE', facts: ['first_incoming_funds'], answer: 'open_text', mcqOrder: 23, title: { th: 'ที่มาและวัตถุประสงค์ของเงินเข้าก้อนแรก', en: 'Source and purpose of the first incoming funds', zh: '首笔入账资金的来源与用途' } }),
  row({ key: 'bank_account_purpose', domain: 'banking', source: 'BUSINESS_PROFILE', facts: ['account_purpose'], answer: 'open_text', mcqOrder: 24, title: { th: 'เหตุผลที่ต้องมีบัญชีบริษัท', en: 'Why the company needs a bank account', zh: '公司开户原因' } }),
  row({ key: 'promptpay_qr_purpose', domain: 'banking', source: 'BUSINESS_PROFILE', facts: ['promptpay_qr_purpose'], answer: 'open_text', mcqOrder: 25, title: { th: 'เหตุผลที่ต้องใช้พร้อมเพย์หรือ QR', en: 'Why PromptPay / QR is needed', zh: '需要 PromptPay / QR 的原因' } }),
  row({ key: 'internet_banking_control', domain: 'kyc', source: 'KYC_POLICY', facts: [], answer: 'static', mcqOrder: 26, title: { th: 'ผู้ควบคุมอินเทอร์เน็ตแบงกิ้ง', en: 'Who controls internet banking', zh: '网上银行由谁控制' } }),
  row({ key: 'otp_control', domain: 'kyc', source: 'KYC_POLICY', facts: [], answer: 'static', mcqOrder: 27, title: { th: 'ผู้ควบคุม OTP', en: 'Who controls the OTP', zh: 'OTP 由谁控制' } }),
  row({ key: 'transaction_explanation', domain: 'kyc', source: 'KYC_POLICY', facts: [], answer: 'static', mcqOrder: 28, title: { th: 'การอธิบายที่มาและวัตถุประสงค์ของธุรกรรม', en: 'Explaining the source and purpose of transactions', zh: '说明交易的来源与商业目的' } }),
  row({ key: 'supporting_documents', domain: 'kyc', source: 'KYC_POLICY', facts: [], answer: 'static', mcqOrder: 29, title: { th: 'เอกสารประกอบและใบแจ้งหนี้', en: 'Supporting documents and invoices', zh: '证明文件与发票' } }),
  row({ key: 'answer_consistency', domain: 'kyc', source: 'KYC_POLICY', facts: [], answer: 'static', mcqOrder: 30, title: { th: 'ความสอดคล้องกับข้อมูลและเอกสารของบริษัท', en: 'Consistency with company facts and documents', zh: '与公司信息及文件保持一致' } }),
  row({ key: 'registered_address', domain: 'identity', source: 'DBD_FACT', facts: ['address'], answer: 'address', mcqOrder: null, interviewSlot: 3, interviewMatch: 'structured', title: { th: 'ที่อยู่ที่จดทะเบียน', en: 'Registered address', zh: '注册地址' } }),
  row({ key: 'authorized_representative', domain: 'authority', source: 'DBD_FACT', facts: ['directors', 'signing_authority'], answer: 'names', mcqOrder: null, interviewSlot: 6, interviewMatch: 'structured', title: { th: 'ผู้มีอำนาจลงนามแทนบริษัท', en: 'Authorised representative', zh: '授权代表' } }),
  row({ key: 'attendee_identity', domain: 'attendance', source: 'ROLE', facts: ['holder_name'], answer: 'name', mcqOrder: null, interviewSlot: 7, interviewMatch: 'normalized', title: { th: 'ผู้ที่มาติดต่อธนาคาร', en: 'Who is attending', zh: '到场人员身份' } }),
  row({ key: 'account_purpose', domain: 'banking', source: 'BUSINESS_PROFILE', facts: ['account_purpose'], answer: 'open_text', mcqOrder: null, interviewSlot: 9, interviewMatch: 'semantic', title: { th: 'วัตถุประสงค์ของการเปิดบัญชี', en: 'Purpose of the account', zh: '开户目的' } }),
  row({ key: 'customer_examples', domain: 'business', source: 'BUSINESS_PROFILE', facts: ['customer_examples'], answer: 'open_text', mcqOrder: null, interviewSlot: 11, interviewMatch: 'semantic', alternateWhen: ['has_existing_customers'], title: { th: 'ตัวอย่างลูกค้า', en: 'Customer examples', zh: '客户示例' } }),
  row({ key: 'customer_profile', domain: 'business', source: 'BUSINESS_PROFILE', facts: ['customer_profile'], answer: 'open_text', mcqOrder: null, interviewSlot: 12, interviewMatch: 'semantic', alternateWhen: ['has_existing_customers'], title: { th: 'ลักษณะของลูกค้า', en: 'Customer profile', zh: '客户概况' } }),
  row({ key: 'transaction_details', domain: 'financial', source: 'BUSINESS_PROFILE', facts: ['transaction_details'], answer: 'open_text', mcqOrder: null, interviewSlot: 13, interviewMatch: 'semantic', alternateWhen: ['has_completed_transactions'], title: { th: 'รายละเอียดการซื้อขายและการชำระเงิน', en: 'Transaction details', zh: '交易与付款详情' } }),
];

export const MCQ_CONCEPTS: readonly ConceptDef[] = EVALUATION_CONCEPTS.filter(
  (c) => c.mcqOrder !== null,
).sort((a, b) => (a.mcqOrder ?? 0) - (b.mcqOrder ?? 0));

export const INTERVIEW_CONCEPTS: readonly ConceptDef[] = EVALUATION_CONCEPTS.filter(
  (c) => c.interviewSlot !== null,
).sort((a, b) => (a.interviewSlot ?? 0) - (b.interviewSlot ?? 0));

export const CRITICAL_CONCEPT_KEYS: readonly string[] = MCQ_CONCEPTS.filter((c) => c.critical).map(
  (c) => c.key,
);

export function conceptTitle(key: string, locale: string): string {
  const def = EVALUATION_CONCEPTS.find((c) => c.key === key);
  if (!def) return key;
  return locale === 'en' ? def.title.en : locale === 'zh' ? def.title.zh : def.title.th;
}
```

(Prettier will re-wrap the long `row({...})` lines; that is fine.)

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/concept-registry.test.ts`
Expected: 9 passed.

- [ ] **Step 4: Write the failing integration test**

```ts
// tests/integration/evaluation-concepts.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EVALUATION_CONCEPTS } from '@/lib/domain/concepts/registry';
import {
  adminClient,
  clientFor,
  createTestManager,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers';

const svc = adminClient();

/** The registry table and its TypeScript mirror are one decision (spec §7.1, D76). */
describe('evaluation_concepts', () => {
  let manager: TestUser;
  let learner: TestUser;
  beforeAll(async () => {
    manager = await createTestManager();
    learner = await createTestUser('learner');
  });
  afterAll(async () => {
    await deleteTestUser(learner.id);
    await deleteTestUser(manager.id);
  });

  it('holds exactly the rows of lib/domain/concepts/registry.ts', async () => {
    const { data, error } = await svc.from('evaluation_concepts').select('*');
    if (error) throw error;
    const byKey = (a: { key: string }, b: { key: string }) => (a.key < b.key ? -1 : 1);
    const fromDb = data
      .map((r) => ({
        key: r.key,
        domain: r.domain,
        source: r.source,
        facts: r.facts,
        answer: r.answer_type,
        mcqOrder: r.mcq_order,
        critical: r.critical,
        interviewSlot: r.interview_slot,
        interviewMatch: r.interview_match,
        alternateWhen: r.alternate_when,
        title: { th: r.title_th, en: r.title_en, zh: r.title_zh },
      }))
      .sort(byKey);
    const fromCode = [...EVALUATION_CONCEPTS]
      .map((c) => ({ ...c, facts: [...c.facts], alternateWhen: [...c.alternateWhen] }))
      .sort(byKey);
    expect(fromDb).toEqual(fromCode);
  });

  it('is read by staff, by no learner, and written by nobody', async () => {
    const asManager = await clientFor(manager);
    const { data } = await asManager.from('evaluation_concepts').select('key');
    expect(data).toHaveLength(37);
    const { data: forLearner } = await (await clientFor(learner))
      .from('evaluation_concepts')
      .select('key');
    expect(forLearner).toEqual([]);
    const { error } = await asManager.from('evaluation_concepts').insert({
      key: 'x_test',
      domain: 'kyc',
      source: 'KYC_POLICY',
      answer_type: 'static',
      title_th: 'x',
      title_en: 'x',
      title_zh: 'x',
    });
    expect(error?.code).toBe('42501');
  });

  // All 13 slots are taken, so these rows test the checks without a slot: a grading tier
  // needs a slot, a KYC answer reads no fact, a critical concept is an MCQ concept.
  it('refuses rows that break the registry rules', async () => {
    const base = { domain: 'identity', title_th: 'x', title_en: 'x', title_zh: 'x' };
    const tierWithoutSlot = await svc.from('evaluation_concepts').insert({
      ...base,
      key: 'x_tier_no_slot',
      source: 'DBD_FACT',
      facts: ['juristic_id'],
      answer_type: 'id',
      interview_match: 'semantic',
    });
    expect(tierWithoutSlot.error?.code).toBe('23514');
    const kycWithFact = await svc.from('evaluation_concepts').insert({
      ...base,
      key: 'x_kyc_fact',
      source: 'KYC_POLICY',
      facts: ['juristic_id'],
      answer_type: 'static',
    });
    expect(kycWithFact.error?.code).toBe('23514');
    const criticalOffMcq = await svc.from('evaluation_concepts').insert({
      ...base,
      key: 'x_critical',
      source: 'DBD_FACT',
      facts: ['juristic_id'],
      answer_type: 'id',
      critical: true,
    });
    expect(criticalOffMcq.error?.code).toBe('23514');
  });
});
```

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/evaluation-concepts.test.ts`
Expected: FAIL — `relation "public.evaluation_concepts" does not exist`.

- [ ] **Step 5: Write the migration**

```sql
-- supabase/migrations/20261001030000_evaluation_concepts.sql
-- P17a: the shared concept registry (spec 2026-09-30 §7.1; decisions D72, D76, D78). The 30 MCQ
-- concepts and the 13 chatbot slots are fixed product decisions; the rows mirror
-- lib/domain/concepts/registry.ts and tests/integration/evaluation-concepts.test.ts holds the two
-- equal. Staff read it; nobody writes it outside a migration.

create table public.evaluation_concepts (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,59}$'),
  domain text not null check (domain in
    ('identity', 'authority', 'ownership', 'business', 'financial', 'funds', 'banking', 'kyc', 'attendance')),
  source text not null check (source in ('DBD_FACT', 'BUSINESS_PROFILE', 'DERIVED', 'ROLE', 'KYC_POLICY')),
  facts text[] not null default '{}',
  answer_type text not null check (answer_type in
    ('name', 'id', 'date', 'address', 'count', 'names', 'text', 'money', 'shareholding', 'open_text', 'static')),
  mcq_order smallint unique check (mcq_order between 1 and 30),
  critical boolean not null default false,
  interview_slot smallint unique check (interview_slot between 1 and 13),
  interview_match text check (interview_match in ('exact', 'normalized', 'structured', 'semantic')),
  alternate_when text[] not null default '{}',
  title_th text not null,
  title_en text not null,
  title_zh text not null,
  -- Only an MCQ concept can be critical (D72).
  check (not critical or mcq_order is not null),
  -- A slot always has its grading tier, and a tier only belongs to a slot.
  check ((interview_slot is null) = (interview_match is null)),
  -- AI semantic grading only on open-text concepts (D78).
  check (interview_match is distinct from 'semantic' or answer_type = 'open_text'),
  -- KYC policy answers read no company fact, so they never raise a missing-fact exception (D74).
  check ((source = 'KYC_POLICY') = (cardinality(facts) = 0))
);

alter table public.evaluation_concepts enable row level security;

create policy "evaluation concepts: staff read" on public.evaluation_concepts
  for select to authenticated using (public.is_staff());

insert into public.evaluation_concepts
  (key, domain, source, facts, answer_type, mcq_order, critical, interview_slot, interview_match,
   alternate_when, title_th, title_en, title_zh)
values
  ('company_name', 'identity', 'DBD_FACT', array['company_name_th']::text[], 'name', 1, true, 1, 'normalized', '{}'::text[], 'ชื่อบริษัท', 'Company name', '公司名称'),
  ('registration_number', 'identity', 'DBD_FACT', array['juristic_id']::text[], 'id', 2, true, 2, 'exact', '{}'::text[], 'เลขทะเบียนนิติบุคคล', 'Juristic registration number', '法人注册号'),
  ('registration_date', 'identity', 'DBD_FACT', array['registered_on']::text[], 'date', 3, true, 8, 'normalized', '{}'::text[], 'วันที่จดทะเบียนบริษัท', 'Registration date', '公司注册日期'),
  ('registered_location', 'identity', 'DBD_FACT', array['address']::text[], 'address', 4, true, null, null, '{}'::text[], 'ที่ตั้งสำนักงานที่จดทะเบียน', 'Registered office location', '注册办公地点'),
  ('director_count', 'authority', 'DERIVED', array['directors']::text[], 'count', 5, true, null, null, '{}'::text[], 'จำนวนกรรมการ', 'Number of directors', '董事人数'),
  ('director_identity', 'authority', 'DBD_FACT', array['directors']::text[], 'names', 6, true, null, null, '{}'::text[], 'รายชื่อกรรมการ', 'Registered directors', '注册董事'),
  ('signing_authority', 'authority', 'DBD_FACT', array['signing_authority']::text[], 'text', 7, true, null, null, '{}'::text[], 'อำนาจกรรมการลงนาม', 'Company signing authority', '公司签字权'),
  ('registered_capital', 'ownership', 'DBD_FACT', array['registered_capital']::text[], 'money', 8, true, null, null, '{}'::text[], 'ทุนจดทะเบียน', 'Registered capital', '注册资本'),
  ('shareholder_count', 'ownership', 'DERIVED', array['shareholders']::text[], 'count', 9, false, null, null, '{}'::text[], 'จำนวนผู้ถือหุ้น', 'Number of shareholders', '股东人数'),
  ('learner_shareholding', 'ownership', 'ROLE', array['holder_name', 'shareholders']::text[], 'shareholding', 10, false, null, null, array['learner_is_shareholder']::text[], 'หุ้นที่ผู้เรียนถือ', 'Learner''s shareholding', '学员持股情况'),
  ('actual_business', 'business', 'BUSINESS_PROFILE', array['nature_of_business']::text[], 'open_text', 11, true, 4, 'semantic', '{}'::text[], 'ธุรกิจหลักที่ทำจริง', 'Actual main business', '实际主营业务'),
  ('products_services', 'business', 'BUSINESS_PROFILE', array['products_services']::text[], 'open_text', 12, false, 5, 'semantic', '{}'::text[], 'สินค้าหรือบริการ', 'Products or services', '产品或服务'),
  ('business_purpose', 'business', 'BUSINESS_PROFILE', array['business_purpose']::text[], 'open_text', 13, false, null, null, '{}'::text[], 'เหตุผลที่ตั้งบริษัท', 'Why the company was established', '公司成立原因'),
  ('main_clients', 'business', 'BUSINESS_PROFILE', array['main_clients']::text[], 'open_text', 14, false, 10, 'semantic', array['has_existing_customers']::text[], 'ลูกค้าหลัก', 'Main customers', '主要客户'),
  ('client_origin', 'business', 'BUSINESS_PROFILE', array['client_origin']::text[], 'open_text', 15, false, null, null, array['has_existing_customers']::text[], 'ที่มาของลูกค้า', 'Where customers come from', '客户来源'),
  ('main_suppliers', 'business', 'BUSINESS_PROFILE', array['main_suppliers']::text[], 'open_text', 16, false, null, null, array['has_regular_suppliers']::text[], 'ซัพพลายเออร์หลัก', 'Main suppliers', '主要供应商'),
  ('actual_business_location', 'business', 'BUSINESS_PROFILE', array['business_address']::text[], 'text', 17, false, null, null, array['operations_started']::text[], 'สถานที่ประกอบกิจการจริง', 'Actual place of business', '实际经营地点'),
  ('monthly_revenue', 'financial', 'BUSINESS_PROFILE', array['monthly_revenue']::text[], 'text', 18, false, null, null, array['operations_started']::text[], 'รายได้ต่อเดือนโดยประมาณ', 'Estimated monthly revenue', '预计月收入'),
  ('revenue_basis', 'financial', 'BUSINESS_PROFILE', array['revenue_basis']::text[], 'open_text', 19, false, null, null, array['operations_started']::text[], 'ที่มาของการประมาณรายได้', 'Basis of the revenue estimate', '收入估算依据'),
  ('average_transaction', 'financial', 'BUSINESS_PROFILE', array['average_transaction']::text[], 'text', 20, false, null, null, array['has_completed_transactions']::text[], 'ยอดธุรกรรมเฉลี่ยต่อครั้ง', 'Average transaction amount', '平均每笔交易金额'),
  ('monthly_transactions', 'financial', 'BUSINESS_PROFILE', array['monthly_transactions']::text[], 'text', 21, false, null, null, array['has_completed_transactions']::text[], 'จำนวนธุรกรรมต่อเดือน', 'Transactions per month', '每月交易笔数'),
  ('startup_source_of_funds', 'funds', 'BUSINESS_PROFILE', array['source_of_funds']::text[], 'open_text', 22, false, null, null, '{}'::text[], 'ที่มาของเงินทุนเริ่มต้น', 'Source of start-up capital', '启动资金来源'),
  ('first_incoming_funds', 'funds', 'BUSINESS_PROFILE', array['first_incoming_funds']::text[], 'open_text', 23, false, null, null, '{}'::text[], 'ที่มาและวัตถุประสงค์ของเงินเข้าก้อนแรก', 'Source and purpose of the first incoming funds', '首笔入账资金的来源与用途'),
  ('bank_account_purpose', 'banking', 'BUSINESS_PROFILE', array['account_purpose']::text[], 'open_text', 24, false, null, null, '{}'::text[], 'เหตุผลที่ต้องมีบัญชีบริษัท', 'Why the company needs a bank account', '公司开户原因'),
  ('promptpay_qr_purpose', 'banking', 'BUSINESS_PROFILE', array['promptpay_qr_purpose']::text[], 'open_text', 25, false, null, null, '{}'::text[], 'เหตุผลที่ต้องใช้พร้อมเพย์หรือ QR', 'Why PromptPay / QR is needed', '需要 PromptPay / QR 的原因'),
  ('internet_banking_control', 'kyc', 'KYC_POLICY', '{}'::text[], 'static', 26, false, null, null, '{}'::text[], 'ผู้ควบคุมอินเทอร์เน็ตแบงกิ้ง', 'Who controls internet banking', '网上银行由谁控制'),
  ('otp_control', 'kyc', 'KYC_POLICY', '{}'::text[], 'static', 27, false, null, null, '{}'::text[], 'ผู้ควบคุม OTP', 'Who controls the OTP', 'OTP 由谁控制'),
  ('transaction_explanation', 'kyc', 'KYC_POLICY', '{}'::text[], 'static', 28, false, null, null, '{}'::text[], 'การอธิบายที่มาและวัตถุประสงค์ของธุรกรรม', 'Explaining the source and purpose of transactions', '说明交易的来源与商业目的'),
  ('supporting_documents', 'kyc', 'KYC_POLICY', '{}'::text[], 'static', 29, false, null, null, '{}'::text[], 'เอกสารประกอบและใบแจ้งหนี้', 'Supporting documents and invoices', '证明文件与发票'),
  ('answer_consistency', 'kyc', 'KYC_POLICY', '{}'::text[], 'static', 30, false, null, null, '{}'::text[], 'ความสอดคล้องกับข้อมูลและเอกสารของบริษัท', 'Consistency with company facts and documents', '与公司信息及文件保持一致'),
  ('registered_address', 'identity', 'DBD_FACT', array['address']::text[], 'address', null, false, 3, 'structured', '{}'::text[], 'ที่อยู่ที่จดทะเบียน', 'Registered address', '注册地址'),
  ('authorized_representative', 'authority', 'DBD_FACT', array['directors', 'signing_authority']::text[], 'names', null, false, 6, 'structured', '{}'::text[], 'ผู้มีอำนาจลงนามแทนบริษัท', 'Authorised representative', '授权代表'),
  ('attendee_identity', 'attendance', 'ROLE', array['holder_name']::text[], 'name', null, false, 7, 'normalized', '{}'::text[], 'ผู้ที่มาติดต่อธนาคาร', 'Who is attending', '到场人员身份'),
  ('account_purpose', 'banking', 'BUSINESS_PROFILE', array['account_purpose']::text[], 'open_text', null, false, 9, 'semantic', '{}'::text[], 'วัตถุประสงค์ของการเปิดบัญชี', 'Purpose of the account', '开户目的'),
  ('customer_examples', 'business', 'BUSINESS_PROFILE', array['customer_examples']::text[], 'open_text', null, false, 11, 'semantic', array['has_existing_customers']::text[], 'ตัวอย่างลูกค้า', 'Customer examples', '客户示例'),
  ('customer_profile', 'business', 'BUSINESS_PROFILE', array['customer_profile']::text[], 'open_text', null, false, 12, 'semantic', array['has_existing_customers']::text[], 'ลักษณะของลูกค้า', 'Customer profile', '客户概况'),
  ('transaction_details', 'financial', 'BUSINESS_PROFILE', array['transaction_details']::text[], 'open_text', null, false, 13, 'semantic', array['has_completed_transactions']::text[], 'รายละเอียดการซื้อขายและการชำระเงิน', 'Transaction details', '交易与付款详情');
```

- [ ] **Step 6: Apply, regenerate types, run both tests**

Run: `pnpm db:reset && pnpm db:types && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/evaluation-concepts.test.ts && pnpm exec vitest run --config vitest.config.ts tests/unit/domain/concept-registry.test.ts`
Expected: 3 passed, then 9 passed.

- [ ] **Step 7: Commit**

```bash
git add lib/domain/concepts/registry.ts supabase/migrations/20261001030000_evaluation_concepts.sql lib/db/database.types.ts tests/unit/domain/concept-registry.test.ts tests/integration/evaluation-concepts.test.ts
git commit -m "feat(concepts): the 37-row concept registry shared by both evaluations (P17a, D76)"
```

---

## Task 12: Resolvability and coverage

**Files:**
- Create: `lib/domain/concepts/resolve.ts`
- Test: `tests/unit/domain/concept-resolve.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/domain/concept-resolve.test.ts
import { describe, expect, it } from 'vitest';
import { EVALUATION_CONCEPTS } from '@/lib/domain/concepts/registry';
import { conceptCoverage, resolveConcept } from '@/lib/domain/concepts/resolve';
import type { FactSheet } from '@/lib/domain/facts/fact-sheet';

const resolvedAddress = {
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
  postcode_source: 'geography' as const,
  status: 'resolved' as const,
  issues: [],
};

/** A company with every fact in place and a learner who holds shares. */
function complete(): FactSheet {
  return {
    company_name_th: 'บริษัท ซินเนอร์จี แล็บ จำกัด',
    company_name_en: 'SYNERGY LAB CO., LTD.',
    juristic_id: '0455569000808',
    registered_on: '2026-04-16',
    registered_capital: 2_000_000,
    directors: [{ name_th: 'นางสาวกุลธิดา พลเยี่ยม', name_en: null }],
    signing_authority: 'กรรมการหนึ่งคนลงลายมือชื่อและประทับตรา',
    address: resolvedAddress,
    shareholders: [{ name: 'นางสาวกุลธิดา พลเยี่ยม', nationality: null, shares: 18_000, percent: 90 }],
    total_shares: 20_000,
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
    operations_started: true,
    has_existing_customers: true,
    has_completed_transactions: true,
    has_regular_suppliers: true,
    learner_is_shareholder: true,
    business_category: 'clothing_fashion',
    holder_name: 'นางสาวกุลธิดา พลเยี่ยม',
    position: 'กรรมการ',
    director_count: 1,
    shareholder_count: 1,
    my_shares: 18_000,
    my_share_percent: 90,
  };
}

const concept = (key: string) => EVALUATION_CONCEPTS.find((c) => c.key === key)!;

describe('conceptCoverage (spec §7.3, D74)', () => {
  it('counts a record on its company-level concepts only: 29/29 and 12/12, never 30 or 13', () => {
    const c = conceptCoverage(complete(), 'company');
    expect(c.mcq).toEqual({ ready: 29, total: 29 });
    expect(c.interview).toEqual({ ready: 12, total: 12 });
    expect(c.perLearner).toEqual(['learner_shareholding', 'attendee_identity']);
    expect(c.missingFacts).toEqual([]);
  });

  it('counts an assignment 30/30 and 13/13 once the role facts resolve', () => {
    const c = conceptCoverage(complete(), 'assignment');
    expect(c.mcq).toEqual({ ready: 30, total: 30 });
    expect(c.interview).toEqual({ ready: 13, total: 13 });
    expect(c.perLearner).toEqual([]);
  });

  it('keeps an assignment below 30/30 and 13/13 while a role fact is missing', () => {
    const c = conceptCoverage(
      {
        ...complete(),
        holder_name: null,
        learner_is_shareholder: null,
        my_shares: null,
        my_share_percent: null,
      },
      'assignment',
    );
    expect(c.mcq).toEqual({ ready: 29, total: 30 });
    expect(c.interview).toEqual({ ready: 12, total: 13 });
    expect(c.missingFacts).toEqual(['holder_name', 'learner_is_shareholder']);
  });

  it('is unchanged by a missing or low-confidence category (D73)', () => {
    expect(conceptCoverage({ ...complete(), business_category: null }, 'company')).toEqual(
      conceptCoverage(complete(), 'company'),
    );
  });

  it('keeps KYC policy concepts ready when every business fact is blank (D74)', () => {
    const facts = { ...complete(), products_services: null, main_clients: '  ' };
    for (const key of ['internet_banking_control', 'otp_control', 'answer_consistency']) {
      expect(resolveConcept(concept(key), facts, 'company').status).toBe('policy');
    }
  });

  it('names a blank fact and every concept that needs it', () => {
    const c = conceptCoverage({ ...complete(), products_services: '' }, 'company');
    expect(c.missingFacts).toEqual(['products_services']);
    expect(c.concepts.filter((x) => x.status === 'missing').map((x) => x.key)).toEqual([
      'products_services',
    ]);
    expect(c.mcq).toEqual({ ready: 28, total: 29 });
    expect(c.interview).toEqual({ ready: 11, total: 12 });
  });

  it('needs the address resolved to the subdistrict', () => {
    const facts = { ...complete(), address: { ...resolvedAddress, status: 'partial' as const } };
    expect(resolveConcept(concept('registered_location'), facts, 'company')).toEqual({
      key: 'registered_location',
      status: 'missing',
      missing: ['address'],
    });
  });

  it('needs the status fact behind an alternate wording', () => {
    const c = conceptCoverage({ ...complete(), has_existing_customers: null }, 'company');
    expect(c.missingFacts).toEqual(['has_existing_customers']);
    expect(c.concepts.filter((x) => x.status === 'missing').map((x) => x.key)).toEqual([
      'main_clients',
      'client_origin',
      'customer_examples',
      'customer_profile',
    ]);
  });

  it('treats a stated "no" as present', () => {
    const facts = { ...complete(), has_existing_customers: false };
    expect(resolveConcept(concept('customer_examples'), facts, 'company').status).toBe('resolved');
  });

  it('needs an amount when the learner holds shares, and none when they do not', () => {
    const noAmount = { ...complete(), my_shares: null, my_share_percent: null };
    expect(resolveConcept(concept('learner_shareholding'), noAmount, 'assignment')).toEqual({
      key: 'learner_shareholding',
      status: 'missing',
      missing: ['shareholders'],
    });
    const outsider = { ...noAmount, learner_is_shareholder: false };
    expect(resolveConcept(concept('learner_shareholding'), outsider, 'assignment').status).toBe(
      'resolved',
    );
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/concept-resolve.test.ts`
Expected: FAIL — cannot resolve `@/lib/domain/concepts/resolve`.

- [ ] **Step 3: Implement the resolver**

```ts
// lib/domain/concepts/resolve.ts
import type { FactKey, FactSheet } from '@/lib/domain/facts/fact-sheet';
import { EVALUATION_CONCEPTS, type ConceptDef } from './registry';

/**
 * resolved — every fact present; policy — a KYC_POLICY answer, always ready and never an
 * exception (D74); per_learner — a ROLE concept, which a company record never counts;
 * missing — facts named.
 */
export type ConceptStatus = 'resolved' | 'policy' | 'missing' | 'per_learner';
export type ConceptResolution = { key: string; status: ConceptStatus; missing: FactKey[] };
/**
 * company — a record or a training version: 29 MCQ and 12 chatbot company-level concepts.
 * assignment — one learner: all 30 and 13, their ROLE concepts included (D74).
 */
export type Scope = 'company' | 'assignment';
export type CoverageCount = { ready: number; total: number };
export type Coverage = {
  scope: Scope;
  mcq: CoverageCount;
  interview: CoverageCount;
  /** Company scope: the ROLE concepts left to each learner's assignment (not counted). */
  perLearner: string[];
  concepts: ConceptResolution[];
  /** Every fact some concept is missing, in registry order, once each. */
  missingFacts: FactKey[];
};

/** Present: text non-blank, list non-empty, a stated yes/no, a number set, an address resolved. */
export function isPresent(facts: FactSheet, key: FactKey): boolean {
  const value = facts[key];
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (key === 'address') return facts.address?.status === 'resolved';
  return true;
}

export function resolveConcept(
  def: ConceptDef,
  facts: FactSheet,
  scope: Scope,
): ConceptResolution {
  if (def.source === 'KYC_POLICY') return { key: def.key, status: 'policy', missing: [] };
  if (def.source === 'ROLE' && scope === 'company') {
    return { key: def.key, status: 'per_learner', missing: [] };
  }
  const missing: FactKey[] = [...def.facts, ...def.alternateWhen].filter(
    (k) => !isPresent(facts, k),
  );
  // A shareholder's holding needs an amount the list actually gives (spec §7.3).
  if (
    def.answer === 'shareholding' &&
    missing.length === 0 &&
    facts.learner_is_shareholder === true &&
    facts.my_shares === null &&
    facts.my_share_percent === null
  ) {
    missing.push('shareholders');
  }
  const unique = [...new Set(missing)];
  return { key: def.key, status: unique.length > 0 ? 'missing' : 'resolved', missing: unique };
}

/** A per-learner concept is neither ready nor counted at company scope (D74). */
function count(resolutions: ConceptResolution[]): CoverageCount {
  const counted = resolutions.filter((r) => r.status !== 'per_learner');
  return {
    ready: counted.filter((r) => r.status === 'resolved' || r.status === 'policy').length,
    total: counted.length,
  };
}

export function conceptCoverage(
  facts: FactSheet,
  scope: Scope,
  concepts: readonly ConceptDef[] = EVALUATION_CONCEPTS,
): Coverage {
  const resolutions = concepts.map((def) => resolveConcept(def, facts, scope));
  const of = (pick: (d: ConceptDef) => boolean) =>
    resolutions.filter((_, i) => pick(concepts[i]));
  const missingFacts: FactKey[] = [];
  for (const r of resolutions) {
    for (const f of r.missing) if (!missingFacts.includes(f)) missingFacts.push(f);
  }
  return {
    scope,
    mcq: count(of((d) => d.mcqOrder !== null)),
    interview: count(of((d) => d.interviewSlot !== null)),
    perLearner: resolutions.filter((r) => r.status === 'per_learner').map((r) => r.key),
    concepts: resolutions,
    missingFacts,
  };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/concept-resolve.test.ts`
Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/concepts/resolve.ts tests/unit/domain/concept-resolve.test.ts
git commit -m "feat(concepts): readiness per record (29/12) and per assignment (30/13) (P17a, D74)"
```

---

## Task 13: The record page — address, category, coverage, and the regrouped answers

**Files:**
- Create: `app/[locale]/(admin)/admin/dbd-records/[id]/address-panel.tsx`, `category-panel.tsx`, `coverage-panel.tsx`
- Modify: `app/[locale]/(admin)/admin/dbd-records/[id]/interview-form.tsx`, `.../[id]/page.tsx`, `messages/{th,en,zh}.json`

- [ ] **Step 1: Add the messages**

Merge these keys into `admin.dbd` of each file (keep existing keys; `interviewFields` and `interviewGroups` gain entries).

`messages/en.json`
```json
"legacyHint": "Written before the new evaluations; kept exactly as written and not used by them.",
"interviewFields": {
  "business_purpose": "Why was the company established?",
  "main_clients": "Main customers",
  "client_origin": "Where and how customers are found",
  "main_suppliers": "Main suppliers",
  "monthly_revenue": "Monthly revenue",
  "revenue_basis": "What the revenue figure is based on",
  "average_transaction": "Average amount per transaction",
  "monthly_transactions": "Transactions per month",
  "first_incoming_funds": "Where the first money into the account comes from, and why",
  "promptpay_qr_purpose": "Why the company needs PromptPay / QR",
  "customer_examples": "Examples of real customers",
  "customer_profile": "What kind of customers (type, in Thailand or abroad)",
  "transaction_details": "How past sales were paid (method, typical amounts)"
},
"interviewFieldsAlt": {
  "main_clients": "Expected main customers",
  "client_origin": "Where and how customers will be found",
  "customer_examples": "Expected target customers",
  "customer_profile": "What kind of customers are expected",
  "main_suppliers": "How products will be sourced (no regular suppliers yet)",
  "business_address": "Planned place of business",
  "monthly_revenue": "Expected monthly revenue",
  "revenue_basis": "What the expected revenue is based on",
  "average_transaction": "Expected amount per transaction",
  "monthly_transactions": "Expected transactions per month",
  "transaction_details": "Expected purchase and payment behaviour"
},
"interviewGroups": {
  "status": "Company status",
  "customers": "Customers and suppliers",
  "money": "Money and transactions",
  "banking": "The account",
  "legacy": "Earlier answers"
},
"statusFacts": {
  "hint": "These decide how some questions are asked (for example about expected rather than existing customers). They are never guessed.",
  "operations_started": "Has the company started operating?",
  "has_existing_customers": "Does it already have customers?",
  "has_completed_transactions": "Has it completed any sales?",
  "has_regular_suppliers": "Does it have regular suppliers?",
  "unset": "Not stated yet",
  "yes": "Yes",
  "no": "No"
},
"address": {
  "title": "Registered address (as read against Thai geography)",
  "status": {
    "resolved": "Resolved to the subdistrict",
    "partial": "Partly resolved — check the printed address",
    "unresolved": "Not resolved"
  },
  "issues": {
    "no_address": "No registered address yet",
    "province_not_found": "The province could not be found",
    "district_not_found": "The district could not be found in that province",
    "subdistrict_not_found": "The subdistrict could not be found in that district",
    "postcode_mismatch": "The printed postcode does not match the subdistrict"
  },
  "parts": {
    "house_no": "House no.",
    "moo": "Moo",
    "road": "Road",
    "subdistrict": "Subdistrict",
    "district": "District",
    "province": "Province",
    "postcode": "Postcode"
  },
  "postcodeFromGeography": "The postcode was not printed; it is the subdistrict's.",
  "notStoredYet": "Shown from the printed address; it is stored with the next save."
},
"category": {
  "title": "Business category",
  "auto": "chosen automatically ({confidence}% confidence)",
  "manual": "chosen by a person",
  "needsReview": "Needs a person: the best match is {candidate} ({confidence}% confidence)",
  "unmapped": "No category yet",
  "errors": {
    "no_text": "Write what the business does first",
    "not_configured": "Automatic mapping is switched off",
    "no_categories": "The category list is empty",
    "failed": "Automatic mapping failed; choose one or map again"
  },
  "choose": "Choose the category",
  "none": "Choose…",
  "set": "Use this category",
  "remap": "Map again automatically"
},
"coverage": {
  "title": "Evaluation readiness",
  "introCompany": "Company-level concepts that can already be asked about this company: 29 of the MCQ and 12 of the bank interview. Each learner's own concepts are checked on their page.",
  "introAssignment": "Everything this learner will be asked: all 30 MCQ concepts and all 13 bank-interview concepts, their own included.",
  "mcq": "MCQ",
  "interview": "Bank interview",
  "count": "{ready} of {total} ready",
  "perLearner": "Checked for each learner: {list}",
  "allReady": "Every concept has what it needs.",
  "missingFacts": "Still missing",
  "missingConcepts": "Concepts waiting: {list}"
},
"facts": {
  "company_name_th": "Company name (Thai)",
  "company_name_en": "Company name (English)",
  "juristic_id": "Juristic registration number",
  "registered_on": "Registration date",
  "registered_capital": "Registered capital",
  "directors": "Directors",
  "signing_authority": "Signing authority",
  "address": "Registered address (resolved)",
  "shareholders": "Shareholders (with holdings)",
  "total_shares": "Total shares",
  "nature_of_business": "What the business does",
  "products_services": "Products or services",
  "business_purpose": "Why the company was established",
  "main_clients": "Main customers",
  "client_origin": "Where customers come from",
  "main_suppliers": "Main suppliers",
  "business_address": "Actual place of business",
  "monthly_revenue": "Monthly revenue",
  "revenue_basis": "Basis of the revenue figure",
  "average_transaction": "Average transaction",
  "monthly_transactions": "Transactions per month",
  "source_of_funds": "Source of start-up capital",
  "first_incoming_funds": "First incoming funds",
  "account_purpose": "Why the company needs an account",
  "promptpay_qr_purpose": "Why PromptPay / QR",
  "customer_examples": "Customer examples",
  "customer_profile": "Customer profile",
  "transaction_details": "Transaction details",
  "operations_started": "Started operating?",
  "has_existing_customers": "Has customers?",
  "has_completed_transactions": "Completed sales?",
  "has_regular_suppliers": "Regular suppliers?",
  "learner_is_shareholder": "Learner is a shareholder?",
  "business_category": "Business category",
  "holder_name": "Learner's name as in the DBD documents",
  "position": "Learner's position",
  "director_count": "Number of directors",
  "shareholder_count": "Number of shareholders",
  "my_shares": "Learner's shares",
  "my_share_percent": "Learner's share percentage"
}
```

`messages/th.json`
```json
"legacyHint": "คำตอบที่บันทึกไว้ก่อนการประเมินแบบใหม่ เก็บไว้ตามที่เขียนและไม่ได้ใช้ในการประเมิน",
"interviewFields": {
  "business_purpose": "ตั้งบริษัทขึ้นเพื่ออะไร",
  "main_clients": "ลูกค้าหลัก",
  "client_origin": "หาลูกค้าจากที่ไหนและอย่างไร",
  "main_suppliers": "ซัพพลายเออร์หลัก",
  "monthly_revenue": "รายได้ต่อเดือน",
  "revenue_basis": "ตัวเลขรายได้นี้คิดจากอะไร",
  "average_transaction": "ยอดเงินเฉลี่ยต่อรายการ",
  "monthly_transactions": "จำนวนรายการต่อเดือน",
  "first_incoming_funds": "เงินก้อนแรกที่จะเข้าบัญชีมาจากไหนและเพื่ออะไร",
  "promptpay_qr_purpose": "ทำไมบริษัทต้องใช้พร้อมเพย์หรือ QR",
  "customer_examples": "ตัวอย่างลูกค้าจริง",
  "customer_profile": "ลูกค้าเป็นแบบใด (ประเภท ในประเทศหรือต่างประเทศ)",
  "transaction_details": "การขายที่ผ่านมาชำระเงินอย่างไร (ช่องทาง ยอดโดยทั่วไป)"
},
"interviewFieldsAlt": {
  "main_clients": "ลูกค้าหลักที่คาดว่าจะมี",
  "client_origin": "จะหาลูกค้าจากที่ไหนและอย่างไร",
  "customer_examples": "กลุ่มลูกค้าเป้าหมายที่คาดไว้",
  "customer_profile": "ลูกค้าที่คาดว่าจะมีเป็นแบบใด",
  "main_suppliers": "จะจัดหาสินค้าอย่างไร (ยังไม่มีซัพพลายเออร์ประจำ)",
  "business_address": "สถานที่ที่วางแผนจะประกอบกิจการ",
  "monthly_revenue": "รายได้ต่อเดือนที่คาดไว้",
  "revenue_basis": "รายได้ที่คาดไว้คิดจากอะไร",
  "average_transaction": "ยอดเงินต่อรายการที่คาดไว้",
  "monthly_transactions": "จำนวนรายการต่อเดือนที่คาดไว้",
  "transaction_details": "ลักษณะการซื้อและการชำระเงินที่คาดไว้"
},
"interviewGroups": {
  "status": "สถานะของบริษัท",
  "customers": "ลูกค้าและซัพพลายเออร์",
  "money": "เงินและธุรกรรม",
  "banking": "บัญชีธนาคาร",
  "legacy": "คำตอบเดิม"
},
"statusFacts": {
  "hint": "ข้อมูลเหล่านี้กำหนดวิธีถามบางข้อ (เช่น ถามถึงลูกค้าที่คาดว่าจะมีแทนลูกค้าปัจจุบัน) ระบบไม่เดาเอง",
  "operations_started": "บริษัทเริ่มดำเนินกิจการแล้วหรือยัง",
  "has_existing_customers": "มีลูกค้าแล้วหรือยัง",
  "has_completed_transactions": "มีการขายสำเร็จแล้วหรือยัง",
  "has_regular_suppliers": "มีซัพพลายเออร์ประจำหรือไม่",
  "unset": "ยังไม่ได้ระบุ",
  "yes": "ใช่",
  "no": "ไม่ใช่"
},
"address": {
  "title": "ที่อยู่ที่จดทะเบียน (ตรวจกับข้อมูลเขตการปกครอง)",
  "status": {
    "resolved": "ระบุได้ถึงระดับตำบล/แขวง",
    "partial": "ระบุได้บางส่วน กรุณาตรวจที่อยู่ตามเอกสาร",
    "unresolved": "ยังระบุไม่ได้"
  },
  "issues": {
    "no_address": "ยังไม่มีที่อยู่ที่จดทะเบียน",
    "province_not_found": "ไม่พบจังหวัดนี้",
    "district_not_found": "ไม่พบอำเภอ/เขตนี้ในจังหวัดดังกล่าว",
    "subdistrict_not_found": "ไม่พบตำบล/แขวงนี้ในอำเภอ/เขตดังกล่าว",
    "postcode_mismatch": "รหัสไปรษณีย์ตามเอกสารไม่ตรงกับตำบล/แขวง"
  },
  "parts": {
    "house_no": "เลขที่",
    "moo": "หมู่",
    "road": "ถนน",
    "subdistrict": "ตำบล/แขวง",
    "district": "อำเภอ/เขต",
    "province": "จังหวัด",
    "postcode": "รหัสไปรษณีย์"
  },
  "postcodeFromGeography": "เอกสารไม่ได้ระบุรหัสไปรษณีย์ ระบบใช้รหัสของตำบล/แขวง",
  "notStoredYet": "แสดงจากที่อยู่ตามเอกสาร จะบันทึกเมื่อกดบันทึกครั้งถัดไป"
},
"category": {
  "title": "หมวดธุรกิจ",
  "auto": "ระบบเลือกให้ (ความมั่นใจ {confidence}%)",
  "manual": "เลือกโดยเจ้าหน้าที่",
  "needsReview": "ต้องให้เจ้าหน้าที่ตรวจ: หมวดที่ใกล้ที่สุดคือ {candidate} (ความมั่นใจ {confidence}%)",
  "unmapped": "ยังไม่มีหมวดธุรกิจ",
  "errors": {
    "no_text": "กรุณากรอกว่าธุรกิจทำอะไรก่อน",
    "not_configured": "ปิดการจับคู่อัตโนมัติอยู่",
    "no_categories": "ยังไม่มีรายการหมวดธุรกิจ",
    "failed": "จับคู่อัตโนมัติไม่สำเร็จ กรุณาเลือกเองหรือจับคู่อีกครั้ง"
  },
  "choose": "เลือกหมวดธุรกิจ",
  "none": "เลือก…",
  "set": "ใช้หมวดนี้",
  "remap": "จับคู่อัตโนมัติอีกครั้ง"
},
"coverage": {
  "title": "ความพร้อมสำหรับการประเมิน",
  "introCompany": "แนวคิดระดับบริษัทที่ถามได้แล้วสำหรับบริษัทนี้: แบบทดสอบ 29 ข้อ และสัมภาษณ์ธนาคาร 12 ข้อ ส่วนแนวคิดเฉพาะของผู้เรียนตรวจในหน้าของผู้เรียนแต่ละคน",
  "introAssignment": "ทุกข้อที่ผู้เรียนคนนี้จะถูกถาม: แบบทดสอบครบ 30 ข้อ และสัมภาษณ์ธนาคารครบ 13 ข้อ รวมข้อเฉพาะของผู้เรียน",
  "mcq": "แบบทดสอบ",
  "interview": "สัมภาษณ์ธนาคาร",
  "count": "พร้อม {ready} จาก {total}",
  "perLearner": "ตรวจรายผู้เรียน: {list}",
  "allReady": "ทุกแนวคิดมีข้อมูลครบแล้ว",
  "missingFacts": "ยังขาด",
  "missingConcepts": "แนวคิดที่รอข้อมูล: {list}"
},
"facts": {
  "company_name_th": "ชื่อบริษัท (ไทย)",
  "company_name_en": "ชื่อบริษัท (อังกฤษ)",
  "juristic_id": "เลขทะเบียนนิติบุคคล",
  "registered_on": "วันที่จดทะเบียน",
  "registered_capital": "ทุนจดทะเบียน",
  "directors": "กรรมการ",
  "signing_authority": "อำนาจกรรมการลงนาม",
  "address": "ที่อยู่ที่จดทะเบียน (ระบุได้ครบ)",
  "shareholders": "ผู้ถือหุ้น (พร้อมจำนวนหุ้น)",
  "total_shares": "จำนวนหุ้นทั้งหมด",
  "nature_of_business": "ธุรกิจทำอะไร",
  "products_services": "สินค้าหรือบริการ",
  "business_purpose": "เหตุผลที่ตั้งบริษัท",
  "main_clients": "ลูกค้าหลัก",
  "client_origin": "ที่มาของลูกค้า",
  "main_suppliers": "ซัพพลายเออร์หลัก",
  "business_address": "สถานที่ประกอบกิจการจริง",
  "monthly_revenue": "รายได้ต่อเดือน",
  "revenue_basis": "ที่มาของตัวเลขรายได้",
  "average_transaction": "ยอดเฉลี่ยต่อรายการ",
  "monthly_transactions": "จำนวนรายการต่อเดือน",
  "source_of_funds": "ที่มาของเงินทุนเริ่มต้น",
  "first_incoming_funds": "เงินเข้าก้อนแรก",
  "account_purpose": "เหตุผลที่ต้องมีบัญชี",
  "promptpay_qr_purpose": "เหตุผลที่ใช้พร้อมเพย์หรือ QR",
  "customer_examples": "ตัวอย่างลูกค้า",
  "customer_profile": "ลักษณะลูกค้า",
  "transaction_details": "รายละเอียดการซื้อขาย",
  "operations_started": "เริ่มดำเนินกิจการแล้วหรือยัง",
  "has_existing_customers": "มีลูกค้าแล้วหรือยัง",
  "has_completed_transactions": "มีการขายสำเร็จแล้วหรือยัง",
  "has_regular_suppliers": "มีซัพพลายเออร์ประจำหรือไม่",
  "learner_is_shareholder": "ผู้เรียนเป็นผู้ถือหุ้นหรือไม่",
  "business_category": "หมวดธุรกิจ",
  "holder_name": "ชื่อผู้เรียนตามเอกสาร DBD",
  "position": "ตำแหน่งของผู้เรียน",
  "director_count": "จำนวนกรรมการ",
  "shareholder_count": "จำนวนผู้ถือหุ้น",
  "my_shares": "จำนวนหุ้นของผู้เรียน",
  "my_share_percent": "สัดส่วนหุ้นของผู้เรียน"
}
```

`messages/zh.json`
```json
"legacyHint": "新评估之前填写的答案，按原样保留，评估中不使用。",
"interviewFields": {
  "business_purpose": "公司为何成立？",
  "main_clients": "主要客户",
  "client_origin": "客户从哪里、如何获得",
  "main_suppliers": "主要供应商",
  "monthly_revenue": "月收入",
  "revenue_basis": "收入数字的依据",
  "average_transaction": "平均每笔交易金额",
  "monthly_transactions": "每月交易笔数",
  "first_incoming_funds": "首笔入账资金从哪里来、用途是什么",
  "promptpay_qr_purpose": "公司为何需要 PromptPay / QR",
  "customer_examples": "真实客户示例",
  "customer_profile": "客户类型（类别，国内或国外）",
  "transaction_details": "以往销售如何付款（方式、一般金额）"
},
"interviewFieldsAlt": {
  "main_clients": "预期的主要客户",
  "client_origin": "将从哪里、如何获得客户",
  "customer_examples": "预期的目标客户",
  "customer_profile": "预期的客户类型",
  "main_suppliers": "将如何采购商品（尚无固定供应商）",
  "business_address": "计划的经营地点",
  "monthly_revenue": "预期月收入",
  "revenue_basis": "预期收入的依据",
  "average_transaction": "预期每笔交易金额",
  "monthly_transactions": "预期每月交易笔数",
  "transaction_details": "预期的购买与付款方式"
},
"interviewGroups": {
  "status": "公司状况",
  "customers": "客户与供应商",
  "money": "资金与交易",
  "banking": "银行账户",
  "legacy": "以前的答案"
},
"statusFacts": {
  "hint": "这些决定部分问题的问法（例如询问预期客户而非现有客户），系统从不猜测。",
  "operations_started": "公司是否已开始经营？",
  "has_existing_customers": "是否已有客户？",
  "has_completed_transactions": "是否已有成交？",
  "has_regular_suppliers": "是否有固定供应商？",
  "unset": "尚未说明",
  "yes": "是",
  "no": "否"
},
"address": {
  "title": "注册地址（按泰国行政区划核对）",
  "status": {
    "resolved": "已解析到区/乡",
    "partial": "部分解析——请核对文件上的地址",
    "unresolved": "未能解析"
  },
  "issues": {
    "no_address": "尚无注册地址",
    "province_not_found": "找不到该府",
    "district_not_found": "在该府找不到该县/区",
    "subdistrict_not_found": "在该县/区找不到该乡/分区",
    "postcode_mismatch": "文件上的邮编与乡/分区不符"
  },
  "parts": {
    "house_no": "门牌号",
    "moo": "村（หมู่）",
    "road": "路",
    "subdistrict": "乡/分区",
    "district": "县/区",
    "province": "府",
    "postcode": "邮编"
  },
  "postcodeFromGeography": "文件未印邮编；此为该乡/分区的邮编。",
  "notStoredYet": "根据文件上的地址显示，下次保存时存储。"
},
"category": {
  "title": "业务类别",
  "auto": "自动选择（置信度 {confidence}%）",
  "manual": "由人员选择",
  "needsReview": "需要人员确认：最接近的是 {candidate}（置信度 {confidence}%）",
  "unmapped": "尚无类别",
  "errors": {
    "no_text": "请先填写业务内容",
    "not_configured": "自动匹配已关闭",
    "no_categories": "类别列表为空",
    "failed": "自动匹配失败，请手动选择或重新匹配"
  },
  "choose": "选择类别",
  "none": "请选择…",
  "set": "使用此类别",
  "remap": "重新自动匹配"
},
"coverage": {
  "title": "评估准备情况",
  "introCompany": "本公司已可提问的公司层面概念：选择题 29 个、银行面谈 12 个。学员本人的概念在各学员页面检查。",
  "introAssignment": "该学员将被问到的全部内容：选择题全部 30 个概念、银行面谈全部 13 个概念，包括其本人的概念。",
  "mcq": "选择题",
  "interview": "银行面谈",
  "count": "{total} 个中已就绪 {ready} 个",
  "perLearner": "按学员检查：{list}",
  "allReady": "所有概念的信息都已齐全。",
  "missingFacts": "仍缺少",
  "missingConcepts": "等待中的概念：{list}"
},
"facts": {
  "company_name_th": "公司名称（泰文）",
  "company_name_en": "公司名称（英文）",
  "juristic_id": "法人注册号",
  "registered_on": "注册日期",
  "registered_capital": "注册资本",
  "directors": "董事",
  "signing_authority": "签字权",
  "address": "注册地址（已解析）",
  "shareholders": "股东（含持股数）",
  "total_shares": "总股数",
  "nature_of_business": "业务内容",
  "products_services": "产品或服务",
  "business_purpose": "公司成立原因",
  "main_clients": "主要客户",
  "client_origin": "客户来源",
  "main_suppliers": "主要供应商",
  "business_address": "实际经营地点",
  "monthly_revenue": "月收入",
  "revenue_basis": "收入依据",
  "average_transaction": "平均交易额",
  "monthly_transactions": "每月交易笔数",
  "source_of_funds": "启动资金来源",
  "first_incoming_funds": "首笔入账资金",
  "account_purpose": "开户原因",
  "promptpay_qr_purpose": "使用 PromptPay / QR 的原因",
  "customer_examples": "客户示例",
  "customer_profile": "客户概况",
  "transaction_details": "交易详情",
  "operations_started": "是否已开始经营？",
  "has_existing_customers": "是否已有客户？",
  "has_completed_transactions": "是否已有成交？",
  "has_regular_suppliers": "是否有固定供应商？",
  "learner_is_shareholder": "学员是否为股东？",
  "business_category": "业务类别",
  "holder_name": "学员在 DBD 文件中的姓名",
  "position": "学员职位",
  "director_count": "董事人数",
  "shareholder_count": "股东人数",
  "my_shares": "学员持股数",
  "my_share_percent": "学员持股比例"
}
```

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/messages.test.ts`
Expected: pass (three files, same keys, none empty).

- [ ] **Step 2: Create the three panels**

```tsx
// app/[locale]/(admin)/admin/dbd-records/[id]/address-panel.tsx
import { useTranslations } from 'next-intl';
import type { RegisteredAddress } from '@/lib/domain/geo/resolve';

const PARTS = ['house_no', 'moo', 'road', 'subdistrict', 'district', 'province', 'postcode'] as const;

/** The registered address as the geography tables read it (spec §5.2): its parts, or why not. */
export function AddressPanel({ address, stored }: { address: RegisteredAddress; stored: boolean }) {
  const t = useTranslations('admin.dbd.address');
  const tone =
    address.status === 'resolved'
      ? 'staff-notice-ok'
      : address.status === 'partial'
        ? 'staff-notice-warn'
        : 'staff-notice-bad';
  return (
    <section
      className="staff-card grid max-w-2xl gap-3"
      data-testid="address-panel"
      data-status={address.status}
    >
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <p className={tone} data-testid="address-status">
        {t(`status.${address.status}` as 'status.resolved')}
      </p>
      {address.issues.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-warn-700" data-testid="address-issues">
          {address.issues.map((issue) => (
            <li key={issue}>{t(`issues.${issue}` as 'issues.no_address')}</li>
          ))}
        </ul>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {PARTS.map((part) => (
          <div key={part} className="contents">
            <dt className="text-ink-500">{t(`parts.${part}` as 'parts.house_no')}</dt>
            <dd data-testid={`address-${part}`}>{address[part] ?? '—'}</dd>
          </div>
        ))}
      </dl>
      {address.postcode_source === 'geography' && (
        <p className="text-sm text-ink-500">{t('postcodeFromGeography')}</p>
      )}
      {!stored && <p className="text-sm text-ink-500">{t('notStoredYet')}</p>}
    </section>
  );
}
```

```tsx
// app/[locale]/(admin)/admin/dbd-records/[id]/coverage-panel.tsx
import { useLocale, useTranslations } from 'next-intl';
import { conceptTitle } from '@/lib/domain/concepts/registry';
import type { Coverage } from '@/lib/domain/concepts/resolve';

/**
 * Which concepts can already be asked (spec §7.3, D74). A record counts its company-level
 * concepts (29 / 12) and names the learner's own as checked per learner; an assignment counts
 * all 30 / 13. Informational until P17c gates on it.
 */
export function CoveragePanel({
  coverage,
  testId = 'coverage-panel',
}: {
  coverage: Coverage;
  testId?: string;
}) {
  const t = useTranslations('admin.dbd.coverage');
  const tf = useTranslations('admin.dbd.facts');
  const locale = useLocale();
  const waiting = coverage.concepts.filter((c) => c.status === 'missing');
  return (
    <section
      className="staff-card grid max-w-2xl gap-3"
      data-testid={testId}
      data-scope={coverage.scope}
    >
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <p className="text-sm text-ink-500">
        {coverage.scope === 'company' ? t('introCompany') : t('introAssignment')}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm tabular-nums">
        <dt>{t('mcq')}</dt>
        <dd
          data-testid="coverage-mcq"
          data-ready={coverage.mcq.ready}
          data-total={coverage.mcq.total}
        >
          {t('count', { ready: coverage.mcq.ready, total: coverage.mcq.total })}
        </dd>
        <dt>{t('interview')}</dt>
        <dd
          data-testid="coverage-interview"
          data-ready={coverage.interview.ready}
          data-total={coverage.interview.total}
        >
          {t('count', { ready: coverage.interview.ready, total: coverage.interview.total })}
        </dd>
      </dl>
      {coverage.perLearner.length > 0 && (
        <p className="text-sm text-ink-500" data-testid="coverage-per-learner">
          {t('perLearner', {
            list: coverage.perLearner.map((k) => conceptTitle(k, locale)).join(', '),
          })}
        </p>
      )}
      {waiting.length === 0 ? (
        <p className="staff-notice-ok" data-testid="coverage-complete">
          {t('allReady')}
        </p>
      ) : (
        <div className="grid gap-1">
          <p className="text-sm font-semibold">{t('missingFacts')}</p>
          <ul className="list-disc pl-5 text-sm" data-testid="coverage-missing">
            {coverage.missingFacts.map((f) => (
              <li key={f} data-fact={f}>
                {tf(f as 'address')}
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink-500">
            {t('missingConcepts', {
              list: waiting.map((c) => conceptTitle(c.key, locale)).join(', '),
            })}
          </p>
        </div>
      )}
    </section>
  );
}
```

```tsx
// app/[locale]/(admin)/admin/dbd-records/[id]/category-panel.tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import type { CategoryAssignment } from '@/lib/domain/business-category';
import { remapBusinessCategoryAction, setBusinessCategoryAction, type ToolState } from '../actions';

export type CategoryOptionView = { key: string; label: string };

const initial: ToolState = { ok: false, error: null };
const KNOWN_ERRORS = ['no_text', 'not_configured', 'no_categories'] as const;

/**
 * The record's business category (spec §5.3): what was chosen and how, or the suggestion that
 * needs a person. Choosing holds until the business text changes; "map again" starts over.
 */
export function CategoryPanel({
  recordId,
  assignment,
  options,
}: {
  recordId: string;
  assignment: CategoryAssignment | null;
  options: CategoryOptionView[];
}) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd.category');
  const [setState, setAction, setting] = useActionState(setBusinessCategoryAction, initial);
  const [remapState, remapAction, remapping] = useActionState(remapBusinessCategoryAction, initial);
  const label = (key: string | null) => options.find((o) => o.key === key)?.label ?? key ?? '—';
  const pct = assignment?.confidence != null ? Math.round(assignment.confidence * 100) : 0;
  const status = assignment?.status ?? 'unmapped';
  const reason = assignment?.error;
  const reasonKey = (KNOWN_ERRORS as readonly string[]).includes(reason ?? '')
    ? (`errors.${reason}` as 'errors.no_text')
    : ('errors.failed' as const);

  return (
    <section
      className="staff-card grid max-w-2xl gap-3"
      data-testid="category-panel"
      data-status={status}
    >
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      {status === 'mapped' && assignment && (
        <p className="staff-notice-ok" data-testid="category-current">
          {label(assignment.key)} —{' '}
          {assignment.source === 'manual' ? t('manual') : t('auto', { confidence: pct })}
        </p>
      )}
      {status === 'needs_review' && assignment && (
        <p className="staff-notice-warn" data-testid="category-review">
          {t('needsReview', { candidate: label(assignment.candidate_key), confidence: pct })}
        </p>
      )}
      {status === 'unmapped' && (
        <p className="staff-notice-info" data-testid="category-unmapped">
          {reason ? t(reasonKey) : t('unmapped')}
        </p>
      )}
      <form action={setAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="id" value={recordId} />
        <label className="grid min-w-0 flex-1 gap-1 text-sm">
          {t('choose')}
          <select
            name="categoryKey"
            required
            defaultValue={assignment?.key ?? assignment?.candidate_key ?? ''}
            className="staff-input"
          >
            <option value="">{t('none')}</option>
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={setting} className="staff-btn" data-testid="category-set">
          {t('set')}
        </button>
      </form>
      <form action={remapAction}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="id" value={recordId} />
        <button
          type="submit"
          disabled={remapping}
          className="staff-btn-ghost"
          data-testid="category-remap"
        >
          {t('remap')}
        </button>
      </form>
      {(setState.error || remapState.error) && (
        <p role="alert" className="text-sm text-bad-600">
          {setState.error ?? remapState.error}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Replace the answers form**

Replace the whole of `app/[locale]/(admin)/admin/dbd-records/[id]/interview-form.tsx` with:

```tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import {
  COMPANY_STATUS_FACTS,
  LEGACY_INTERVIEW_FIELDS,
  type CompanyStatusFact,
  type InterviewProfile,
  type InterviewTextField,
  type YesNo,
} from '@/lib/domain/bank-interview';
import { saveInterviewAnswersAction, type ToolState } from '../actions';

const initial: ToolState = { ok: false, error: null };

type Field = { field: InterviewTextField; alt?: CompanyStatusFact };

/**
 * The manager's answers, grouped (spec §5.4). A field with `alt` is asked differently when its
 * status fact is "no" (for example expected rather than existing customers), and its label says
 * so the moment the status changes. The same mapping drives the registry's `alternateWhen`.
 */
const GROUPS: { key: 'customers' | 'money' | 'banking'; fields: Field[] }[] = [
  {
    key: 'customers',
    fields: [
      { field: 'business_purpose' },
      { field: 'main_clients', alt: 'has_existing_customers' },
      { field: 'client_origin', alt: 'has_existing_customers' },
      { field: 'customer_examples', alt: 'has_existing_customers' },
      { field: 'customer_profile', alt: 'has_existing_customers' },
      { field: 'main_suppliers', alt: 'has_regular_suppliers' },
      { field: 'business_address', alt: 'operations_started' },
    ],
  },
  {
    key: 'money',
    fields: [
      { field: 'monthly_revenue', alt: 'operations_started' },
      { field: 'revenue_basis', alt: 'operations_started' },
      { field: 'average_transaction', alt: 'has_completed_transactions' },
      { field: 'monthly_transactions', alt: 'has_completed_transactions' },
      { field: 'transaction_details', alt: 'has_completed_transactions' },
      { field: 'source_of_funds' },
      { field: 'first_incoming_funds' },
    ],
  },
  { key: 'banking', fields: [{ field: 'account_purpose' }, { field: 'promptpay_qr_purpose' }] },
];

/**
 * Level 4 — what the bank asks that no DBD document answers (D39, spec §5.4). Editable after
 * confirmation: these are the company's prepared answers, not certificate facts. The contact
 * details and what the business does live in the Level 1 card.
 */
export function InterviewForm({
  recordId,
  answers,
}: {
  recordId: string;
  answers: InterviewProfile;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd');
  const [state, formAction, pending] = useActionState(saveInterviewAnswersAction, initial);
  const [status, setStatus] = useState<Record<CompanyStatusFact, YesNo | null>>(
    () =>
      Object.fromEntries(COMPANY_STATUS_FACTS.map((f) => [f, answers[f]])) as Record<
        CompanyStatusFact,
        YesNo | null
      >,
  );
  const label = ({ field, alt }: Field) =>
    alt && status[alt] === 'no'
      ? t(`interviewFieldsAlt.${field}` as 'interviewFieldsAlt.main_clients')
      : t(`interviewFields.${field}` as 'interviewFields.account_purpose');

  return (
    <form
      action={formAction}
      className="staff-card grid max-w-2xl gap-4"
      data-testid="interview-answers"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={recordId} />
      <h2 className="text-sm font-semibold">{t('levels.interview')}</h2>
      <p className="text-sm text-ink-500">{t('interviewHint')}</p>

      <fieldset className="grid gap-3" data-testid="status-facts">
        <legend className="text-sm font-semibold text-ink-700">{t('interviewGroups.status')}</legend>
        <p className="text-sm text-ink-500">{t('statusFacts.hint')}</p>
        {COMPANY_STATUS_FACTS.map((fact) => (
          <label key={fact} className="text-sm">
            {t(`statusFacts.${fact}` as 'statusFacts.operations_started')}
            <select
              name={`interview_${fact}`}
              value={status[fact] ?? ''}
              onChange={(e) =>
                setStatus((s) => ({ ...s, [fact]: (e.target.value || null) as YesNo | null }))
              }
              className="staff-input mt-1"
              data-testid={`status-${fact}`}
            >
              <option value="">{t('statusFacts.unset')}</option>
              <option value="yes">{t('statusFacts.yes')}</option>
              <option value="no">{t('statusFacts.no')}</option>
            </select>
          </label>
        ))}
      </fieldset>

      {GROUPS.map((group) => (
        <fieldset key={group.key} className="grid gap-3 border-t pt-3">
          <legend className="text-sm font-semibold text-ink-700">
            {t(`interviewGroups.${group.key}` as 'interviewGroups.customers')}
          </legend>
          {group.fields.map((f) => (
            <label key={f.field} className="text-sm">
              <span data-testid={`label-${f.field}`}>{label(f)}</span>
              <textarea
                name={`interview_${f.field}`}
                rows={2}
                defaultValue={answers[f.field] ?? ''}
                className="staff-input mt-1"
              />
            </label>
          ))}
        </fieldset>
      ))}

      <details className="border-t pt-3" data-testid="legacy-answers">
        <summary className="min-h-11 cursor-pointer text-sm font-semibold text-ink-700">
          {t('interviewGroups.legacy')}
        </summary>
        <p className="text-sm text-ink-500">{t('legacyHint')}</p>
        {LEGACY_INTERVIEW_FIELDS.map((field) => (
          <label key={field} className="mt-2 block text-sm">
            {t(`interviewFields.${field}` as 'interviewFields.account_purpose')}
            <input
              name={`interview_${field}`}
              defaultValue={answers[field] ?? ''}
              className="staff-input mt-1"
            />
          </label>
        ))}
      </details>

      {state.error && (
        <p role="alert" className="text-sm text-bad-600">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" data-testid="interview-saved" className="text-sm text-ok-600">
          {t('saved')}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        data-testid="save-interview"
        className="staff-btn justify-self-start"
      >
        {t('saveInterview')}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Wire the panels into the record page**

In `app/[locale]/(admin)/admin/dbd-records/[id]/page.tsx` add the imports:

```ts
import { listBusinessCategories } from '@/lib/db/business-categories';
import { geoLookup } from '@/lib/db/geo';
import { conceptCoverage } from '@/lib/domain/concepts/resolve';
import { buildFactSheet } from '@/lib/domain/facts/fact-sheet';
import { resolveRegisteredAddress } from '@/lib/domain/geo/resolve';
import { AddressPanel } from './address-panel';
import { CategoryPanel } from './category-panel';
import { CoveragePanel } from './coverage-panel';
```

After `const t = await getTranslations('admin.dbd');` add:

```ts
  // Derived on the fly when not stored yet (a record saved before P17a); never written on a GET.
  const address =
    structured.address ??
    (await resolveRegisteredAddress(record.head_office_address, geoLookup(db)));
  const categories = await listBusinessCategories(db, { activeOnly: true });
  const labelOf = (c: (typeof categories)[number]) =>
    locale === 'en' ? c.label_en : locale === 'zh' ? c.label_zh : c.label_th;
  const coverage = conceptCoverage(
    buildFactSheet({ record, structured, address, role: null }),
    'company',
  );
```

Render the panels: `CoveragePanel` directly after `<RecordTools ... />`, and `AddressPanel` plus `CategoryPanel` directly before `<InterviewForm ... />`:

```tsx
      <CoveragePanel coverage={coverage} />
```

```tsx
      <AddressPanel address={address} stored={Boolean(structured.address)} />
      <CategoryPanel
        recordId={record.id}
        assignment={structured.category ?? null}
        options={categories.map((c) => ({ key: c.key, label: labelOf(c) }))}
      />
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit`
Expected: clean; unit suite passes.

Run the app (`pnpm dev`, fake providers: set `CATEGORY_MAP_PROVIDER=fake` in the shell) and open a record: the three panels render; changing "Does it already have customers?" to "No" relabels "Main customers" to "Expected main customers" before saving.

- [ ] **Step 6: Commit**

```bash
git add "app/[locale]/(admin)/admin/dbd-records/[id]" messages
git commit -m "feat(facts): the record page shows the address, the category and evaluation readiness (P17a)"
```

---

## Task 14: The Owner's business-categories page

**Files:**
- Create: `app/[locale]/(admin)/admin/business-categories/page.tsx`, `actions.ts`, `category-form.tsx`
- Modify: `components/staff/staff-nav.tsx`, `app/[locale]/(admin)/admin/page.tsx`, `lib/db/middleware.ts`, `messages/{th,en,zh}.json`

- [ ] **Step 1: Add the messages**

Add `admin.nav.businessCategories` and a new `admin.businessCategories` namespace:

`messages/en.json`
```json
"nav": { "businessCategories": "Business categories" },
"businessCategories": {
  "title": "Business categories",
  "intro": "The controlled list the automatic mapping chooses from and the MCQ draws business distractors from. Retire a category by switching it off; keys never change.",
  "key": "Key",
  "keyHint": "Lower-case letters, digits and _; permanent once created.",
  "labelTh": "Thai label",
  "labelEn": "English label",
  "labelZh": "Chinese label",
  "sortOrder": "Order",
  "active": "Active",
  "add": "Add category",
  "save": "Save",
  "saved": "Saved",
  "errors": {
    "duplicate": "That key already exists",
    "invalid": "Check the key and fill every label",
    "failed": "Could not save"
  }
}
```
`messages/th.json`
```json
"nav": { "businessCategories": "หมวดธุรกิจ" },
"businessCategories": {
  "title": "หมวดธุรกิจ",
  "intro": "รายการที่ระบบจับคู่อัตโนมัติเลือกใช้ และแบบทดสอบใช้สร้างตัวเลือกหลอกด้านธุรกิจ เลิกใช้หมวดใดให้ปิดการใช้งาน รหัสหมวดเปลี่ยนไม่ได้",
  "key": "รหัส",
  "keyHint": "ตัวอักษรภาษาอังกฤษพิมพ์เล็ก ตัวเลข และ _ เปลี่ยนไม่ได้หลังสร้าง",
  "labelTh": "ชื่อภาษาไทย",
  "labelEn": "ชื่อภาษาอังกฤษ",
  "labelZh": "ชื่อภาษาจีน",
  "sortOrder": "ลำดับ",
  "active": "ใช้งาน",
  "add": "เพิ่มหมวด",
  "save": "บันทึก",
  "saved": "บันทึกแล้ว",
  "errors": {
    "duplicate": "มีรหัสนี้แล้ว",
    "invalid": "กรุณาตรวจรหัสและกรอกชื่อให้ครบทุกภาษา",
    "failed": "บันทึกไม่สำเร็จ"
  }
}
```
`messages/zh.json`
```json
"nav": { "businessCategories": "业务类别" },
"businessCategories": {
  "title": "业务类别",
  "intro": "自动匹配从此受控列表中选择，选择题也从中生成业务干扰项。停用类别请将其关闭；代码永不更改。",
  "key": "代码",
  "keyHint": "小写字母、数字和 _；创建后不可更改。",
  "labelTh": "泰文名称",
  "labelEn": "英文名称",
  "labelZh": "中文名称",
  "sortOrder": "顺序",
  "active": "启用",
  "add": "添加类别",
  "save": "保存",
  "saved": "已保存",
  "errors": {
    "duplicate": "该代码已存在",
    "invalid": "请检查代码并填写所有名称",
    "failed": "无法保存"
  }
}
```

(`nav` already exists: add the one key inside it.)

- [ ] **Step 2: Actions and forms**

```ts
// app/[locale]/(admin)/admin/business-categories/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import {
  businessCategoryInputSchema,
  createBusinessCategory,
  updateBusinessCategory,
} from '@/lib/db/business-categories';
import { createSupabaseServerClient } from '@/lib/db/server';

export type CategoryFormState = { ok: boolean; error: 'duplicate' | 'invalid' | 'failed' | null };

function fields(formData: FormData) {
  return {
    key: String(formData.get('key') ?? ''),
    label_th: String(formData.get('label_th') ?? ''),
    label_en: String(formData.get('label_en') ?? ''),
    label_zh: String(formData.get('label_zh') ?? ''),
    sort_order: String(formData.get('sort_order') ?? '0'),
    active: formData.get('active') === 'on',
  };
}

/** Owner only (D73); written through the Owner's session so the audit names them (D30). */
export async function createCategoryAction(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const locale = String(formData.get('locale') ?? 'th');
  await requireAdmin(locale);
  const parsed = businessCategoryInputSchema.safeParse({ ...fields(formData), active: true });
  if (!parsed.success) return { ok: false, error: 'invalid' };
  try {
    await createBusinessCategory(await createSupabaseServerClient(), parsed.data);
    revalidatePath(`/${locale}/admin/business-categories`);
    return { ok: true, error: null };
  } catch (e) {
    const code = (e as { code?: string }).code;
    return { ok: false, error: code === '23505' ? 'duplicate' : 'failed' };
  }
}

export async function updateCategoryAction(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const locale = String(formData.get('locale') ?? 'th');
  await requireAdmin(locale);
  const parsed = businessCategoryInputSchema.safeParse(fields(formData));
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const { key, ...rest } = parsed.data;
  try {
    await updateBusinessCategory(await createSupabaseServerClient(), key, rest);
    revalidatePath(`/${locale}/admin/business-categories`);
    return { ok: true, error: null };
  } catch {
    return { ok: false, error: 'failed' };
  }
}
```

```tsx
// app/[locale]/(admin)/admin/business-categories/category-form.tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import type { BusinessCategoryRow } from '@/lib/db/business-categories';
import { createCategoryAction, updateCategoryAction, type CategoryFormState } from './actions';

const initial: CategoryFormState = { ok: false, error: null };

function Labels({ category }: { category?: BusinessCategoryRow }) {
  const t = useTranslations('admin.businessCategories');
  return (
    <>
      <label className="text-sm">
        {t('labelTh')}
        <input name="label_th" required defaultValue={category?.label_th ?? ''} className="staff-input mt-1" />
      </label>
      <label className="text-sm">
        {t('labelEn')}
        <input name="label_en" required defaultValue={category?.label_en ?? ''} className="staff-input mt-1" />
      </label>
      <label className="text-sm">
        {t('labelZh')}
        <input name="label_zh" required defaultValue={category?.label_zh ?? ''} className="staff-input mt-1" />
      </label>
      <label className="text-sm">
        {t('sortOrder')}
        <input
          name="sort_order"
          type="number"
          min={0}
          max={10000}
          defaultValue={category?.sort_order ?? 0}
          className="staff-input mt-1 tabular-nums"
        />
      </label>
    </>
  );
}

function Result({ state }: { state: CategoryFormState }) {
  const t = useTranslations('admin.businessCategories');
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-bad-600">
        {t(`errors.${state.error}` as 'errors.failed')}
      </p>
    );
  }
  return state.ok ? (
    <p role="status" className="text-sm text-ok-600">
      {t('saved')}
    </p>
  ) : null;
}

export function NewCategoryForm() {
  const locale = useLocale();
  const t = useTranslations('admin.businessCategories');
  const [state, action, pending] = useActionState(createCategoryAction, initial);
  return (
    <form action={action} className="staff-card grid max-w-2xl gap-3" data-testid="category-new">
      <input type="hidden" name="locale" value={locale} />
      <label className="text-sm">
        {t('key')}
        <input name="key" required pattern="[a-z][a-z0-9_]{1,59}" className="staff-input mt-1 font-mono" />
        <span className="block text-sm text-ink-500">{t('keyHint')}</span>
      </label>
      <Labels />
      <Result state={state} />
      <button type="submit" disabled={pending} className="staff-btn justify-self-start" data-testid="category-add">
        {t('add')}
      </button>
    </form>
  );
}

export function CategoryRowForm({ category }: { category: BusinessCategoryRow }) {
  const locale = useLocale();
  const t = useTranslations('admin.businessCategories');
  const [state, action, pending] = useActionState(updateCategoryAction, initial);
  return (
    <form
      action={action}
      className="staff-card grid gap-3 md:grid-cols-2"
      data-testid={`category-${category.key}`}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="key" value={category.key} />
      <p className="font-mono text-sm md:col-span-2">{category.key}</p>
      <Labels category={category} />
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={category.active} className="size-5" />
        {t('active')}
      </label>
      <div className="grid gap-1 md:col-span-2">
        <Result state={state} />
        <button type="submit" disabled={pending} className="staff-btn-ghost justify-self-start">
          {t('save')}
        </button>
      </div>
    </form>
  );
}
```

```tsx
// app/[locale]/(admin)/admin/business-categories/page.tsx
import { getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/auth/session';
import { listBusinessCategories } from '@/lib/db/business-categories';
import { createSupabaseServerClient } from '@/lib/db/server';
import { CategoryRowForm, NewCategoryForm } from './category-form';

/** The Owner's business-category dictionary (spec §5.3, D73). */
export default async function BusinessCategoriesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireAdmin(locale);
  const categories = await listBusinessCategories(await createSupabaseServerClient());
  const t = await getTranslations('admin.businessCategories');
  return (
    <section className="grid gap-6">
      <h1 className="staff-title">{t('title')}</h1>
      <p className="staff-intro">{t('intro')}</p>
      <NewCategoryForm />
      <ul className="grid gap-3" data-testid="category-list">
        {categories.map((c) => (
          <li key={c.key}>
            <CategoryRowForm category={c} />
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3: Nav, hub and guard**

`components/staff/staff-nav.tsx` — in the `system` group, before `settings`:

```ts
      { href: '/admin/business-categories', key: 'businessCategories', adminOnly: true },
```

`app/[locale]/(admin)/admin/page.tsx` — add to `ADMIN_LINKS`:

```ts
  ['/admin/business-categories', 'businessCategories'],
```

`lib/db/middleware.ts` — add to `GUARDS` before `{ prefix: '/admin', role: 'staff' }`:

```ts
  { prefix: '/admin/business-categories', role: 'admin' },
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/(admin)/admin/business-categories" components/staff/staff-nav.tsx "app/[locale]/(admin)/admin/page.tsx" lib/db/middleware.ts messages
git commit -m "feat(facts): the Owner edits the business-category dictionary (P17a, D73)"
```

---

## Task 15: The user page shows assignment readiness

**Files:**
- Modify: `app/[locale]/(admin)/admin/users/[id]/page.tsx`

- [ ] **Step 1: Wire the coverage**

Add the imports:

```ts
import { conceptCoverage } from '@/lib/domain/concepts/resolve';
import { buildFactSheet } from '@/lib/domain/facts/fact-sheet';
import { CoveragePanel } from '../../dbd-records/[id]/coverage-panel';
```

After `const people = ...;` add:

```ts
  // Assignment scope (spec §7.3): the ROLE concepts are checked for this learner.
  const coverage = active
    ? (() => {
        const structured = readStructuredData(active.dbd_records.structured_data);
        return conceptCoverage(
          buildFactSheet({
            record: active.dbd_records,
            structured,
            address: structured.address ?? null,
            role: {
              holder_name: active.holder_name,
              position: active.position,
              responsibilities: active.responsibilities,
              relationship_to_shareholders: active.relationship_to_shareholders,
            },
          }),
          'assignment',
        );
      })()
    : null;
```

Render it after `<RoleForm ... />` (inside the `active &&` block, or right after it):

```tsx
      {coverage && <CoveragePanel coverage={coverage} testId="assignment-coverage" />}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "app/[locale]/(admin)/admin/users/[id]/page.tsx"
git commit -m "feat(facts): the user page shows readiness for the learner's own concepts (P17a)"
```

---

## Task 16: End-to-end

**Files:**
- Create: `tests/e2e/facts-and-concepts.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/facts-and-concepts.spec.ts
import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { createManager, fillBusinessAnswers, loginAs, openManualRecordForm, switchTo } from './helpers';

const ROI_ET = 'เลขที่ 87 หมู่ที่ 9 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด';

test('a record reads its address, maps its category, and shows what is still missing', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await openManualRecordForm(page);
  await page.locator('input[name="company_name_th"]').fill(`บริษัท ข้อเท็จจริง ${Date.now()} จำกัด`);
  await page.locator('input[name="juristic_id"]').fill('0105568233720');
  await page.locator('input[name="head_office_address"]').fill(ROI_ET);
  await page.getByRole('button', { name: 'บันทึก' }).first().click();
  await page.waitForURL(/\/th\/admin\/dbd-records\/[0-9a-f-]{36}$/);

  // The address resolved against the geography tables, postcode taken from the subdistrict.
  await expect(page.getByTestId('address-panel')).toHaveAttribute('data-status', 'resolved');
  await expect(page.getByTestId('address-district')).toHaveText('โพนทอง');
  await expect(page.getByTestId('address-postcode')).toHaveText('45110');

  // A record counts its company-level concepts only (D74): 29 and 12, the learner's own named
  // as checked per learner.
  await expect(page.getByTestId('coverage-panel')).toHaveAttribute('data-scope', 'company');
  await expect(page.getByTestId('coverage-mcq')).toHaveAttribute('data-total', '29');
  await expect(page.getByTestId('coverage-interview')).toHaveAttribute('data-total', '12');
  await expect(page.getByTestId('coverage-per-learner')).toContainText('หุ้นที่ผู้เรียนถือ');

  // No business text yet: no category, and the coverage names what is missing.
  await expect(page.getByTestId('category-panel')).toHaveAttribute('data-status', 'unmapped');
  await expect(page.locator('[data-testid="coverage-missing"] [data-fact="nature_of_business"]')).toBeVisible();

  // The Level 1 business answers map the category through the fake mapper.
  await fillBusinessAnswers(page);
  await page.reload();
  await expect(page.getByTestId('category-panel')).toHaveAttribute('data-status', 'mapped');
  await expect(page.getByTestId('category-current')).toContainText('เสื้อผ้า');

  // A status fact relabels its fields at once, and saving it clears it from "missing".
  await expect(
    page.locator('[data-testid="coverage-missing"] [data-fact="has_existing_customers"]'),
  ).toBeVisible();
  await page.getByTestId('status-has_existing_customers').selectOption('no');
  await expect(page.getByTestId('label-customer_examples')).toHaveText('กลุ่มลูกค้าเป้าหมายที่คาดไว้');
  await page.getByTestId('save-interview').click();
  await expect(page.getByTestId('interview-saved')).toBeVisible();
  await page.reload();
  await expect(
    page.locator('[data-testid="coverage-missing"] [data-fact="has_existing_customers"]'),
  ).toHaveCount(0);
  // The category survived the answers save.
  await expect(page.getByTestId('category-panel')).toHaveAttribute('data-status', 'mapped');
});

test('only the Owner edits business categories', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const key = `e2e_${Date.now()}`;
  await page.goto('/th/admin/business-categories');
  const form = page.getByTestId('category-new');
  await form.locator('input[name="key"]').fill(key);
  await form.locator('input[name="label_th"]').fill('หมวดทดสอบ');
  await form.locator('input[name="label_en"]').fill('Test category');
  await form.locator('input[name="label_zh"]').fill('测试类别');
  await page.getByTestId('category-add').click();
  await expect(page.getByTestId(`category-${key}`)).toBeVisible();

  const code = await createManager(page, 'ผู้จัดการหมวดธุรกิจ', 'Manager-Password-1!');
  await switchTo(page, code.toLowerCase(), 'Manager-Password-1!');
  await page.goto('/th/admin/business-categories');
  await expect(page).toHaveURL(/\/th\/admin$/);
  await expect(page.getByTestId('staff-nav')).not.toContainText('หมวดธุรกิจ');
});
```

> `fillBusinessAnswers` (tests/e2e/helpers.ts) fills nature "ขายเสื้อผ้าออนไลน์" and products "เสื้อผ้าสตรีนำเข้า" on the Level 1 form and waits for "บันทึกแล้ว"; the fake mapper maps that to `clothing_fashion` at 0.95. If the record form's first "บันทึก" button is not the Level 1 save, target it with `page.locator('form:has(input[name="juristic_id"])').getByRole('button', { name: 'บันทึก' })`.

- [ ] **Step 2: Run it**

Run: `pnpm exec playwright test tests/e2e/facts-and-concepts.spec.ts --reporter=line`
Expected: 2 passed.

- [ ] **Step 3: Run the specs that touch the record and admin pages**

Run: `pnpm exec playwright test tests/e2e/admin-dbd.spec.ts tests/e2e/extraction.spec.ts tests/e2e/bank-interview.spec.ts tests/e2e/staff-shell.spec.ts tests/e2e/manager-access.spec.ts --reporter=line`
Expected: all pass. A spec that looked for the old answers inputs by `name="interview_<field>"` still finds them (names are unchanged).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/facts-and-concepts.spec.ts
git commit -m "test(facts): address, category and readiness end to end (P17a)"
```

---

## Task 17: Documentation and the full gate

**Files:**
- Modify: `docs/decisions-log.md`, `docs/security-checklist.md`, `docs/runbooks/production-setup.md`, `docs/runbooks/operations.md`, `docs/uat-script.md`, `README.md`

- [ ] **Step 1: Decisions D70–D79**

Append ten rows to the table in `docs/decisions-log.md`, one per decision in spec §3, in the existing format (`| 2026-09-30 | D70 | … | Owner | … |`). Use the spec's wording (shortened to one paragraph each, keeping the five corrections: the name card before the appointment in D70, category mapping as non-blocking metadata in D73, the two readiness scopes in D74, Owner-only assessment content superseding D54 in D76, the confirmed `alt` conditions in the registry) and put "spec 2026-09-30 §3; implemented from P17a (D73, D74, D76) and in P17b–P17i" in the last column. D73 names the P17a files: `lib/domain/geo/`, `lib/db/derived-facts.ts`, `lib/integrations/category-map/`, migrations `20261001010000`/`20261001020000`. D76 names `lib/domain/concepts/registry.ts` and migration `20261001030000`. Add to the existing D54 row, at the end of its decision text: "Superseded for the MCQ bank, chatbot scripts and business categories by D76 (P17): the Owner writes, managers read; study cards unchanged."

- [ ] **Step 2: Security checklist**

Add rows to `docs/security-checklist.md`:

```markdown
| 24 | Reference data (Thai geography, the concept registry) is written only by migrations; any signed-in user reads the geography, only staff read the registry | ✅ | `tests/integration/geo.test.ts`, `tests/integration/evaluation-concepts.test.ts` |
| 25 | The business-category dictionary is edited only by the Owner, through their own session so the audit names them; managers read it; learners see nothing | ✅ | `tests/integration/business-categories.test.ts`, `tests/e2e/facts-and-concepts.spec.ts` |
| 26 | Automatic category mapping sends only the manager's business text and the category labels to Anthropic (same processor as extraction); a mapping below the threshold is never used as the category, and a mapper failure never fails a save or an extraction | ✅ | `tests/unit/integrations/category-map.test.ts`, `tests/unit/domain/business-category.test.ts`, `tests/integration/derived-facts.test.ts` |
| 27 | Assessment content is Owner-written (D76, superseding D54): business categories and the concept registry from P17a; the MCQ bank from P17d; the chatbot script from P17f. Managers read it | ⏳ partly | P17a: `tests/integration/business-categories.test.ts`, `tests/integration/evaluation-concepts.test.ts`; the rest lands with P17d/P17f |
```

- [ ] **Step 3: Runbooks, UAT, README**

- `docs/runbooks/production-setup.md` §2 env table: add a row `CATEGORY_MAP_PROVIDER` — "`claude` (or unset with the Anthropic key); maps `nature_of_business` to a business category (P17a)". §1: note that migration `20261001010000` is about 0.7 MB (the Thai geography) and runs once.
- `docs/runbooks/operations.md` Incidents table: add "Category stays 'needs a person'" → first check `/api/health` `categoryMap`; fix: choose the category on the record page, or raise/lower `business_category_min_confidence_percent` in Settings.
- `docs/uat-script.md` section A: add "A13 Address and category — create a record with a real printed address and business text → the address panel shows each part and the postcode; the category is chosen automatically, or offered for review with its confidence; the coverage panel names what is still missing."
- `README.md`: `(D1–D69)` → `(D1–D79)`.

- [ ] **Step 4: Full gate**

Run each and expect success:

```bash
pnpm lint
```
```bash
pnpm typecheck
```
```bash
pnpm format:check
```
```bash
pnpm test:unit
```
```bash
pnpm test:integration
```
```bash
pnpm build
```
```bash
pnpm check:secrets
```
```bash
pnpm test:e2e
```

If `pnpm format:check` fails, run `pnpm format` and commit the result.

- [ ] **Step 5: Commit**

```bash
git add docs README.md
git commit -m "docs: D70–D79, the P17a checklist rows, runbooks and UAT (P17a)"
```

---

## Self-review against the spec

| Spec §13 item | Task |
| --- | --- |
| 1 Geography tables and generator | 1 |
| 2 Parser, resolver, lookup | 2, 3 |
| 3 `address` / `category` through `readStructuredData` | 4 (and asserted in 8) |
| 4 `refreshDerivedFacts` after saves, extraction, transcripts | 8, 9 |
| 5 Expanded profile, status facts, regrouped form, legacy kept | 5, 13 |
| 6 Categories table, seed, Owner page, mapper, threshold, category panel | 6, 7, 8, 13, 14 |
| 7 Registry table mirrored by TS, held equal by a test | 11 |
| 8 Fact sheet and resolvability | 10, 12 |
| 9 Coverage on the record and user pages | 13, 15 |
| 10 D70–D79 and docs | 17 |
| Acceptance: Roi Et 45110, Bangkok, unknown district reported | 2, 3, 16 |
| Acceptance: saves keep address and category | 4, 8, 16 |
| Acceptance: fake mapping above/below threshold; manual choice holds | 7, 8 |
| Acceptance: permissions on categories, concepts, geography (Owner-only content, D76) | 1, 6, 11, 16 |
| Acceptance: 30 / 13 / 9 and parity; `alt` exactly as confirmed | 11 |
| Acceptance: record 29/29 and 12/12 with the two ROLE concepts per learner; assignment 30/30 and 13/13 only once role facts resolve; blank field named | 12, 13, 15, 16 |
| Acceptance: a missing or low-confidence category changes no count and fails no save or extraction | 8, 12 |
