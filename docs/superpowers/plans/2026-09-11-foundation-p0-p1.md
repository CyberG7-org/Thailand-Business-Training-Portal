# Foundation P0 + P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the portal's foundation — Next.js app, local Supabase stack, test harness, CI — and deliver P1: provisioned login, admin user management, DBD records with PDF upload and confirmation, one-active-assignment per learner, the DBD Issue Date + 45-day eligibility snapshot, and database-enforced learner isolation.

**Architecture:** One Next.js App Router application (locale-prefixed routes from day one) talking to Supabase Postgres/Auth/Storage. Row-Level Security scopes every learner query; admins pass `is_admin()`. Pure business logic lives in `lib/domain` (TDD, no I/O); eligibility is *also* enforced by a Postgres trigger so the database is the source of truth and the TypeScript mirror is verified against it by an integration test. Audit rows are written by triggers using `auth.uid()`, so admin server actions run with the admin's own session client, never the service role.

**Tech Stack:** Node 24, pnpm 11, Next.js (App Router, TypeScript), Tailwind CSS, next-intl, Supabase (`@supabase/supabase-js`, `@supabase/ssr`, `supabase` CLI via Docker), zod, Vitest, Playwright, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-11-thailand-training-portal-foundation-design.md` (sections 2–6, 11 partially, 13). Business decisions: `docs/decisions-log.md`.

## Global Constraints

- Locales are exactly `th`, `en`, `zh` (Simplified Chinese); default locale `th`; HTML `lang` for `zh` is `zh-Hans` (spec §7, D8).
- Business-facing "today" is always `todayInBangkok()`; business dates are Postgres `date`, instants are `timestamptz` UTC (D12).
- Eligibility rule: `available_from = issued_on + 45 calendar days`, `issued_on` = certificate "Issued on" date (D2, BR-002). Example: `2026-09-11` → `2026-10-26` (AC-001).
- No self-registration: Supabase `enable_signup = false`; accounts are created only through the admin API. Login ID maps to internal email `<login_id>@learner.portal.internal` (spec §4.1).
- Failed login returns one generic message; it never reveals whether the account exists (AUTH-004).
- Service-role key is used only in `lib/db/admin.ts` (server-only) for provisioning, config reads, signed URLs; never in client components (spec §3.3).
- Every table has RLS enabled; every learner-facing table gets a negative test (learner A must not read/write learner B) (spec §5, §13).
- Only `extraction_status = 'confirmed'` DBD records can be assigned; a learner has at most one active assignment (spec §4.2).
- Missing DBD data is never fabricated; a confirmed record may lack `issued_on` and then has no eligibility snapshot and is flagged (spec §12).
- Real sample documents in `../thailand dbd 10-9/` contain PII and must never be copied into the repo (`.gitignore` blocks `*.pdf`, `*.xlsx`).
- Conventional commits; one commit per task step that says "Commit".
- Prerequisites on the dev machine: Node 24, pnpm 11, Docker Desktop **running** (local Supabase), `gh` CLI (optional, for CI).

---

## File structure (what this plan creates)

```
thailand-training-portal/
  package.json, pnpm-lock.yaml, next.config.ts, tsconfig.json, tailwind config (from create-next-app)
  .prettierrc, .env.example, README.md
  vitest.config.ts                 unit tests   (tests/unit)
  vitest.integration.config.ts     integration  (tests/integration, needs local Supabase)
  playwright.config.ts             e2e          (tests/e2e)
  middleware.ts                    locale routing + Supabase session refresh + route guards
  i18n/routing.ts, i18n/navigation.ts, i18n/request.ts
  messages/th.json, messages/en.json, messages/zh.json
  app/[locale]/layout.tsx          root layout (html lang, intl provider)
  app/[locale]/page.tsx            redirects to /login or /dashboard
  app/[locale]/(auth)/login/{page.tsx,actions.ts,login-form.tsx}
  app/[locale]/(learner)/layout.tsx           requires learner session
  app/[locale]/(learner)/dashboard/page.tsx   P1 version: my company + eligibility
  app/[locale]/(admin)/layout.tsx             requires admin
  app/[locale]/(admin)/admin/page.tsx
  app/[locale]/(admin)/admin/users/{page.tsx,actions.ts,new-user-form.tsx}
  app/[locale]/(admin)/admin/users/[id]/{page.tsx,actions.ts,assignment-panel.tsx}
  app/[locale]/(admin)/admin/dbd-records/{page.tsx,actions.ts}
  app/[locale]/(admin)/admin/dbd-records/new/page.tsx
  app/[locale]/(admin)/admin/dbd-records/[id]/{page.tsx,dbd-record-form.tsx}
  lib/domain/thai-date.ts          ISODate, todayInBangkok, addCalendarDays, BE<->CE, parseDateInput, formatDate
  lib/domain/eligibility.ts        availableFrom, isBankStageOpen
  lib/domain/dbd-record.ts         zod schema + missingFieldsForConfirmation
  lib/auth/internal-email.ts       loginIdToEmail, LOGIN_ID_PATTERN
  lib/auth/session.ts              getCurrentUser, requireUser, requireAdmin
  lib/db/env.ts                    validated env
  lib/db/server.ts                 cookie-bound server client (RLS as the signed-in user)
  lib/db/admin.ts                  service-role client (server-only)
  lib/db/middleware.ts             updateSession()
  lib/db/database.types.ts         generated by `pnpm db:types`
  lib/db/provisioning.ts           createAccount, setAccountPassword, setAccountStatus
  lib/db/dbd-records.ts            list/get/create/update/confirm/uploadDocument
  lib/db/assignments.ts            assignDbdRecord, deactivateAssignment, getActiveAssignmentForUser, getLatestEligibility
  lib/db/learner.ts                getMyCompany, getMyEligibility, createMyDocumentSignedUrl
  lib/config/policy.ts             typed policy_config reader with defaults
  supabase/config.toml             enable_signup = false
  supabase/migrations/20260911000001_identity.sql
  supabase/migrations/20260911000002_dbd_records.sql
  supabase/migrations/20260911000003_assignments_eligibility.sql
  scripts/write-local-env.mjs      supabase status -> .env.local
  scripts/check-client-secrets.mjs fails if the service key leaks into .next/static
  tests/unit/**                    domain + messages tests
  tests/integration/helpers.ts     createTestUser, clientFor, adminClient, deleteTestUser
  tests/integration/**.test.ts     RLS, triggers, provisioning, parity
  tests/e2e/global-setup.ts, tests/e2e/*.spec.ts
  .github/workflows/ci.yml
  docs/adr/0001-0005-*.md
```

---

## P0 — Repository & standards

### Task 1: Scaffold the Next.js app with formatting, scripts and env template

**Files:**
- Create: everything `create-next-app` generates (`app/`, `package.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `eslint.config.mjs`, `public/`)
- Create: `.prettierrc`, `.env.example`, `README.md`
- Modify: `.gitignore` (re-apply our rules after scaffolding), `package.json` scripts

**Interfaces:**
- Produces: `pnpm dev | build | lint | typecheck | format` scripts used by every later task.

- [ ] **Step 1: Scaffold in place** (the repo already exists with `docs/` and `.gitignore`; `create-next-app` accepts those)

Run from the repo root:

```bash
pnpm dlx create-next-app@latest . --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-pnpm --yes
```

Expected: `package.json`, `app/layout.tsx`, `app/page.tsx`, `next.config.ts` exist; `pnpm install` has run.

- [ ] **Step 2: Restore the repo `.gitignore`** (create-next-app may overwrite it). Set its full content to:

```gitignore
# dependencies / build
node_modules/
.next/
out/
build/
coverage/
playwright-report/
test-results/
*.tsbuildinfo
next-env.d.ts

# environment & secrets
.env
.env.*
!.env.example

# supabase local
supabase/.branches/
supabase/.temp/

# editor / os
.DS_Store
Thumbs.db
.idea/
.vscode/*
!.vscode/extensions.json

# never commit real business documents (PII) — keep samples outside the repo
*.pdf
*.xlsx
*.docx
!docs/**/*.pdf
!tests/fixtures/*.pdf
```

- [ ] **Step 3: Add Prettier and scripts**

```bash
pnpm add -D prettier prettier-plugin-tailwindcss
```

Create `.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "all",
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

In `package.json`, make the `scripts` block exactly:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

- [ ] **Step 4: Create `.env.example`**

```dotenv
# Supabase (local values come from `pnpm db:env` after `pnpm db:start`)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Internal email domain used to map login IDs to Supabase Auth emails
APP_INTERNAL_EMAIL_DOMAIN=learner.portal.internal
```

- [ ] **Step 5: Create `README.md`**

```markdown
# Thailand Business Training & Bank Verification Portal

Provisioned-login training portal: DBD-linked study, quiz, exam, Thai name card, DBD+45-day
bank-verification unlock, Thai Vapi call training. Spec: `docs/superpowers/specs/`.

## Prerequisites
- Node 24, pnpm 11, Docker Desktop (running) for the local Supabase stack.

## Run locally
```bash
pnpm install
pnpm db:start        # local Supabase (Docker)
pnpm db:env          # writes .env.local from the running stack
pnpm db:reset        # applies migrations + seed
pnpm dev             # http://localhost:3000
```

## Tests
```bash
pnpm test:unit
pnpm test:integration   # needs pnpm db:start
pnpm test:e2e           # needs pnpm db:start + built app
```
```

- [ ] **Step 6: Verify the scaffold builds and lints**

Run: `pnpm lint && pnpm typecheck && pnpm build`
Expected: all three succeed (build prints the route table with `/`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Tailwind, ESLint, Prettier and env template"
```

---

### Task 2: Vitest + Thai date domain module (TDD)

**Files:**
- Create: `vitest.config.ts`, `lib/domain/thai-date.ts`, `tests/unit/domain/thai-date.test.ts`
- Modify: `package.json` (add `test:unit`)

**Interfaces:**
- Produces:
  - `type ISODate = string` (always `YYYY-MM-DD`)
  - `todayInBangkok(now?: Date): ISODate`
  - `addCalendarDays(date: ISODate, days: number): ISODate`
  - `normalizeYear(year: number): { ce: number; wasBe: boolean }` (year ≥ 2400 is Buddhist Era → −543)
  - `parseDateInput(input: string): ISODate | null` (accepts `DD/MM/YYYY` or `YYYY-MM-DD`, BE or CE year)
  - `formatDate(date: ISODate, locale: 'th' | 'en' | 'zh'): string` (Thai shows BE year)
  - `isISODate(value: unknown): value is ISODate`

- [ ] **Step 1: Install Vitest and add the config**

```bash
pnpm add -D vitest
```

Create `vitest.config.ts`:

```ts
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
```

Add to `package.json` scripts: `"test:unit": "vitest run --config vitest.config.ts"`.

- [ ] **Step 2: Write the failing tests** — `tests/unit/domain/thai-date.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  formatDate,
  isISODate,
  normalizeYear,
  parseDateInput,
  todayInBangkok,
} from '@/lib/domain/thai-date';

describe('todayInBangkok', () => {
  it('returns the Bangkok calendar date when UTC is still the previous day', () => {
    // 2026-09-10T20:00Z is 2026-09-11 03:00 in Asia/Bangkok (UTC+7)
    expect(todayInBangkok(new Date('2026-09-10T20:00:00Z'))).toBe('2026-09-11');
  });
  it('returns the same date when UTC and Bangkok agree', () => {
    expect(todayInBangkok(new Date('2026-09-11T05:00:00Z'))).toBe('2026-09-11');
  });
});

describe('addCalendarDays', () => {
  it('adds 45 days across a month boundary (AC-001)', () => {
    expect(addCalendarDays('2026-09-11', 45)).toBe('2026-10-26');
  });
  it('adds across a year boundary', () => {
    expect(addCalendarDays('2026-12-01', 45)).toBe('2027-01-15');
  });
  it('counts 29 February in a leap year', () => {
    expect(addCalendarDays('2028-01-20', 45)).toBe('2028-03-05');
  });
  it('skips 29 February in a common year', () => {
    expect(addCalendarDays('2027-01-20', 45)).toBe('2027-03-06');
  });
  it('returns the same date for zero days', () => {
    expect(addCalendarDays('2026-01-31', 0)).toBe('2026-01-31');
  });
});

describe('normalizeYear', () => {
  it('treats years >= 2400 as Buddhist Era', () => {
    expect(normalizeYear(2569)).toEqual({ ce: 2026, wasBe: true });
  });
  it('leaves Common Era years alone', () => {
    expect(normalizeYear(2026)).toEqual({ ce: 2026, wasBe: false });
  });
});

describe('parseDateInput', () => {
  it('parses Thai DD/MM/YYYY with a BE year', () => {
    expect(parseDateInput('13/07/2569')).toBe('2026-07-13');
  });
  it('parses DD/MM/YYYY with a CE year', () => {
    expect(parseDateInput('13/07/2026')).toBe('2026-07-13');
  });
  it('parses ISO input with a BE year', () => {
    expect(parseDateInput('2569-07-13')).toBe('2026-07-13');
  });
  it('parses ISO input with a CE year', () => {
    expect(parseDateInput('2026-07-13')).toBe('2026-07-13');
  });
  it('rejects impossible dates and garbage', () => {
    expect(parseDateInput('31/02/2026')).toBeNull();
    expect(parseDateInput('hello')).toBeNull();
    expect(parseDateInput('')).toBeNull();
  });
});

describe('formatDate', () => {
  it('formats Thai with the BE year and Thai month name', () => {
    expect(formatDate('2026-10-26', 'th')).toBe('26 ตุลาคม 2569');
  });
  it('formats English with the CE year', () => {
    expect(formatDate('2026-10-26', 'en')).toBe('26 October 2026');
  });
  it('formats Chinese with the CE year', () => {
    expect(formatDate('2026-10-26', 'zh')).toBe('2026年10月26日');
  });
});

describe('isISODate', () => {
  it('accepts YYYY-MM-DD and rejects anything else', () => {
    expect(isISODate('2026-10-26')).toBe(true);
    expect(isISODate('2026-13-01')).toBe(false);
    expect(isISODate('26/10/2026')).toBe(false);
    expect(isISODate(42)).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm test:unit`
Expected: FAIL — cannot resolve `@/lib/domain/thai-date`.

- [ ] **Step 4: Implement `lib/domain/thai-date.ts`**

```ts
/** A calendar date as `YYYY-MM-DD`. The only date representation used in domain logic. */
export type ISODate = string;

export type Locale = 'th' | 'en' | 'zh';

export const BANGKOK_TZ = 'Asia/Bangkok';
const BE_OFFSET = 543;
/** Any year at or above this is treated as Buddhist Era (พ.ศ.). CE years never reach it. */
const BE_THRESHOLD = 2400;

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];
const ENGLISH_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= daysInMonth;
}

function toISO(y: number, m: number, d: number): ISODate {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string') return false;
  const m = ISO_RE.exec(value);
  if (!m) return false;
  return isRealDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

function parts(date: ISODate): [number, number, number] {
  const m = ISO_RE.exec(date);
  if (!m) throw new Error(`Not an ISO date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Calendar date in Asia/Bangkok for the given instant (defaults to now). */
export function todayInBangkok(now: Date = new Date()): ISODate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Pure calendar arithmetic; time zones are irrelevant because inputs are dates, not instants. */
export function addCalendarDays(date: ISODate, days: number): ISODate {
  const [y, m, d] = parts(date);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return toISO(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

export function normalizeYear(year: number): { ce: number; wasBe: boolean } {
  return year >= BE_THRESHOLD ? { ce: year - BE_OFFSET, wasBe: true } : { ce: year, wasBe: false };
}

/** Accepts `DD/MM/YYYY` or `YYYY-MM-DD`; the year may be BE or CE. Returns null when invalid. */
export function parseDateInput(input: string): ISODate | null {
  const trimmed = input.trim();
  let y: number;
  let m: number;
  let d: number;
  const iso = ISO_RE.exec(trimmed);
  const dmy = DMY_RE.exec(trimmed);
  if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (dmy) {
    [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  } else {
    return null;
  }
  const { ce } = normalizeYear(y);
  return isRealDate(ce, m, d) ? toISO(ce, m, d) : null;
}

export function formatDate(date: ISODate, locale: Locale): string {
  const [y, m, d] = parts(date);
  switch (locale) {
    case 'th':
      return `${d} ${THAI_MONTHS[m - 1]} ${y + BE_OFFSET}`;
    case 'en':
      return `${d} ${ENGLISH_MONTHS[m - 1]} ${y}`;
    case 'zh':
      return `${y}年${m}月${d}日`;
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm test:unit`
Expected: PASS (18 tests).

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts package.json pnpm-lock.yaml lib/domain/thai-date.ts tests/unit/domain/thai-date.test.ts
git commit -m "feat(domain): Thai date helpers with Bangkok today, calendar arithmetic and BE/CE handling"
```

---

### Task 3: Eligibility domain module (TDD)

**Files:**
- Create: `lib/domain/eligibility.ts`, `tests/unit/domain/eligibility.test.ts`

**Interfaces:**
- Consumes: `addCalendarDays`, `ISODate` from Task 2.
- Produces:
  - `DEFAULT_ELIGIBILITY_DAYS = 45`
  - `availableFrom(issuedOn: ISODate, days?: number): ISODate`
  - `type EligibilityWindow = { availableFrom: ISODate; expiresAt: ISODate | null }`
  - `isBankStageOpen(window: EligibilityWindow, today: ISODate): boolean`

- [ ] **Step 1: Write the failing tests** — `tests/unit/domain/eligibility.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_ELIGIBILITY_DAYS, availableFrom, isBankStageOpen } from '@/lib/domain/eligibility';

describe('availableFrom', () => {
  it('is DBD issue date + 45 calendar days (AC-001)', () => {
    expect(availableFrom('2026-09-11')).toBe('2026-10-26');
  });
  it('uses calendar days, ignoring weekends and holidays (BR-005)', () => {
    // 2026-07-13 is a Monday; +45 lands on Thursday 2026-08-27 with no adjustment.
    expect(availableFrom('2026-07-13')).toBe('2026-08-27');
  });
  it('honours a configured day count', () => {
    expect(availableFrom('2026-09-11', 30)).toBe('2026-10-11');
  });
  it('defaults to 45 days', () => {
    expect(DEFAULT_ELIGIBILITY_DAYS).toBe(45);
  });
});

describe('isBankStageOpen', () => {
  const window = { availableFrom: '2026-10-26', expiresAt: null };
  it('is closed the day before the available date (AC-002)', () => {
    expect(isBankStageOpen(window, '2026-10-25')).toBe(false);
  });
  it('is open on the available date (AC-003)', () => {
    expect(isBankStageOpen(window, '2026-10-26')).toBe(true);
  });
  it('is open after the available date', () => {
    expect(isBankStageOpen(window, '2027-01-01')).toBe(true);
  });
  it('is closed after an optional expiry date', () => {
    expect(isBankStageOpen({ ...window, expiresAt: '2026-12-31' }, '2027-01-01')).toBe(false);
  });
  it('is open on the expiry date itself', () => {
    expect(isBankStageOpen({ ...window, expiresAt: '2026-12-31' }, '2026-12-31')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:unit`
Expected: FAIL — cannot resolve `@/lib/domain/eligibility`.

- [ ] **Step 3: Implement `lib/domain/eligibility.ts`**

```ts
import { addCalendarDays, type ISODate } from './thai-date';

/** BR-002: Bank Verification Available Date = DBD Issue Date + 45 calendar days. */
export const DEFAULT_ELIGIBILITY_DAYS = 45;

export function availableFrom(issuedOn: ISODate, days: number = DEFAULT_ELIGIBILITY_DAYS): ISODate {
  return addCalendarDays(issuedOn, days);
}

export type EligibilityWindow = {
  availableFrom: ISODate;
  /** null = access never expires (open decision #13 default). */
  expiresAt: ISODate | null;
};

/** ISO dates compare correctly as strings, so no Date objects are needed. */
export function isBankStageOpen(window: EligibilityWindow, today: ISODate): boolean {
  if (today < window.availableFrom) return false;
  if (window.expiresAt !== null && today > window.expiresAt) return false;
  return true;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:unit`
Expected: PASS (27 tests total).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/eligibility.ts tests/unit/domain/eligibility.test.ts
git commit -m "feat(domain): eligibility window from DBD issue date + 45 calendar days"
```

---

### Task 4: Locale-prefixed routing skeleton (next-intl) with a message-parity test

**Files:**
- Create: `i18n/routing.ts`, `i18n/navigation.ts`, `i18n/request.ts`, `middleware.ts`, `app/[locale]/layout.tsx`, `app/[locale]/page.tsx`, `messages/th.json`, `messages/en.json`, `messages/zh.json`, `tests/unit/messages.test.ts`
- Modify: `next.config.ts`
- Delete: `app/layout.tsx`, `app/page.tsx` (the scaffold's root files; `app/globals.css` stays)

**Interfaces:**
- Produces: `routing` (`locales: ['th','en','zh']`, `defaultLocale: 'th'`), `AppLocale`, `htmlLang(locale)`, `Link`/`redirect`/`usePathname`/`useRouter` from `@/i18n/navigation`. Every page from now on lives under `app/[locale]/`.

> **Next.js 16 note:** Next.js 16 renamed `middleware.ts` to `proxy.ts` (exporting `proxy` instead of `middleware`). Check `pnpm list next`. If the major version is ≥ 16, create `proxy.ts` with `export default createMiddleware(routing)` renamed accordingly and keep everything else identical; Task 7 modifies the same file.

- [ ] **Step 1: Install next-intl and wire the plugin**

```bash
pnpm add next-intl
```

Replace `next.config.ts` with:

```ts
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {};

export default withNextIntl(nextConfig);
```

- [ ] **Step 2: Create the routing files**

`i18n/routing.ts`:

```ts
import { defineRouting } from 'next-intl/routing';

export const LOCALES = ['th', 'en', 'zh'] as const;
export type AppLocale = (typeof LOCALES)[number];

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: 'th',
});

/** `zh` is Simplified Chinese (decision D8). */
export function htmlLang(locale: AppLocale): string {
  return locale === 'zh' ? 'zh-Hans' : locale;
}
```

`i18n/navigation.ts`:

```ts
import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
```

`i18n/request.ts`:

```ts
import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
```

`middleware.ts` (or `proxy.ts`, see note above):

```ts
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next internals, Vercel internals and static files.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
```

- [ ] **Step 3: Create the message catalogs**

`messages/th.json`:

```json
{
  "app": { "name": "พอร์ทัลฝึกอบรมธุรกิจ" },
  "home": { "title": "พอร์ทัลฝึกอบรมธุรกิจและการยืนยันตัวตนกับธนาคาร" }
}
```

`messages/en.json`:

```json
{
  "app": { "name": "Business Training Portal" },
  "home": { "title": "Thailand Business Training & Bank Verification Portal" }
}
```

`messages/zh.json`:

```json
{
  "app": { "name": "商业培训门户" },
  "home": { "title": "泰国商业培训与银行验证门户" }
}
```

- [ ] **Step 4: Write the failing parity test** — `tests/unit/messages.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import th from '@/messages/th.json';
import zh from '@/messages/zh.json';

type Catalog = Record<string, unknown>;

function entries(obj: Catalog, prefix = ''): Array<[string, unknown]> {
  return Object.entries(obj).flatMap(([key, value]) =>
    value !== null && typeof value === 'object'
      ? entries(value as Catalog, `${prefix}${key}.`)
      : [[`${prefix}${key}`, value] as [string, unknown]],
  );
}

const keysOf = (c: Catalog) => entries(c).map(([k]) => k).sort();

describe('message catalogs', () => {
  it('en has exactly the same keys as th', () => {
    expect(keysOf(en)).toEqual(keysOf(th));
  });
  it('zh has exactly the same keys as th', () => {
    expect(keysOf(zh)).toEqual(keysOf(th));
  });
  it('has no empty strings in any catalog', () => {
    for (const [name, catalog] of Object.entries({ th, en, zh })) {
      for (const [key, value] of entries(catalog)) {
        expect(typeof value === 'string' && value.trim().length > 0, `${name}:${key}`).toBe(true);
      }
    }
  });
});
```

Run: `pnpm test:unit`
Expected: PASS already (catalogs are in parity) — this test exists to fail whenever a future task adds a key to one language only, which the spec forbids (§7).

- [ ] **Step 5: Replace the root layout/page with locale-aware ones**

Delete `app/layout.tsx` and `app/page.tsx`. Create `app/[locale]/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { htmlLang, routing } from '@/i18n/routing';
import '../globals.css';

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return (
    <html lang={htmlLang(locale)}>
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
```

Create `app/[locale]/page.tsx`:

```tsx
import { useTranslations } from 'next-intl';

export default function HomePage() {
  const t = useTranslations('home');
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
    </main>
  );
}
```

- [ ] **Step 6: Verify routing works**

Run: `pnpm typecheck && pnpm build`
Expected: build succeeds and lists `/[locale]`.

Run: `pnpm dev` then open `http://localhost:3000/` → redirected to `/th` with the Thai title; `/zh` shows the Chinese title and `<html lang="zh-Hans">` (view source). Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(i18n): locale-prefixed routing for th/en/zh with message parity test"
```

---

### Task 5: Local Supabase stack, identity migration, DB clients and the integration test harness

**Files:**
- Create: `supabase/config.toml` (via CLI, then edited), `supabase/migrations/20260911000001_identity.sql`, `scripts/write-local-env.mjs`, `lib/db/env.ts`, `lib/db/server.ts`, `lib/db/admin.ts`, `lib/db/database.types.ts` (generated), `vitest.integration.config.ts`, `tests/integration/setup.ts`, `tests/integration/helpers.ts`, `tests/integration/profiles.rls.test.ts`
- Modify: `package.json` scripts

**Interfaces:**
- Produces:
  - SQL: `public.profiles`, `public.is_admin()`, `public.set_updated_at()`, trigger `on_auth_user_created` (creates a profile from `raw_user_meta_data.login_id/display_name/preferred_language` and `raw_app_meta_data.role`).
  - `createSupabaseServerClient(): Promise<SupabaseServerClient>` (cookie-bound, RLS as the signed-in user)
  - `createSupabaseAdminClient()` (service role, `server-only`)
  - `publicEnv()`, `serverEnv()`
  - Test helpers: `adminClient()`, `createTestUser(role, overrides?) → { id, loginId, password }`, `clientFor(user)`, `deleteTestUser(id)`, `INTERNAL_DOMAIN`
  - Scripts: `pnpm db:start | db:stop | db:reset | db:env | db:types | test:integration`

- [ ] **Step 1: Install packages and initialise the Supabase project**

```bash
pnpm add @supabase/supabase-js @supabase/ssr zod server-only
pnpm add -D supabase dotenv
pnpm exec supabase init
```

When prompted about VS Code / IntelliJ settings answer no. Expected: `supabase/config.toml` exists.

- [ ] **Step 2: Disable public sign-up**

In `supabase/config.toml`, under `[auth]`, set:

```toml
site_url = "http://localhost:3000"
enable_signup = false
```

(Admin API user creation still works with sign-up disabled; this is what enforces "provisioned accounts only".)

- [ ] **Step 3: Add scripts**

Add to `package.json` scripts:

```json
{
  "db:start": "supabase start",
  "db:stop": "supabase stop",
  "db:reset": "supabase db reset",
  "db:env": "node scripts/write-local-env.mjs",
  "db:types": "supabase gen types typescript --local --schema public > lib/db/database.types.ts",
  "test:integration": "vitest run --config vitest.integration.config.ts"
}
```

Create `scripts/write-local-env.mjs`:

```js
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

// `supabase status -o env` prints KEY="value" lines for the running local stack.
const out = execSync('pnpm exec supabase status -o env', { encoding: 'utf8' });
const vars = Object.fromEntries(
  out
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);

const anonKey = vars.ANON_KEY ?? vars.PUBLISHABLE_KEY;
const serviceKey = vars.SERVICE_ROLE_KEY ?? vars.SECRET_KEY;
if (!vars.API_URL || !anonKey || !serviceKey) {
  console.error('Could not read API_URL / ANON_KEY / SERVICE_ROLE_KEY. Is `pnpm db:start` running?');
  process.exit(1);
}

writeFileSync(
  '.env.local',
  [
    `NEXT_PUBLIC_SUPABASE_URL=${vars.API_URL}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}`,
    `SUPABASE_SERVICE_ROLE_KEY=${serviceKey}`,
    'APP_INTERNAL_EMAIL_DOMAIN=learner.portal.internal',
    '',
  ].join('\n'),
);
console.log('.env.local written from the local Supabase stack');
```

- [ ] **Step 4: Write the identity migration** — `supabase/migrations/20260911000001_identity.sql`

```sql
-- Identity: profiles mirror auth.users with the portal-specific fields.
-- Accounts are created only through the admin API (enable_signup = false).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  login_id text not null unique,
  role text not null check (role in ('learner', 'admin')),
  display_name text,
  preferred_language text not null default 'th' check (preferred_language in ('th', 'en', 'zh')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per portal account. role drives authorization; login_id is what admins hand to learners.';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- security definer so RLS policies can call it without recursing into profiles' own policies.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.status = 'active'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, service_role;

-- Create the profile row when the admin API creates an auth user.
-- login_id/display_name/preferred_language come from user_metadata; role from app_metadata
-- (app_metadata cannot be edited by the user).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, login_id, role, display_name, preferred_language)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'login_id', new.id::text),
    coalesce(new.raw_app_meta_data ->> 'role', 'learner'),
    new.raw_user_meta_data ->> 'display_name',
    coalesce(new.raw_user_meta_data ->> 'preferred_language', 'th')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

create policy "profiles: users read their own row"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles: admins do everything"
  on public.profiles for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
```

- [ ] **Step 5: Start the stack, apply the migration, generate types**

Start Docker Desktop, then:

```bash
pnpm db:start
pnpm db:env
pnpm db:reset
pnpm db:types
```

Expected: `db:start` prints the local URLs; `.env.local` exists; `db:reset` prints `Applying migration 20260911000001_identity.sql`; `lib/db/database.types.ts` contains `profiles`.

- [ ] **Step 6: Create the env and client modules**

`lib/db/env.ts`:

```ts
import { z } from 'zod';

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  APP_INTERNAL_EMAIL_DOMAIN: z.string().min(1).default('learner.portal.internal'),
});

/** Safe for the browser bundle. Referenced literally so Next.js can inline them. */
export function publicEnv() {
  return publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

/** Server secrets. Never import from a client component. */
export function serverEnv() {
  return serverSchema.parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    APP_INTERNAL_EMAIL_DOMAIN: process.env.APP_INTERNAL_EMAIL_DOMAIN,
  });
}
```

`lib/db/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './database.types';
import { publicEnv } from './env';

/** Cookie-bound client: every query runs under RLS as the signed-in user. */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key } = publicEnv();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there.
          // The middleware refreshes sessions, so this is safe to ignore.
        }
      },
    },
  });
}

export type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
```

`lib/db/admin.ts`:

```ts
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { publicEnv, serverEnv } from './env';

/**
 * Service-role client. Bypasses RLS. Allowed only for: account provisioning,
 * policy_config reads, signed URLs, cron and webhook handlers (spec §3.3).
 */
export function createSupabaseAdminClient() {
  return createClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;
```

- [ ] **Step 7: Create the integration test harness**

`vitest.integration.config.ts`:

```ts
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/integration/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
```

`tests/integration/setup.ts`:

```ts
import { config } from 'dotenv';

config({ path: '.env.local' });

for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[name]) {
    throw new Error(`${name} is missing. Run: pnpm db:start && pnpm db:env`);
  }
}
```

`tests/integration/helpers.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/database.types';

export type Role = 'learner' | 'admin';
export type TestUser = { id: string; loginId: string; password: string; role: Role };
export type Client = SupabaseClient<Database>;

export const INTERNAL_DOMAIN = process.env.APP_INTERNAL_EMAIL_DOMAIN ?? 'learner.portal.internal';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

export function adminClient(): Client {
  return createClient<Database>(url, serviceKey, noSession);
}

export async function createTestUser(
  role: Role,
  overrides: { loginId?: string; displayName?: string; preferredLanguage?: 'th' | 'en' | 'zh' } = {},
): Promise<TestUser> {
  const loginId = overrides.loginId ?? `${role}-${randomUUID().slice(0, 8)}`;
  const password = 'Test-Password-123!';
  const { data, error } = await adminClient().auth.admin.createUser({
    email: `${loginId}@${INTERNAL_DOMAIN}`,
    password,
    email_confirm: true,
    user_metadata: {
      login_id: loginId,
      display_name: overrides.displayName ?? loginId,
      preferred_language: overrides.preferredLanguage ?? 'th',
    },
    app_metadata: { role },
  });
  if (error || !data.user) throw error ?? new Error('createUser returned no user');
  return { id: data.user.id, loginId, password, role };
}

/** A client signed in as the given user; every query runs under RLS. */
export async function clientFor(user: TestUser): Promise<Client> {
  const client = createClient<Database>(url, anonKey, noSession);
  const { error } = await client.auth.signInWithPassword({
    email: `${user.loginId}@${INTERNAL_DOMAIN}`,
    password: user.password,
  });
  if (error) throw error;
  return client;
}

export async function deleteTestUser(id: string): Promise<void> {
  await adminClient().auth.admin.deleteUser(id);
}
```

- [ ] **Step 8: Write the failing RLS test** — `tests/integration/profiles.rls.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, clientFor, createTestUser, deleteTestUser, type Client, type TestUser } from './helpers';

describe('profiles RLS', () => {
  let learnerA: TestUser;
  let learnerB: TestUser;
  let admin: TestUser;
  let asA: Client;
  let asAdmin: Client;

  beforeAll(async () => {
    [learnerA, learnerB, admin] = await Promise.all([
      createTestUser('learner'),
      createTestUser('learner'),
      createTestUser('admin'),
    ]);
    asA = await clientFor(learnerA);
    asAdmin = await clientFor(admin);
  });

  afterAll(async () => {
    await Promise.all([learnerA, learnerB, admin].map((u) => deleteTestUser(u.id)));
  });

  it('creates a profile from the auth metadata', async () => {
    const { data } = await adminClient().from('profiles').select('*').eq('id', learnerA.id).single();
    expect(data).toMatchObject({ login_id: learnerA.loginId, role: 'learner', preferred_language: 'th' });
  });

  it('lets a learner read only their own profile', async () => {
    const { data } = await asA.from('profiles').select('id');
    expect(data?.map((r) => r.id)).toEqual([learnerA.id]);
  });

  it('hides another learner’s profile even when queried by id', async () => {
    const { data } = await asA.from('profiles').select('id').eq('id', learnerB.id);
    expect(data).toEqual([]);
  });

  it('prevents a learner from escalating their own role', async () => {
    const { data } = await asA.from('profiles').update({ role: 'admin' }).eq('id', learnerA.id).select();
    expect(data).toEqual([]);
    const { data: after } = await adminClient().from('profiles').select('role').eq('id', learnerA.id).single();
    expect(after?.role).toBe('learner');
  });

  it('lets an admin read every profile', async () => {
    const { data } = await asAdmin.from('profiles').select('id').in('id', [learnerA.id, learnerB.id]);
    expect(data).toHaveLength(2);
  });
});
```

- [ ] **Step 9: Run the integration tests**

Run: `pnpm test:integration`
Expected: PASS (5 tests). If `creates a profile` fails, the trigger did not fire — check `pnpm db:reset` output for the migration.

- [ ] **Step 10: Verify the app still builds with the new modules**

Run: `pnpm typecheck && pnpm lint`
Expected: both pass (`server-only` import is fine because nothing client-side imports `lib/db/admin.ts` yet).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(db): local Supabase stack, profiles identity migration, typed clients and RLS test harness"
```

---

### Task 6: Continuous integration and architecture decision records

**Files:**
- Create: `.github/workflows/ci.yml`, `docs/adr/0001-stack.md`, `docs/adr/0002-rls-isolation.md`, `docs/adr/0003-derived-progression.md`, `docs/adr/0004-notifications-table-queue.md`, `docs/adr/0005-eligibility-enforced-in-database.md`

**Interfaces:**
- Produces: a CI job that later tasks extend (Task 7 adds Playwright, Task 15 adds the secret scan). Each of those tasks shows the exact lines to add.

- [ ] **Step 1: Create the workflow** — `.github/workflows/ci.yml`

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 11

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Lint, typecheck, format
        run: pnpm lint && pnpm typecheck && pnpm format:check

      - name: Unit tests
        run: pnpm test:unit

      - name: Start local Supabase and write env
        run: |
          pnpm exec supabase start
          node scripts/write-local-env.mjs

      - name: Integration tests
        run: pnpm test:integration

      - name: Build
        run: pnpm build
```

- [ ] **Step 2: Make the formatter pass on the current tree**

Run: `pnpm format && pnpm format:check`
Expected: `format` rewrites scaffold files; `format:check` then passes.

- [ ] **Step 3: Write the ADRs** (one file each, same shape)

`docs/adr/0001-stack.md`:

```markdown
# ADR 0001: Next.js + Supabase + Vercel

**Status:** Accepted (2026-09-11)

**Context.** ASAP pilot for a handful of companies (decision D6). The owner's Supabase, Vercel and GitHub
accounts are already connected. The PRD's hardest requirement is learner isolation (AUTH-003, AC-011).

**Decision.** One Next.js App Router app on Vercel; Supabase Postgres/Auth/Storage per environment.

**Consequences.** Row-Level Security enforces isolation in the database (ADR 0002). Serverless makes
browser-based PDF rendering awkward (spike S3). Nearest Supabase region is Singapore.
```

`docs/adr/0002-rls-isolation.md`:

```markdown
# ADR 0002: Row-Level Security is the isolation boundary

**Status:** Accepted (2026-09-11)

**Context.** A learner must never read another learner's DBD data, results, cards or calls, even via
API manipulation (AC-011). App-level checks alone fail silently when a query forgets a filter.

**Decision.** Every table has RLS. Learner-facing pages query with the learner's own session client.
Admins pass `is_admin()`. Admin server actions use the admin's session client so `auth.uid()` reaches
audit triggers; the service-role client is limited to provisioning, config reads, signed URLs, cron and
webhooks.

**Consequences.** Every table and bucket gets a negative test (learner A vs learner B). Cross-user
features must be designed as server routes, never as wider policies.
```

`docs/adr/0003-derived-progression.md`:

```markdown
# ADR 0003: Progression state is derived, never stored

**Status:** Accepted (2026-09-11)

**Context.** PRD §8 asks that eligibility and exam pass be independent conditions so policy changes
do not strand users in an irreversible status.

**Decision.** `deriveProgression(facts)` in `lib/domain` computes the PRD state from stored facts
(assignment, attempts, eligibility snapshot, call sessions, policy) on every read.

**Consequences.** No status column to migrate when rules change; dashboards show each stage's own
status; admin lists compute the summary state at query time.
```

`docs/adr/0004-notifications-table-queue.md`:

```markdown
# ADR 0004: The notifications table is the job queue

**Status:** Accepted (2026-09-11)

**Context.** Exam results go to Telegram and Email; sends must be idempotent and retryable, and the
exam submission must stay valid when a provider is down (PRD §16). Pilot scale is tiny.

**Decision.** Submissions insert `notifications` rows (unique `idempotency_key`) in the same
transaction as the result. A Vercel Cron route drains pending rows with backoff. No queue service.

**Consequences.** Zero extra infrastructure; retry state is visible in admin. Upgrade path is Inngest
if volume grows.
```

`docs/adr/0005-eligibility-enforced-in-database.md`:

```markdown
# ADR 0005: Eligibility snapshots are written by the database

**Status:** Accepted (2026-09-11)

**Context.** `available_from = issued_on + 45 days` must hold even if an admin edits `issued_on`
through a tool other than the app, and history must survive as an audit trail.

**Decision.** A Postgres function `compute_eligibility_snapshot()` runs from triggers on assignment
insert and on `issued_on` change, appending to `eligibility_snapshots`. `lib/domain/eligibility.ts`
mirrors the arithmetic for display and tests, and an integration test proves both agree on boundary
dates.

**Consequences.** Two implementations of one rule, guarded by a parity test. Changing the day count is
a `policy_config` update; existing snapshots are not rewritten.
```

- [ ] **Step 4: Commit and (optionally) push to GitHub to see CI run**

```bash
git add -A
git commit -m "ci: GitHub Actions pipeline; docs: initial ADRs"
```

If a GitHub remote is wanted now: `gh repo create thailand-training-portal --private --source=. --push`. Otherwise CI runs on the first push later.

---

## P1 — Auth + DBD core

### Task 7: Login, session middleware, role guards and the Playwright harness

**Files:**
- Create: `lib/auth/internal-email.ts`, `tests/unit/auth/internal-email.test.ts`, `lib/db/middleware.ts`, `lib/auth/session.ts`, `app/[locale]/(auth)/login/page.tsx`, `app/[locale]/(auth)/login/actions.ts`, `app/[locale]/(auth)/login/login-form.tsx`, `app/[locale]/(learner)/layout.tsx`, `app/[locale]/(learner)/dashboard/page.tsx`, `app/[locale]/(admin)/layout.tsx`, `app/[locale]/(admin)/admin/page.tsx`, `components/sign-out-button.tsx`, `playwright.config.ts`, `tests/e2e/fixtures.ts`, `tests/e2e/helpers.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/auth.spec.ts`
- Modify: `middleware.ts` (or `proxy.ts`), `app/[locale]/page.tsx`, `messages/*.json`, `package.json`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `createSupabaseServerClient`, `publicEnv`, `serverEnv` (Task 5); `routing` (Task 4).
- Produces:
  - `LOGIN_ID_PATTERN`, `isValidLoginId(loginId): boolean`, `loginIdToEmail(loginId, domain): string` (lower-cases the ID)
  - `updateSession(request, response): Promise<NextResponse>` — refreshes the Supabase session and guards `/dashboard` (any signed-in user) and `/admin` (role `admin` from `app_metadata`)
  - `type CurrentUser = { id; loginId; role: 'learner'|'admin'; displayName: string|null; preferredLanguage: AppLocale; status: 'active'|'disabled' }`
  - `getCurrentUser(): Promise<CurrentUser|null>`, `requireUser(locale): Promise<CurrentUser>`, `requireAdmin(locale): Promise<CurrentUser>` (redirect on failure)
  - `signInAction(prev, formData)`, `signOutAction(formData)`
  - E2E fixtures `E2E_ADMIN`, `E2E_LEARNER`, `E2E_PASSWORD`; script `pnpm test:e2e`

- [ ] **Step 1: Write the failing unit test for the login-ID mapping** — `tests/unit/auth/internal-email.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { isValidLoginId, loginIdToEmail } from '@/lib/auth/internal-email';

describe('isValidLoginId', () => {
  it('accepts 3–64 chars of letters, digits, dot, underscore, dash', () => {
    expect(isValidLoginId('siam001')).toBe(true);
    expect(isValidLoginId('learner.a_b-c')).toBe(true);
  });
  it('rejects too short, spaces, @ and leading punctuation', () => {
    expect(isValidLoginId('ab')).toBe(false);
    expect(isValidLoginId('has space')).toBe(false);
    expect(isValidLoginId('a@b')).toBe(false);
    expect(isValidLoginId('.abc')).toBe(false);
  });
});

describe('loginIdToEmail', () => {
  it('lower-cases the id and appends the internal domain', () => {
    expect(loginIdToEmail('Siam001', 'learner.portal.internal')).toBe('siam001@learner.portal.internal');
  });
});
```

Run: `pnpm test:unit` → FAIL (module missing).

- [ ] **Step 2: Implement `lib/auth/internal-email.ts`**

```ts
/** Login IDs are case-insensitive and stored lower-case. */
export const LOGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/i;

export function isValidLoginId(loginId: string): boolean {
  return LOGIN_ID_PATTERN.test(loginId);
}

/** Supabase Auth needs an email; learners never see this address (spec §4.1). */
export function loginIdToEmail(loginId: string, domain: string): string {
  return `${loginId.toLowerCase()}@${domain}`;
}
```

Run: `pnpm test:unit` → PASS.

- [ ] **Step 3: Session refresh + route guards** — `lib/db/middleware.ts`

```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';
import type { Database } from './database.types';

const GUARDS = [
  { prefix: '/dashboard', role: 'any' },
  { prefix: '/admin', role: 'admin' },
] as const;

function splitLocale(pathname: string): { locale: string; path: string } {
  const [, first = '', ...rest] = pathname.split('/');
  if ((routing.locales as readonly string[]).includes(first)) {
    return { locale: first, path: `/${rest.join('/')}` };
  }
  return { locale: routing.defaultLocale, path: pathname };
}

function redirectKeepingCookies(request: NextRequest, response: NextResponse, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  const redirect = NextResponse.redirect(url);
  // Carry refreshed auth cookies across the redirect.
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export async function updateSession(request: NextRequest, response: NextResponse): Promise<NextResponse> {
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // getUser() validates the token with Supabase (never trust getSession() here).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { locale, path } = splitLocale(request.nextUrl.pathname);
  const guard = GUARDS.find((g) => path === g.prefix || path.startsWith(`${g.prefix}/`));
  if (!guard) return response;
  if (!user) return redirectKeepingCookies(request, response, `/${locale}/login`);
  if (guard.role === 'admin' && user.app_metadata?.role !== 'admin') {
    return redirectKeepingCookies(request, response, `/${locale}/dashboard`);
  }
  return response;
}
```

Replace `middleware.ts` (or `proxy.ts` on Next 16 — rename the exported function to `proxy`):

```ts
import createIntlMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { updateSession } from './lib/db/middleware';

const handleI18n = createIntlMiddleware(routing);

export default async function middleware(request: NextRequest) {
  const response = handleI18n(request);
  return updateSession(request, response);
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
```

- [ ] **Step 4: Server-side session helpers** — `lib/auth/session.ts`

```ts
import { redirect } from 'next/navigation';
import type { AppLocale } from '@/i18n/routing';
import { createSupabaseServerClient } from '@/lib/db/server';

export type CurrentUser = {
  id: string;
  loginId: string;
  role: 'learner' | 'admin';
  displayName: string | null;
  preferredLanguage: AppLocale;
  status: 'active' | 'disabled';
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, login_id, role, display_name, preferred_language, status')
    .eq('id', user.id)
    .single();
  if (!profile) return null;
  return {
    id: profile.id,
    loginId: profile.login_id,
    role: profile.role as CurrentUser['role'],
    displayName: profile.display_name,
    preferredLanguage: profile.preferred_language as AppLocale,
    status: profile.status as CurrentUser['status'],
  };
}

/** Redirects to login when signed out or disabled. Source of truth is the profiles row, not the JWT. */
export async function requireUser(locale: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/login`);
  if (user.status === 'disabled') {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    redirect(`/${locale}/login?reason=disabled`);
  }
  return user;
}

export async function requireAdmin(locale: string): Promise<CurrentUser> {
  const user = await requireUser(locale);
  if (user.role !== 'admin') redirect(`/${locale}/dashboard`);
  return user;
}
```

- [ ] **Step 5: Login page, server actions and form**

`app/[locale]/(auth)/login/actions.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { isValidLoginId, loginIdToEmail } from '@/lib/auth/internal-email';
import { serverEnv } from '@/lib/db/env';
import { createSupabaseServerClient } from '@/lib/db/server';

export type SignInState = { error: 'invalid' | 'disabled' | null };

const schema = z.object({
  loginId: z.string().trim().refine(isValidLoginId),
  password: z.string().min(1),
  locale: z.enum(['th', 'en', 'zh']),
});

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = schema.safeParse({
    loginId: formData.get('loginId'),
    password: formData.get('password'),
    locale: formData.get('locale'),
  });
  // Any failure — malformed ID, unknown account, wrong password — yields the same message (AUTH-004).
  if (!parsed.success) return { error: 'invalid' };
  const { loginId, password, locale } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: loginIdToEmail(loginId, serverEnv().APP_INTERNAL_EMAIL_DOMAIN),
    password,
  });
  if (error || !data.user) return { error: 'invalid' };

  const { data: profile } = await supabase.from('profiles').select('role, status').eq('id', data.user.id).single();
  if (!profile || profile.status === 'disabled') {
    await supabase.auth.signOut();
    return { error: 'disabled' };
  }
  redirect(`/${locale}/${profile.role === 'admin' ? 'admin' : 'dashboard'}`);
}

export async function signOutAction(formData: FormData) {
  const locale = String(formData.get('locale') ?? 'th');
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(`/${locale}/login`);
}
```

`app/[locale]/(auth)/login/login-form.tsx`:

```tsx
'use client';

import { useLocale } from 'next-intl';
import { useActionState } from 'react';
import { signInAction, type SignInState } from './actions';

type Labels = { loginId: string; password: string; submit: string; invalid: string; disabled: string };

export function LoginForm({ labels }: { labels: Labels }) {
  const locale = useLocale();
  const [state, formAction, pending] = useActionState<SignInState, FormData>(signInAction, { error: null });
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      <label className="flex flex-col gap-1 text-sm">
        {labels.loginId}
        <input name="loginId" autoComplete="username" required className="rounded border px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {labels.password}
        <input name="password" type="password" autoComplete="current-password" required className="rounded border px-3 py-2" />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error === 'disabled' ? labels.disabled : labels.invalid}
        </p>
      )}
      <button type="submit" disabled={pending} className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50">
        {labels.submit}
      </button>
    </form>
  );
}
```

`app/[locale]/(auth)/login/page.tsx`:

```tsx
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { LoginForm } from './login-form';

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ reason?: string }>;
}) {
  const { locale } = await params;
  const { reason } = await searchParams;
  const user = await getCurrentUser();
  if (user && user.status === 'active') redirect(`/${locale}/${user.role === 'admin' ? 'admin' : 'dashboard'}`);
  const t = await getTranslations('auth');
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <h1 className="mb-6 text-2xl font-semibold">{t('title')}</h1>
      {reason === 'disabled' && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {t('accountDisabled')}
        </p>
      )}
      <LoginForm
        labels={{
          loginId: t('loginId'),
          password: t('password'),
          submit: t('submit'),
          invalid: t('invalidCredentials'),
          disabled: t('accountDisabled'),
        }}
      />
    </main>
  );
}
```

- [ ] **Step 6: Guarded layouts, placeholder pages, sign-out button**

`components/sign-out-button.tsx`:

```tsx
import { getLocale, getTranslations } from 'next-intl/server';
import { signOutAction } from '@/app/[locale]/(auth)/login/actions';

export async function SignOutButton() {
  const locale = await getLocale();
  const t = await getTranslations('auth');
  return (
    <form action={signOutAction}>
      <input type="hidden" name="locale" value={locale} />
      <button type="submit" className="text-sm underline">
        {t('signOut')}
      </button>
    </form>
  );
}
```

`app/[locale]/(learner)/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { SignOutButton } from '@/components/sign-out-button';
import { requireUser } from '@/lib/auth/session';

export default async function LearnerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await requireUser(locale);
  const t = await getTranslations('app');
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="font-semibold">{t('name')}</span>
        <div className="flex items-center gap-4 text-sm">
          <span>{user.displayName ?? user.loginId}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

`app/[locale]/(admin)/layout.tsx` — identical except `requireAdmin(locale)` and the header shows `{t('name')} · Admin`.

`app/[locale]/(learner)/dashboard/page.tsx` (P1 placeholder; Task 14 replaces it):

```tsx
import { getTranslations } from 'next-intl/server';
import { requireUser } from '@/lib/auth/session';

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireUser(locale);
  const t = await getTranslations('dashboard');
  return (
    <section>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="mt-2">{t('welcome', { name: user.displayName ?? user.loginId })}</p>
    </section>
  );
}
```

`app/[locale]/(admin)/admin/page.tsx`:

```tsx
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export default async function AdminHome() {
  const t = await getTranslations('admin');
  return (
    <section>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <ul className="mt-4 list-disc pl-6">
        <li>
          <Link href="/admin/users" className="underline">
            {t('nav.users')}
          </Link>
        </li>
      </ul>
    </section>
  );
}
```

Replace `app/[locale]/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await getCurrentUser();
  if (!user || user.status !== 'active') redirect(`/${locale}/login`);
  redirect(`/${locale}/${user.role === 'admin' ? 'admin' : 'dashboard'}`);
}
```

- [ ] **Step 7: Add messages (all three files — the parity test enforces it)**

Add to `messages/en.json` (keep existing keys):

```json
{
  "auth": {
    "title": "Sign in",
    "loginId": "Login ID",
    "password": "Password",
    "submit": "Sign in",
    "invalidCredentials": "Invalid login ID or password.",
    "accountDisabled": "This account is disabled. Please contact your administrator.",
    "signOut": "Sign out"
  },
  "dashboard": { "title": "Dashboard", "welcome": "Welcome, {name}" },
  "admin": { "title": "Administration", "nav": { "users": "Users" } }
}
```

`messages/th.json`:

```json
{
  "auth": {
    "title": "เข้าสู่ระบบ",
    "loginId": "รหัสผู้ใช้",
    "password": "รหัสผ่าน",
    "submit": "เข้าสู่ระบบ",
    "invalidCredentials": "รหัสผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
    "accountDisabled": "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ",
    "signOut": "ออกจากระบบ"
  },
  "dashboard": { "title": "หน้าหลัก", "welcome": "ยินดีต้อนรับ {name}" },
  "admin": { "title": "ผู้ดูแลระบบ", "nav": { "users": "ผู้ใช้งาน" } }
}
```

`messages/zh.json`:

```json
{
  "auth": {
    "title": "登录",
    "loginId": "登录ID",
    "password": "密码",
    "submit": "登录",
    "invalidCredentials": "登录ID或密码不正确。",
    "accountDisabled": "此账户已被停用，请联系管理员。",
    "signOut": "退出登录"
  },
  "dashboard": { "title": "首页", "welcome": "欢迎，{name}" },
  "admin": { "title": "管理", "nav": { "users": "用户" } }
}
```

Run: `pnpm test:unit && pnpm typecheck` → PASS.

- [ ] **Step 8: Playwright harness**

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

Add script `"test:e2e": "playwright test"`.

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  webServer: {
    command: process.env.CI ? 'pnpm start' : 'pnpm dev',
    url: 'http://localhost:3000/th/login',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
```

`tests/e2e/fixtures.ts`:

```ts
export const E2E_PASSWORD = 'E2e-Password-123!';
export const E2E_ADMIN = { loginId: 'e2e-admin', role: 'admin' as const };
export const E2E_LEARNER = { loginId: 'e2e-learner', role: 'learner' as const };
```

`tests/e2e/global-setup.ts`:

```ts
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { E2E_ADMIN, E2E_LEARNER, E2E_PASSWORD } from './fixtures';

config({ path: '.env.local' });

export default async function globalSetup() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const domain = process.env.APP_INTERNAL_EMAIL_DOMAIN ?? 'learner.portal.internal';
  for (const { loginId, role } of [E2E_ADMIN, E2E_LEARNER]) {
    const { error } = await admin.auth.admin.createUser({
      email: `${loginId}@${domain}`,
      password: E2E_PASSWORD,
      email_confirm: true,
      user_metadata: { login_id: loginId, display_name: loginId, preferred_language: 'th' },
      app_metadata: { role },
    });
    if (error && !/already|exists|registered/i.test(error.message)) throw error;
  }
}
```

`tests/e2e/helpers.ts`:

```ts
import type { Page } from '@playwright/test';

export async function login(page: Page, loginId: string, password: string) {
  await page.goto('/th/login');
  await page.locator('input[name="loginId"]').fill(loginId);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
}
```

`tests/e2e/auth.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_LEARNER, E2E_PASSWORD } from './fixtures';
import { login } from './helpers';

test('wrong password and unknown account show the same generic error', async ({ page }) => {
  await login(page, E2E_LEARNER.loginId, 'wrong-password');
  await expect(page.getByRole('alert')).toHaveText('รหัสผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  await expect(page).toHaveURL(/\/th\/login$/);

  await login(page, 'no-such-user', 'wrong-password');
  await expect(page.getByRole('alert')).toHaveText('รหัสผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
});

test('a learner lands on the dashboard and cannot open admin', async ({ page }) => {
  await login(page, E2E_LEARNER.loginId, E2E_PASSWORD);
  await expect(page).toHaveURL(/\/th\/dashboard$/);
  await expect(page.getByText(`ยินดีต้อนรับ ${E2E_LEARNER.loginId}`)).toBeVisible();

  await page.goto('/th/admin');
  await expect(page).toHaveURL(/\/th\/dashboard$/);
});

test('an admin lands on the admin home', async ({ page }) => {
  await login(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await expect(page).toHaveURL(/\/th\/admin$/);
});

test('signed-out visitors are sent to login, and sign-out works', async ({ page }) => {
  await page.goto('/th/dashboard');
  await expect(page).toHaveURL(/\/th\/login$/);

  await login(page, E2E_LEARNER.loginId, E2E_PASSWORD);
  await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
  await expect(page).toHaveURL(/\/th\/login$/);
  await page.goto('/th/dashboard');
  await expect(page).toHaveURL(/\/th\/login$/);
});
```

- [ ] **Step 9: Run the E2E suite** (local Supabase must be running; `.env.local` present)

Run: `pnpm test:e2e`
Expected: 4 passed.

- [ ] **Step 10: Add E2E to CI** — in `.github/workflows/ci.yml`, after the `Build` step add:

```yaml
      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps chromium

      - name: E2E tests
        run: pnpm test:e2e
        env:
          CI: "true"
```

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(auth): provisioned login with generic errors, session middleware, role guards and e2e harness"
```

---

### Task 8: Account provisioning and admin user management

**Files:**
- Create: `lib/db/provisioning.ts`, `tests/stubs/server-only.ts`, `tests/integration/provisioning.test.ts`, `app/[locale]/(admin)/admin/users/page.tsx`, `app/[locale]/(admin)/admin/users/actions.ts`, `app/[locale]/(admin)/admin/users/new-user-form.tsx`, `app/[locale]/(admin)/admin/users/[id]/page.tsx`, `app/[locale]/(admin)/admin/users/[id]/actions.ts`, `app/[locale]/(admin)/admin/users/[id]/account-controls.tsx`, `tests/e2e/admin-users.spec.ts`
- Modify: `vitest.integration.config.ts`, `vitest.config.ts` (alias `server-only`), `messages/*.json`

**Interfaces:**
- Consumes: `createSupabaseAdminClient`, `serverEnv` (Task 5); `isValidLoginId`, `loginIdToEmail`, `requireAdmin` (Task 7).
- Produces:
  - `newAccountSchema`, `type NewAccountInput = { loginId; password; role?: 'learner'|'admin'; displayName?; preferredLanguage?: 'th'|'en'|'zh' }`
  - `class ProvisioningError extends Error { code: 'duplicate'|'invalid'|'unknown' }`
  - `createAccount(input): Promise<{ id: string; loginId: string }>`
  - `setAccountPassword(userId, newPassword): Promise<void>`
  - `setAccountStatus(userId, 'active'|'disabled'): Promise<void>` (bans/unbans the auth user *and* updates `profiles.status`)
  - Admin pages `/admin/users`, `/admin/users/[id]` (Task 13 adds the assignment panel to the latter)

- [ ] **Step 1: Stub `server-only` for Vitest** (the package throws when imported outside React Server Components)

`tests/stubs/server-only.ts`:

```ts
// Vitest runs in plain Node; `server-only` throws there. Aliased in both vitest configs.
export {};
```

In **both** `vitest.config.ts` and `vitest.integration.config.ts`, change `resolve` to:

```ts
resolve: {
  alias: {
    '@': path.resolve(__dirname),
    'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
  },
},
```

- [ ] **Step 2: Write the failing integration test** — `tests/integration/provisioning.test.ts`

```ts
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { ProvisioningError, createAccount, setAccountPassword, setAccountStatus } from '@/lib/db/provisioning';
import { adminClient, clientFor, deleteTestUser, type TestUser } from './helpers';

const created: string[] = [];
const unique = () => `prov-${randomUUID().slice(0, 8)}`;

afterAll(async () => {
  await Promise.all(created.map((id) => deleteTestUser(id)));
});

describe('createAccount', () => {
  it('creates an auth user and a profile with a lower-cased login id', async () => {
    const loginId = unique().toUpperCase();
    const { id } = await createAccount({ loginId, password: 'Strong-Pass-123', displayName: 'Test Learner' });
    created.push(id);
    const { data } = await adminClient().from('profiles').select('*').eq('id', id).single();
    expect(data).toMatchObject({
      login_id: loginId.toLowerCase(),
      role: 'learner',
      display_name: 'Test Learner',
      preferred_language: 'th',
      status: 'active',
    });
  });

  it('rejects a duplicate login id with code "duplicate"', async () => {
    const loginId = unique();
    const { id } = await createAccount({ loginId, password: 'Strong-Pass-123' });
    created.push(id);
    await expect(createAccount({ loginId, password: 'Strong-Pass-123' })).rejects.toMatchObject({ code: 'duplicate' });
  });

  it('rejects an invalid login id or a short password with code "invalid"', async () => {
    await expect(createAccount({ loginId: 'a b', password: 'Strong-Pass-123' })).rejects.toBeInstanceOf(ProvisioningError);
    await expect(createAccount({ loginId: unique(), password: 'short' })).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('setAccountPassword / setAccountStatus', () => {
  it('changes the password and disabling blocks sign-in until re-enabled', async () => {
    const loginId = unique();
    const { id } = await createAccount({ loginId, password: 'Strong-Pass-123' });
    created.push(id);
    const user: TestUser = { id, loginId, password: 'Strong-Pass-123', role: 'learner' };

    await setAccountPassword(id, 'Another-Pass-456');
    await expect(clientFor(user)).rejects.toBeTruthy();
    await expect(clientFor({ ...user, password: 'Another-Pass-456' })).resolves.toBeTruthy();

    await setAccountStatus(id, 'disabled');
    await expect(clientFor({ ...user, password: 'Another-Pass-456' })).rejects.toBeTruthy();
    const { data: disabled } = await adminClient().from('profiles').select('status').eq('id', id).single();
    expect(disabled?.status).toBe('disabled');

    await setAccountStatus(id, 'active');
    await expect(clientFor({ ...user, password: 'Another-Pass-456' })).resolves.toBeTruthy();
  });
});
```

Run: `pnpm test:integration` → FAIL (module missing).

- [ ] **Step 3: Implement `lib/db/provisioning.ts`**

```ts
import 'server-only';
import { z } from 'zod';
import { isValidLoginId, loginIdToEmail } from '@/lib/auth/internal-email';
import { createSupabaseAdminClient } from './admin';
import { serverEnv } from './env';

export const newAccountSchema = z.object({
  loginId: z.string().trim().refine(isValidLoginId, 'Login ID must be 3–64 letters, digits, ".", "_" or "-"'),
  password: z.string().min(10, 'Password must be at least 10 characters'),
  role: z.enum(['learner', 'admin']).default('learner'),
  displayName: z.string().trim().max(120).optional(),
  preferredLanguage: z.enum(['th', 'en', 'zh']).default('th'),
});
export type NewAccountInput = z.input<typeof newAccountSchema>;

export class ProvisioningError extends Error {
  constructor(
    message: string,
    public readonly code: 'duplicate' | 'invalid' | 'unknown',
  ) {
    super(message);
    this.name = 'ProvisioningError';
  }
}

/** Admin-only. Creates the auth user; the `on_auth_user_created` trigger creates the profile. */
export async function createAccount(input: NewAccountInput): Promise<{ id: string; loginId: string }> {
  const parsed = newAccountSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProvisioningError(parsed.error.issues[0]?.message ?? 'Invalid input', 'invalid');
  }
  const { loginId, password, role, displayName, preferredLanguage } = parsed.data;
  const normalizedLoginId = loginId.toLowerCase();

  const { data, error } = await createSupabaseAdminClient().auth.admin.createUser({
    email: loginIdToEmail(normalizedLoginId, serverEnv().APP_INTERNAL_EMAIL_DOMAIN),
    password,
    email_confirm: true,
    user_metadata: {
      login_id: normalizedLoginId,
      display_name: displayName ?? null,
      preferred_language: preferredLanguage,
    },
    app_metadata: { role },
  });
  if (error || !data.user) {
    const message = error?.message ?? 'createUser returned no user';
    if (/already|exists|registered/i.test(message)) {
      throw new ProvisioningError('Login ID already exists', 'duplicate');
    }
    throw new ProvisioningError(message, 'unknown');
  }
  return { id: data.user.id, loginId: normalizedLoginId };
}

export async function setAccountPassword(userId: string, newPassword: string): Promise<void> {
  if (newPassword.length < 10) {
    throw new ProvisioningError('Password must be at least 10 characters', 'invalid');
  }
  const { error } = await createSupabaseAdminClient().auth.admin.updateUserById(userId, { password: newPassword });
  if (error) throw new ProvisioningError(error.message, 'unknown');
}

/** Disabling bans the auth user (blocks sign-in and token refresh) and marks the profile. */
export async function setAccountStatus(userId: string, status: 'active' | 'disabled'): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: status === 'disabled' ? '876600h' : 'none',
  });
  if (authError) throw new ProvisioningError(authError.message, 'unknown');
  const { error } = await admin.from('profiles').update({ status }).eq('id', userId);
  if (error) throw new ProvisioningError(error.message, 'unknown');
}
```

Run: `pnpm test:integration` → PASS (4 new tests).

- [ ] **Step 4: Admin users list + create form**

`app/[locale]/(admin)/admin/users/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { ProvisioningError, createAccount } from '@/lib/db/provisioning';

export type CreateUserState = { ok: boolean; error: string | null; createdLoginId: string | null };

export async function createUserAction(_prev: CreateUserState, formData: FormData): Promise<CreateUserState> {
  const locale = String(formData.get('locale') ?? 'th');
  await requireAdmin(locale);
  try {
    const { loginId } = await createAccount({
      loginId: String(formData.get('loginId') ?? ''),
      password: String(formData.get('password') ?? ''),
      role: formData.get('role') === 'admin' ? 'admin' : 'learner',
      displayName: String(formData.get('displayName') ?? '') || undefined,
      preferredLanguage: (formData.get('preferredLanguage') as 'th' | 'en' | 'zh') ?? 'th',
    });
    revalidatePath(`/${locale}/admin/users`);
    return { ok: true, error: null, createdLoginId: loginId };
  } catch (e) {
    const message = e instanceof ProvisioningError ? e.message : 'Unexpected error';
    return { ok: false, error: message, createdLoginId: null };
  }
}
```

`app/[locale]/(admin)/admin/users/new-user-form.tsx`:

```tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { createUserAction, type CreateUserState } from './actions';

export function NewUserForm() {
  const locale = useLocale();
  const t = useTranslations('admin.users');
  const [state, formAction, pending] = useActionState<CreateUserState, FormData>(createUserAction, {
    ok: false,
    error: null,
    createdLoginId: null,
  });
  return (
    <form action={formAction} className="grid max-w-md gap-3 rounded border p-4">
      <input type="hidden" name="locale" value={locale} />
      <h2 className="font-semibold">{t('new')}</h2>
      <label className="text-sm">{t('loginId')}<input name="loginId" required className="mt-1 w-full rounded border px-2 py-1" /></label>
      <label className="text-sm">{t('password')}<input name="password" type="text" required minLength={10} className="mt-1 w-full rounded border px-2 py-1" /></label>
      <label className="text-sm">{t('displayName')}<input name="displayName" className="mt-1 w-full rounded border px-2 py-1" /></label>
      <label className="text-sm">{t('language')}
        <select name="preferredLanguage" defaultValue="th" className="mt-1 w-full rounded border px-2 py-1">
          <option value="th">ไทย</option><option value="en">English</option><option value="zh">中文</option>
        </select>
      </label>
      <label className="text-sm">{t('role')}
        <select name="role" defaultValue="learner" className="mt-1 w-full rounded border px-2 py-1">
          <option value="learner">{t('roleLearner')}</option><option value="admin">{t('roleAdmin')}</option>
        </select>
      </label>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {state.ok && <p role="status" className="text-sm text-green-700">{t('created', { loginId: state.createdLoginId ?? '' })}</p>}
      <button type="submit" disabled={pending} className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50">{t('create')}</button>
    </form>
  );
}
```

`app/[locale]/(admin)/admin/users/page.tsx`:

```tsx
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/db/server';
import { NewUserForm } from './new-user-form';

export default async function UsersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireAdmin(locale);
  const supabase = await createSupabaseServerClient();
  const { data: users } = await supabase
    .from('profiles')
    .select('id, login_id, role, display_name, status, created_at')
    .order('created_at', { ascending: false });
  const t = await getTranslations('admin.users');
  return (
    <section className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <NewUserForm />
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b"><th className="py-2">{t('loginId')}</th><th>{t('displayName')}</th><th>{t('role')}</th><th>{t('status')}</th></tr></thead>
        <tbody>
          {(users ?? []).map((u) => (
            <tr key={u.id} className="border-b">
              <td className="py-2"><Link href={`/admin/users/${u.id}`} className="underline">{u.login_id}</Link></td>
              <td>{u.display_name ?? '—'}</td>
              <td>{u.role}</td>
              <td>{u.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 5: User detail page with password reset and enable/disable**

`app/[locale]/(admin)/admin/users/[id]/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { ProvisioningError, setAccountPassword, setAccountStatus } from '@/lib/db/provisioning';

export type AccountActionState = { message: string | null; error: string | null };

export async function resetPasswordAction(_prev: AccountActionState, formData: FormData): Promise<AccountActionState> {
  const locale = String(formData.get('locale') ?? 'th');
  const userId = String(formData.get('userId') ?? '');
  await requireAdmin(locale);
  try {
    await setAccountPassword(userId, String(formData.get('password') ?? ''));
    return { message: 'password-updated', error: null };
  } catch (e) {
    return { message: null, error: e instanceof ProvisioningError ? e.message : 'Unexpected error' };
  }
}

export async function setStatusAction(_prev: AccountActionState, formData: FormData): Promise<AccountActionState> {
  const locale = String(formData.get('locale') ?? 'th');
  const userId = String(formData.get('userId') ?? '');
  const status = formData.get('status') === 'disabled' ? 'disabled' : 'active';
  const admin = await requireAdmin(locale);
  if (admin.id === userId && status === 'disabled') return { message: null, error: 'You cannot disable your own account' };
  try {
    await setAccountStatus(userId, status);
    revalidatePath(`/${locale}/admin/users/${userId}`);
    return { message: 'status-updated', error: null };
  } catch (e) {
    return { message: null, error: e instanceof ProvisioningError ? e.message : 'Unexpected error' };
  }
}
```

`app/[locale]/(admin)/admin/users/[id]/account-controls.tsx`:

```tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { resetPasswordAction, setStatusAction, type AccountActionState } from './actions';

const initial: AccountActionState = { message: null, error: null };

export function AccountControls({ userId, status }: { userId: string; status: 'active' | 'disabled' }) {
  const locale = useLocale();
  const t = useTranslations('admin.users');
  const [pwState, pwAction, pwPending] = useActionState(resetPasswordAction, initial);
  const [stState, stAction, stPending] = useActionState(setStatusAction, initial);
  return (
    <div className="grid max-w-md gap-4">
      <form action={pwAction} className="grid gap-2 rounded border p-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="userId" value={userId} />
        <label className="text-sm">{t('newPassword')}<input name="password" type="text" required minLength={10} className="mt-1 w-full rounded border px-2 py-1" /></label>
        {pwState.error && <p role="alert" className="text-sm text-red-700">{pwState.error}</p>}
        {pwState.message && <p role="status" className="text-sm text-green-700">{t('passwordUpdated')}</p>}
        <button type="submit" disabled={pwPending} className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50">{t('resetPassword')}</button>
      </form>
      <form action={stAction} className="grid gap-2 rounded border p-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="status" value={status === 'active' ? 'disabled' : 'active'} />
        {stState.error && <p role="alert" className="text-sm text-red-700">{stState.error}</p>}
        <button type="submit" disabled={stPending} className="rounded border px-4 py-2 disabled:opacity-50">
          {status === 'active' ? t('disable') : t('enable')}
        </button>
      </form>
    </div>
  );
}
```

`app/[locale]/(admin)/admin/users/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/db/server';
import { AccountControls } from './account-controls';

export default async function UserDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  await requireAdmin(locale);
  const supabase = await createSupabaseServerClient();
  const { data: user } = await supabase.from('profiles').select('*').eq('id', id).single();
  if (!user) notFound();
  const t = await getTranslations('admin.users');
  return (
    <section className="grid gap-6">
      <Link href="/admin/users" className="text-sm underline">← {t('title')}</Link>
      <h1 className="text-2xl font-semibold">{user.login_id}</h1>
      <dl className="grid max-w-md grid-cols-2 gap-1 text-sm">
        <dt>{t('displayName')}</dt><dd>{user.display_name ?? '—'}</dd>
        <dt>{t('role')}</dt><dd>{user.role}</dd>
        <dt>{t('language')}</dt><dd>{user.preferred_language}</dd>
        <dt>{t('status')}</dt><dd data-testid="account-status">{user.status}</dd>
      </dl>
      <AccountControls userId={user.id} status={user.status as 'active' | 'disabled'} />
    </section>
  );
}
```

- [ ] **Step 6: Messages** — add under `admin.users` in all three catalogs (English shown; translate for `th`/`zh` with the same keys):

```json
"users": {
  "title": "Users",
  "new": "New user",
  "loginId": "Login ID",
  "password": "Initial password",
  "newPassword": "New password",
  "displayName": "Display name",
  "language": "Language",
  "role": "Role",
  "roleLearner": "Learner",
  "roleAdmin": "Administrator",
  "status": "Status",
  "create": "Create user",
  "created": "Created {loginId}",
  "resetPassword": "Reset password",
  "passwordUpdated": "Password updated",
  "disable": "Disable account",
  "enable": "Enable account"
}
```

Thai values the E2E tests depend on — use exactly: `"create": "สร้างผู้ใช้"`, `"title": "ผู้ใช้งาน"`, `"new": "ผู้ใช้ใหม่"`.

Run `pnpm test:unit` — the parity test must pass for all three catalogs.

- [ ] **Step 7: E2E** — `tests/e2e/admin-users.spec.ts`

```ts
import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { login } from './helpers';

test('admin creates a learner who can then sign in', async ({ page }) => {
  const loginId = `e2e-new-${Date.now()}`;
  await login(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/users');
  await page.locator('input[name="loginId"]').fill(loginId);
  await page.locator('input[name="password"]').fill('Learner-Pass-123');
  await page.locator('input[name="displayName"]').fill('E2E Learner');
  await page.getByRole('button', { name: 'สร้างผู้ใช้' }).click();
  await expect(page.getByRole('status')).toContainText(loginId);
  await expect(page.getByRole('link', { name: loginId })).toBeVisible();

  await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
  await login(page, loginId, 'Learner-Pass-123');
  await expect(page).toHaveURL(/\/th\/dashboard$/);
  await expect(page.getByText('ยินดีต้อนรับ E2E Learner')).toBeVisible();
});
```

(`สร้างผู้ใช้` must be the Thai value of `admin.users.create`.)

Run: `pnpm test:e2e` → 5 passed.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(admin): account provisioning, password reset and enable/disable with admin user pages"
```

---

### Task 9: DBD records migration with audit trail and private document bucket

**Files:**
- Create: `supabase/migrations/20260911000002_dbd_records.sql`, `tests/integration/dbd-records.rls.test.ts`, `tests/fixtures/tiny.pdf` (any valid 1-page PDF under 20 KB — generate with `node -e "require('fs').writeFileSync('tests/fixtures/tiny.pdf', '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF\n')"`)
- Modify: `lib/db/database.types.ts` (regenerate)

**Interfaces:**
- Produces: tables `public.dbd_records`, `public.audit_logs` (`entity_id text` — key of the audited row; a small deviation from the spec's `uuid` so key-based tables such as `policy_config` can be audited too), function `public.audit_row_change()` (generic trigger, actor = `auth.uid()`), bucket `dbd-documents` (private, PDF only, 10 MB), RLS: admins full on both; learners nothing yet (their read policy on `dbd_records` arrives with assignments in Task 10).

- [ ] **Step 1: Write the migration** — `supabase/migrations/20260911000002_dbd_records.sql`

```sql
-- Audit log: written only by the audit_row_change() trigger (security definer).
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,          -- e.g. dbd_records.update
  entity_type text not null,     -- table name
  entity_id text,                -- primary key of the row (uuid or key) as text
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);

alter table public.audit_logs enable row level security;

create policy "audit: admins read"
  on public.audit_logs for select
  to authenticated
  using (public.is_admin());

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before, after)
  values (
    auth.uid(),
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'key'),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- DBD records: one per company certificate (หนังสือรับรอง). Only confirmed records can be assigned.
create table public.dbd_records (
  id uuid primary key default gen_random_uuid(),
  juristic_id text,
  certificate_no text,
  document_ref text,
  company_name_th text,
  company_name_en text,
  registered_on date,
  issued_on date,
  registered_capital numeric(18, 2),
  head_office_address text,
  directors jsonb not null default '[]'::jsonb,
  signing_authority text,
  objectives_count integer,
  issuing_office text,
  registrar_name text,
  structured_data jsonb not null default '{}'::jsonb,
  document_path text,
  extraction_status text not null default 'none'
    check (extraction_status in ('none', 'pending', 'extracted', 'confirmed')),
  extraction_raw jsonb,
  confirmed_by uuid references public.profiles (id),
  confirmed_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dbd_juristic_id_format
    check (juristic_id is null or juristic_id ~ '^[0-9]{13}$'),
  constraint dbd_issue_not_before_registration
    check (issued_on is null or registered_on is null or issued_on >= registered_on),
  constraint dbd_confirmed_requires_core_fields
    check (
      extraction_status <> 'confirmed'
      or (juristic_id is not null and company_name_th is not null
          and confirmed_by is not null and confirmed_at is not null)
    )
);

comment on column public.dbd_records.issued_on is
  'Certificate "Issued on" date (CE). Drives Bank Verification eligibility (decision D2). May be null: then no eligibility snapshot exists and the record is flagged.';

create trigger dbd_records_set_updated_at
  before update on public.dbd_records
  for each row execute function public.set_updated_at();

create trigger dbd_records_audit
  after insert or update or delete on public.dbd_records
  for each row execute function public.audit_row_change();

alter table public.dbd_records enable row level security;

create policy "dbd: admins do everything"
  on public.dbd_records for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
-- "dbd: learners read their assigned record" is created in 20260911000003 (needs assignments).

-- Private bucket for certificate PDFs. Learners never touch the bucket directly; the server
-- issues short-lived signed URLs after an ownership check (spec §5).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dbd-documents', 'dbd-documents', false, 10485760, array['application/pdf']);

create policy "dbd docs: admins do everything"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'dbd-documents' and public.is_admin())
  with check (bucket_id = 'dbd-documents' and public.is_admin());
```

- [ ] **Step 2: Apply and regenerate types**

Run: `pnpm db:reset && pnpm db:types`
Expected: both migrations apply; `database.types.ts` now has `dbd_records` and `audit_logs`.

- [ ] **Step 3: Write the failing integration test** — `tests/integration/dbd-records.rls.test.ts`

```ts
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, clientFor, createTestUser, deleteTestUser, type Client, type TestUser } from './helpers';

const RLS_DENIED = '42501';
const CHECK_VIOLATION = '23514';

describe('dbd_records + audit_logs + dbd-documents bucket', () => {
  let admin: TestUser;
  let learner: TestUser;
  let asAdmin: Client;
  let asLearner: Client;
  const createdRecordIds: string[] = [];
  const uploadedPaths: string[] = [];

  beforeAll(async () => {
    [admin, learner] = await Promise.all([createTestUser('admin'), createTestUser('learner')]);
    [asAdmin, asLearner] = await Promise.all([clientFor(admin), clientFor(learner)]);
  });

  afterAll(async () => {
    const svc = adminClient();
    if (uploadedPaths.length) await svc.storage.from('dbd-documents').remove(uploadedPaths);
    if (createdRecordIds.length) await svc.from('dbd_records').delete().in('id', createdRecordIds);
    await Promise.all([admin, learner].map((u) => deleteTestUser(u.id)));
  });

  it('lets an admin insert a record and writes an audit row attributed to them', async () => {
    const { data, error } = await asAdmin
      .from('dbd_records')
      .insert({ company_name_th: 'บริษัท ทดสอบ จำกัด', juristic_id: '0105568233704', issued_on: '2026-07-13' })
      .select()
      .single();
    expect(error).toBeNull();
    createdRecordIds.push(data!.id);
    const { data: audit } = await adminClient()
      .from('audit_logs')
      .select('actor_id, action, entity_id')
      .eq('entity_type', 'dbd_records')
      .eq('entity_id', data!.id);
    expect(audit).toEqual([{ actor_id: admin.id, action: 'dbd_records.insert', entity_id: data!.id }]);
  });

  it('blocks learners from inserting or reading records', async () => {
    const { error } = await asLearner.from('dbd_records').insert({ company_name_th: 'x' });
    expect(error?.code).toBe(RLS_DENIED);
    const { data } = await asLearner.from('dbd_records').select('id');
    expect(data).toEqual([]);
  });

  it('rejects an issue date before the registration date', async () => {
    const { error } = await asAdmin
      .from('dbd_records')
      .insert({ company_name_th: 'x', registered_on: '2026-07-13', issued_on: '2026-04-10' });
    expect(error?.code).toBe(CHECK_VIOLATION);
  });

  it('rejects a juristic id that is not 13 digits', async () => {
    const { error } = await asAdmin.from('dbd_records').insert({ company_name_th: 'x', juristic_id: '12345' });
    expect(error?.code).toBe(CHECK_VIOLATION);
  });

  it('refuses confirmation while core fields are missing', async () => {
    const { data } = await asAdmin.from('dbd_records').insert({ company_name_en: 'No Thai name' }).select().single();
    createdRecordIds.push(data!.id);
    const { error } = await asAdmin
      .from('dbd_records')
      .update({ extraction_status: 'confirmed', confirmed_by: admin.id, confirmed_at: new Date().toISOString() })
      .eq('id', data!.id);
    expect(error?.code).toBe(CHECK_VIOLATION);
  });

  it('lets admins upload PDFs and denies learners any bucket access', async () => {
    const bytes = readFileSync('tests/fixtures/tiny.pdf');
    const path = `rls-test/${Date.now()}.pdf`;
    const { error } = await asAdmin.storage.from('dbd-documents').upload(path, bytes, { contentType: 'application/pdf' });
    expect(error).toBeNull();
    uploadedPaths.push(path);

    const { error: learnerUpload } = await asLearner.storage
      .from('dbd-documents')
      .upload(`rls-test/learner-${Date.now()}.pdf`, bytes, { contentType: 'application/pdf' });
    expect(learnerUpload).not.toBeNull();

    const { error: learnerDownload } = await asLearner.storage.from('dbd-documents').download(path);
    expect(learnerDownload).not.toBeNull();
  });
});
```

Run: `pnpm test:integration` → PASS (tests fail only if the migration did not apply; fix the SQL, `pnpm db:reset`, rerun).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(db): dbd_records with constraints, generic audit trigger and private document bucket"
```

---

### Task 10: Assignments, eligibility snapshots and policy config (database-enforced +45 rule)

**Files:**
- Create: `supabase/migrations/20260911000003_assignments_eligibility.sql`, `tests/integration/assignments.test.ts`, `tests/integration/eligibility.parity.test.ts`, `lib/config/policy.ts`
- Modify: `lib/db/database.types.ts` (regenerate)

**Interfaces:**
- Produces:
  - Tables `user_dbd_assignments`, `eligibility_snapshots`, `policy_config` (seeded with the spec §4.6 defaults).
  - SQL functions `policy_int(key)`, `compute_eligibility_snapshot(user_id, record_id, reason)`; triggers: assignment insert requires a confirmed record and creates a snapshot; `issued_on` change re-snapshots every active assignment; audit on assignments and policy_config.
  - Learner read policy on `dbd_records` (via active assignment).
  - `getPolicy(key)` typed reader with defaults (`lib/config/policy.ts`).

- [ ] **Step 1: Write the migration** — `supabase/migrations/20260911000003_assignments_eligibility.sql`

```sql
-- Every open business rule lives here (spec §4.6). JSON null means "not set".
create table public.policy_config (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

alter table public.policy_config enable row level security;

create policy "policy: admins do everything"
  on public.policy_config for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create trigger policy_config_audit
  after insert or update or delete on public.policy_config
  for each row execute function public.audit_row_change();

insert into public.policy_config (key, value) values
  ('bank_eligibility_days', '45'::jsonb),
  ('bank_access_expiry_days', 'null'::jsonb),
  ('exam_passing_mark_percent', '70'::jsonb),
  ('quiz_question_count', '10'::jsonb),
  ('exam_question_count', '20'::jsonb),
  ('exam_max_attempts', 'null'::jsonb),
  ('exam_retry_wait_hours', '0'::jsonb),
  ('exam_pass_rule', '"any"'::jsonb),
  ('require_exam_pass_for_name_card', 'false'::jsonb),
  ('require_exam_pass_for_bank_call', 'true'::jsonb),
  ('call_max_sessions', 'null'::jsonb),
  ('telegram_admin_chat_ids', '[]'::jsonb),
  ('email_admin_recipients', '[]'::jsonb),
  ('study_completion_tracking', '"viewed"'::jsonb);

create or replace function public.policy_int(p_key text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when jsonb_typeof(value) = 'number' then (value #>> '{}')::integer else null end
  from public.policy_config
  where key = p_key;
$$;

-- One learner ↔ one active company.
create table public.user_dbd_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  dbd_record_id uuid not null references public.dbd_records (id),
  assigned_by uuid references public.profiles (id),
  assigned_at timestamptz not null default now(),
  active boolean not null default true,
  deactivated_at timestamptz
);

create unique index user_dbd_assignments_one_active
  on public.user_dbd_assignments (user_id) where active;

create index user_dbd_assignments_active_record_idx
  on public.user_dbd_assignments (dbd_record_id) where active;

-- Append-only history of eligibility calculations (ADR 0005).
create table public.eligibility_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  dbd_record_id uuid not null references public.dbd_records (id),
  issued_on_snapshot date not null,
  available_from date not null,
  expires_at date,
  calculated_at timestamptz not null default now(),
  reason text not null check (reason in ('assignment', 'issue_date_changed', 'policy_changed'))
);

create index eligibility_snapshots_latest_idx
  on public.eligibility_snapshots (user_id, dbd_record_id, calculated_at desc);

-- BR-002: available_from = issued_on + N calendar days (N from policy_config, default 45).
-- No snapshot when issued_on is null: the record is flagged for correction (PRD §16).
create or replace function public.compute_eligibility_snapshot(p_user_id uuid, p_record_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_issued date;
  v_days integer := coalesce(public.policy_int('bank_eligibility_days'), 45);
  v_expiry_days integer := public.policy_int('bank_access_expiry_days');
begin
  select issued_on into v_issued from public.dbd_records where id = p_record_id;
  if v_issued is null then
    return;
  end if;

  insert into public.eligibility_snapshots
    (user_id, dbd_record_id, issued_on_snapshot, available_from, expires_at, reason)
  values (
    p_user_id,
    p_record_id,
    v_issued,
    v_issued + v_days,
    case when v_expiry_days is null then null else v_issued + v_days + v_expiry_days end,
    p_reason
  );
end;
$$;

create or replace function public.assignment_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select extraction_status into v_status from public.dbd_records where id = new.dbd_record_id;
  if v_status is distinct from 'confirmed' then
    raise exception 'DBD record % is not confirmed (status: %)', new.dbd_record_id, coalesce(v_status, 'missing')
      using errcode = 'check_violation';
  end if;
  if new.assigned_by is null then
    new.assigned_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger user_dbd_assignments_before_insert
  before insert on public.user_dbd_assignments
  for each row execute function public.assignment_before_insert();

create or replace function public.assignment_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.compute_eligibility_snapshot(new.user_id, new.dbd_record_id, 'assignment');
  return new;
end;
$$;

create trigger user_dbd_assignments_after_insert
  after insert on public.user_dbd_assignments
  for each row execute function public.assignment_after_insert();

create or replace function public.dbd_issue_date_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if new.issued_on is distinct from old.issued_on then
    for r in
      select user_id from public.user_dbd_assignments
      where dbd_record_id = new.id and active
    loop
      perform public.compute_eligibility_snapshot(r.user_id, new.id, 'issue_date_changed');
    end loop;
  end if;
  return new;
end;
$$;

create trigger dbd_records_issue_date_changed
  after update of issued_on on public.dbd_records
  for each row execute function public.dbd_issue_date_changed();

create trigger user_dbd_assignments_audit
  after insert or update or delete on public.user_dbd_assignments
  for each row execute function public.audit_row_change();

alter table public.user_dbd_assignments enable row level security;

create policy "assignments: learners read their own"
  on public.user_dbd_assignments for select
  to authenticated
  using (user_id = auth.uid());

create policy "assignments: admins do everything"
  on public.user_dbd_assignments for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.eligibility_snapshots enable row level security;

create policy "eligibility: learners read their own"
  on public.eligibility_snapshots for select
  to authenticated
  using (user_id = auth.uid());

create policy "eligibility: admins read"
  on public.eligibility_snapshots for select
  to authenticated
  using (public.is_admin());
-- No insert/update/delete policies: rows are written only by compute_eligibility_snapshot().

create policy "dbd: learners read their assigned record"
  on public.dbd_records for select
  to authenticated
  using (
    exists (
      select 1 from public.user_dbd_assignments a
      where a.dbd_record_id = dbd_records.id and a.user_id = auth.uid() and a.active
    )
  );
```

Run: `pnpm db:reset && pnpm db:types` → three migrations applied.

- [ ] **Step 2: Write the failing behaviour tests** — `tests/integration/assignments.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, clientFor, createTestUser, deleteTestUser, type Client, type TestUser } from './helpers';

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

async function createRecord(asAdmin: Client, adminId: string, fields: Record<string, unknown>, confirm = true) {
  const { data, error } = await asAdmin
    .from('dbd_records')
    .insert({ company_name_th: 'บริษัท ทดสอบ จำกัด', juristic_id: '0105568233704', ...fields })
    .select()
    .single();
  if (error) throw error;
  if (confirm) {
    const { error: e } = await asAdmin
      .from('dbd_records')
      .update({ extraction_status: 'confirmed', confirmed_by: adminId, confirmed_at: new Date().toISOString() })
      .eq('id', data.id);
    if (e) throw e;
  }
  return data.id as string;
}

describe('assignments and eligibility snapshots', () => {
  let admin: TestUser;
  let learnerA: TestUser;
  let learnerB: TestUser;
  let asAdmin: Client;
  let asA: Client;
  let asB: Client;
  const recordIds: string[] = [];

  beforeAll(async () => {
    [admin, learnerA, learnerB] = await Promise.all([
      createTestUser('admin'),
      createTestUser('learner'),
      createTestUser('learner'),
    ]);
    [asAdmin, asA, asB] = await Promise.all([clientFor(admin), clientFor(learnerA), clientFor(learnerB)]);
  });

  afterAll(async () => {
    const svc = adminClient();
    await svc.from('user_dbd_assignments').delete().in('dbd_record_id', recordIds);
    await svc.from('eligibility_snapshots').delete().in('dbd_record_id', recordIds);
    await svc.from('dbd_records').delete().in('id', recordIds);
    await Promise.all([admin, learnerA, learnerB].map((u) => deleteTestUser(u.id)));
  });

  it('refuses to assign an unconfirmed record', async () => {
    const id = await createRecord(asAdmin, admin.id, { issued_on: '2026-09-11' }, false);
    recordIds.push(id);
    const { error } = await asAdmin.from('user_dbd_assignments').insert({ user_id: learnerA.id, dbd_record_id: id });
    expect(error?.code).toBe(CHECK_VIOLATION);
  });

  it('assigns a confirmed record, records assigned_by, and snapshots issued_on + 45 days (AC-001)', async () => {
    const id = await createRecord(asAdmin, admin.id, { issued_on: '2026-09-11' });
    recordIds.push(id);
    const { data: assignment, error } = await asAdmin
      .from('user_dbd_assignments')
      .insert({ user_id: learnerA.id, dbd_record_id: id })
      .select()
      .single();
    expect(error).toBeNull();
    expect(assignment?.assigned_by).toBe(admin.id);

    const { data: snapshots } = await asAdmin
      .from('eligibility_snapshots')
      .select('issued_on_snapshot, available_from, expires_at, reason')
      .eq('user_id', learnerA.id)
      .eq('dbd_record_id', id);
    expect(snapshots).toEqual([
      { issued_on_snapshot: '2026-09-11', available_from: '2026-10-26', expires_at: null, reason: 'assignment' },
    ]);
  });

  it('allows only one active assignment per learner', async () => {
    const id = await createRecord(asAdmin, admin.id, { issued_on: '2026-09-11' });
    recordIds.push(id);
    const { error } = await asAdmin.from('user_dbd_assignments').insert({ user_id: learnerA.id, dbd_record_id: id });
    expect(error?.code).toBe(UNIQUE_VIOLATION);
  });

  it('re-snapshots every active assignment when issued_on changes, keeping history', async () => {
    const { data: active } = await asAdmin
      .from('user_dbd_assignments')
      .select('dbd_record_id')
      .eq('user_id', learnerA.id)
      .eq('active', true)
      .single();
    const recordId = active!.dbd_record_id;

    const { error } = await asAdmin.from('dbd_records').update({ issued_on: '2026-09-12' }).eq('id', recordId);
    expect(error).toBeNull();

    const { data: snapshots } = await asAdmin
      .from('eligibility_snapshots')
      .select('available_from, reason')
      .eq('user_id', learnerA.id)
      .eq('dbd_record_id', recordId)
      .order('calculated_at', { ascending: true });
    expect(snapshots).toEqual([
      { available_from: '2026-10-26', reason: 'assignment' },
      { available_from: '2026-10-27', reason: 'issue_date_changed' },
    ]);
  });

  it('creates no snapshot when issued_on is missing', async () => {
    const id = await createRecord(asAdmin, admin.id, { issued_on: null });
    recordIds.push(id);
    const { error } = await asAdmin.from('user_dbd_assignments').insert({ user_id: learnerB.id, dbd_record_id: id });
    expect(error).toBeNull();
    const { data } = await asAdmin.from('eligibility_snapshots').select('id').eq('user_id', learnerB.id);
    expect(data).toEqual([]);
  });

  it('lets learners read only their own assignment, record and snapshots', async () => {
    const { data: aRecords } = await asA.from('dbd_records').select('id');
    const { data: aAssignments } = await asA.from('user_dbd_assignments').select('user_id');
    const { data: aSnapshots } = await asA.from('eligibility_snapshots').select('user_id');
    expect(aRecords).toHaveLength(1);
    expect(aAssignments?.every((r) => r.user_id === learnerA.id)).toBe(true);
    expect(aSnapshots?.length).toBeGreaterThan(0);
    expect(aSnapshots?.every((r) => r.user_id === learnerA.id)).toBe(true);

    const { data: bRecords } = await asB.from('dbd_records').select('id');
    expect(bRecords).toHaveLength(1);
    expect(bRecords![0].id).not.toBe(aRecords![0].id);

    const { error: insertDenied } = await asA
      .from('user_dbd_assignments')
      .insert({ user_id: learnerA.id, dbd_record_id: aRecords![0].id });
    expect(insertDenied).not.toBeNull();
  });

  it('deactivating an assignment frees the learner for a new one', async () => {
    const { data: active } = await asAdmin
      .from('user_dbd_assignments')
      .select('id')
      .eq('user_id', learnerA.id)
      .eq('active', true)
      .single();
    const { error } = await asAdmin
      .from('user_dbd_assignments')
      .update({ active: false, deactivated_at: new Date().toISOString() })
      .eq('id', active!.id);
    expect(error).toBeNull();

    const id = await createRecord(asAdmin, admin.id, { issued_on: '2026-10-01' });
    recordIds.push(id);
    const { error: reassign } = await asAdmin
      .from('user_dbd_assignments')
      .insert({ user_id: learnerA.id, dbd_record_id: id });
    expect(reassign).toBeNull();
  });
});
```

- [ ] **Step 3: Write the SQL ↔ TypeScript parity test** — `tests/integration/eligibility.parity.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { availableFrom } from '@/lib/domain/eligibility';
import { adminClient, clientFor, createTestUser, deleteTestUser, type Client, type TestUser } from './helpers';

// Month ends, year ends, leap and non-leap Februaries, and the PRD example.
const DATES = ['2026-09-11', '2026-12-01', '2028-01-20', '2027-01-20', '2026-01-31', '2024-02-29', '2026-07-13'];

describe('eligibility parity: database trigger vs lib/domain', () => {
  let admin: TestUser;
  let asAdmin: Client;
  const learners: TestUser[] = [];
  const recordIds: string[] = [];

  beforeAll(async () => {
    admin = await createTestUser('admin');
    asAdmin = await clientFor(admin);
  });

  afterAll(async () => {
    const svc = adminClient();
    await svc.from('user_dbd_assignments').delete().in('dbd_record_id', recordIds);
    await svc.from('eligibility_snapshots').delete().in('dbd_record_id', recordIds);
    await svc.from('dbd_records').delete().in('id', recordIds);
    await Promise.all([admin, ...learners].map((u) => deleteTestUser(u.id)));
  });

  it.each(DATES)('issued_on %s produces the same available_from in SQL and TypeScript', async (issuedOn) => {
    const learner = await createTestUser('learner');
    learners.push(learner);
    const { data: record } = await asAdmin
      .from('dbd_records')
      .insert({ company_name_th: 'parity', juristic_id: '0105568233704', issued_on: issuedOn })
      .select()
      .single();
    recordIds.push(record!.id);
    await asAdmin
      .from('dbd_records')
      .update({ extraction_status: 'confirmed', confirmed_by: admin.id, confirmed_at: new Date().toISOString() })
      .eq('id', record!.id);
    await asAdmin.from('user_dbd_assignments').insert({ user_id: learner.id, dbd_record_id: record!.id });

    const { data: snapshot } = await asAdmin
      .from('eligibility_snapshots')
      .select('available_from')
      .eq('user_id', learner.id)
      .single();
    expect(snapshot?.available_from).toBe(availableFrom(issuedOn));
  });
});
```

Run: `pnpm test:integration` → PASS (7 + 7 new tests).

- [ ] **Step 4: Typed policy reader** — `lib/config/policy.ts`

```ts
import 'server-only';
import { createSupabaseAdminClient } from '@/lib/db/admin';

/** Keys and pilot defaults from spec §4.6. Defaults apply only if a row is missing. */
export const POLICY_DEFAULTS = {
  bank_eligibility_days: 45 as number,
  bank_access_expiry_days: null as number | null,
  exam_passing_mark_percent: 70 as number,
  quiz_question_count: 10 as number,
  exam_question_count: 20 as number,
  exam_max_attempts: null as number | null,
  exam_retry_wait_hours: 0 as number,
  exam_pass_rule: 'any' as 'any' | 'latest',
  require_exam_pass_for_name_card: false as boolean,
  require_exam_pass_for_bank_call: true as boolean,
  call_max_sessions: null as number | null,
  telegram_admin_chat_ids: [] as string[],
  email_admin_recipients: [] as string[],
  study_completion_tracking: 'viewed' as 'viewed' | 'completed',
};

export type PolicyKey = keyof typeof POLICY_DEFAULTS;
export type PolicyValue<K extends PolicyKey> = (typeof POLICY_DEFAULTS)[K];

export async function getPolicy<K extends PolicyKey>(key: K): Promise<PolicyValue<K>> {
  const { data, error } = await createSupabaseAdminClient()
    .from('policy_config')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  if (!data) return POLICY_DEFAULTS[key];
  return data.value as PolicyValue<K>;
}
```

Run: `pnpm typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): assignments, database-enforced eligibility snapshots and policy_config with parity test"
```

---

### Task 11: DBD record input schema (BE/CE aware) and data-access functions

**Files:**
- Create: `lib/domain/dbd-record.ts`, `tests/unit/domain/dbd-record.test.ts`, `lib/db/dbd-records.ts`, `tests/integration/dbd-records.db.test.ts`

**Interfaces:**
- Consumes: `parseDateInput` (Task 2); `Database` types (Task 10).
- Produces:
  - `dbdRecordInputSchema` (zod; form strings in, normalized values out), `type DbdRecordInput`, `type Director = { name_th: string; name_en: string | null }`
  - `parseDirectorsText(text): Director[]`, `directorsToText(directors): string`
  - `CONFIRMATION_REQUIRED_FIELDS`, `missingFieldsForConfirmation(record): string[]`
  - `type DbdRecordRow`; `listDbdRecords(db)`, `getDbdRecord(db, id)`, `createDbdRecord(db, input, createdBy)`, `updateDbdRecord(db, id, input)`, `confirmDbdRecord(db, id, confirmedBy)`, `uploadDbdDocument(db, id, file)` — all take the caller's Supabase client so RLS and audit attribution apply.

- [ ] **Step 1: Write the failing unit tests** — `tests/unit/domain/dbd-record.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
  dbdRecordInputSchema,
  directorsToText,
  missingFieldsForConfirmation,
  parseDirectorsText,
} from '@/lib/domain/dbd-record';

const valid = {
  juristic_id: '0535569000360',
  certificate_no: 'E53001920000346',
  document_ref: '',
  company_name_th: 'บริษัท ศิรภัทร สยาม จำกัด',
  company_name_en: 'SIRAPHAT SIAM CO., LTD.',
  registered_on: '10/04/2569',
  issued_on: '13/07/2569',
  registered_capital: '2,000,000.00',
  head_office_address: '194/3 หมู่ 2 ต.วังใหญ่ อ.เทพา จ.สงขลา',
  signing_authority: 'กรรมการหนึ่งคนลงลายมือชื่อและประทับตราสำคัญของบริษัท',
  objectives_count: '14',
  issuing_office: '',
  registrar_name: '',
  directors: [{ name_th: 'นางสาวภมรรัตน์ จันทะศิโล', name_en: 'Miss Phamonrat Chantasilo' }],
};

describe('dbdRecordInputSchema', () => {
  it('normalizes Buddhist-Era dates to CE and parses capital with separators', () => {
    const out = dbdRecordInputSchema.parse(valid);
    expect(out.registered_on).toBe('2026-04-10');
    expect(out.issued_on).toBe('2026-07-13');
    expect(out.registered_capital).toBe(2000000);
    expect(out.objectives_count).toBe(14);
    expect(out.document_ref).toBeNull();
  });
  it('rejects a juristic id that is not 13 digits', () => {
    expect(dbdRecordInputSchema.safeParse({ ...valid, juristic_id: '123' }).success).toBe(false);
  });
  it('rejects an issued-on date before the registration date', () => {
    const r = dbdRecordInputSchema.safeParse({ ...valid, issued_on: '01/01/2569' });
    expect(r.success).toBe(false);
  });
  it('rejects an invalid date string', () => {
    expect(dbdRecordInputSchema.safeParse({ ...valid, issued_on: '31/02/2569' }).success).toBe(false);
  });
  it('turns empty strings into nulls and allows an empty form', () => {
    const out = dbdRecordInputSchema.parse({});
    expect(out).toMatchObject({ juristic_id: null, company_name_th: null, issued_on: null, registered_capital: null, directors: [] });
  });
});

describe('directors text', () => {
  it('parses one director per line as "Thai name | English name"', () => {
    expect(parseDirectorsText('นางสาว ก | Miss A\nนาย ข\n\n')).toEqual([
      { name_th: 'นางสาว ก', name_en: 'Miss A' },
      { name_th: 'นาย ข', name_en: null },
    ]);
  });
  it('round-trips', () => {
    const list = [{ name_th: 'นางสาว ก', name_en: 'Miss A' }, { name_th: 'นาย ข', name_en: null }];
    expect(parseDirectorsText(directorsToText(list))).toEqual(list);
  });
});

describe('missingFieldsForConfirmation', () => {
  it('lists the core fields that are still empty', () => {
    expect(missingFieldsForConfirmation({ juristic_id: null, company_name_th: 'x' })).toEqual(['juristic_id']);
    expect(missingFieldsForConfirmation({ juristic_id: '0535569000360', company_name_th: 'x' })).toEqual([]);
  });
});
```

Run: `pnpm test:unit` → FAIL (module missing).

- [ ] **Step 2: Implement `lib/domain/dbd-record.ts`**

```ts
import { z } from 'zod';
import { parseDateInput } from './thai-date';

export type Director = { name_th: string; name_en: string | null };

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

const optionalText = z.preprocess(
  emptyToNull,
  z.string().trim().max(500).nullable().default(null),
);

/** Accepts DD/MM/YYYY (BE or CE) or YYYY-MM-DD; stores CE ISO dates. */
const dateInput = z.preprocess(
  emptyToNull,
  z
    .string()
    .transform((v, ctx) => {
      const iso = parseDateInput(v);
      if (!iso) {
        ctx.addIssue({ code: 'custom', message: 'Invalid date. Use DD/MM/YYYY (BE or CE) or YYYY-MM-DD.' });
        return z.NEVER;
      }
      return iso;
    })
    .nullable()
    .default(null),
);

const numberInput = (integer: boolean) =>
  z.preprocess(
    emptyToNull,
    z
      .union([z.string(), z.number()])
      .transform((v, ctx) => {
        const n = typeof v === 'number' ? v : Number(v.replace(/,/g, '').trim());
        if (!Number.isFinite(n) || n < 0 || (integer && !Number.isInteger(n))) {
          ctx.addIssue({ code: 'custom', message: integer ? 'Must be a whole number' : 'Must be a non-negative number' });
          return z.NEVER;
        }
        return n;
      })
      .nullable()
      .default(null),
  );

export const directorSchema = z.object({
  name_th: z.string().trim().min(1),
  name_en: z.preprocess(emptyToNull, z.string().trim().nullable().default(null)),
});

export const dbdRecordInputSchema = z
  .object({
    juristic_id: z.preprocess(
      emptyToNull,
      z.string().trim().regex(/^\d{13}$/, 'Juristic ID must be 13 digits').nullable().default(null),
    ),
    certificate_no: optionalText,
    document_ref: optionalText,
    company_name_th: optionalText,
    company_name_en: optionalText,
    registered_on: dateInput,
    issued_on: dateInput,
    registered_capital: numberInput(false),
    head_office_address: optionalText,
    signing_authority: optionalText,
    objectives_count: numberInput(true),
    issuing_office: optionalText,
    registrar_name: optionalText,
    directors: z.array(directorSchema).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.issued_on && v.registered_on && v.issued_on < v.registered_on) {
      ctx.addIssue({ code: 'custom', path: ['issued_on'], message: 'Issued-on date cannot be before the registration date' });
    }
  });

export type DbdRecordInput = z.output<typeof dbdRecordInputSchema>;

/** One director per line: "Thai name | English name" (English part optional). */
export function parseDirectorsText(text: string): Director[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [th, en] = line.split('|').map((s) => s.trim());
      return { name_th: th, name_en: en ? en : null };
    });
}

export function directorsToText(directors: Director[]): string {
  return directors.map((d) => (d.name_en ? `${d.name_th} | ${d.name_en}` : d.name_th)).join('\n');
}

export const CONFIRMATION_REQUIRED_FIELDS = ['juristic_id', 'company_name_th'] as const;

export function missingFieldsForConfirmation(
  record: Pick<DbdRecordInput, (typeof CONFIRMATION_REQUIRED_FIELDS)[number]>,
): string[] {
  return CONFIRMATION_REQUIRED_FIELDS.filter((f) => !record[f]);
}
```

Run: `pnpm test:unit` → PASS. (If the installed zod is v3 and `code: 'custom'` errors in TypeScript, use `code: z.ZodIssueCode.custom`.)

- [ ] **Step 3: Write the failing data-access test** — `tests/integration/dbd-records.db.test.ts`

```ts
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  confirmDbdRecord,
  createDbdRecord,
  getDbdRecord,
  listDbdRecords,
  updateDbdRecord,
  uploadDbdDocument,
} from '@/lib/db/dbd-records';
import { dbdRecordInputSchema } from '@/lib/domain/dbd-record';
import { adminClient, clientFor, createTestUser, deleteTestUser, type Client, type TestUser } from './helpers';

describe('lib/db/dbd-records', () => {
  let admin: TestUser;
  let asAdmin: Client;
  let recordId: string;
  let documentPath: string | null = null;

  beforeAll(async () => {
    admin = await createTestUser('admin');
    asAdmin = await clientFor(admin);
  });

  afterAll(async () => {
    const svc = adminClient();
    if (documentPath) await svc.storage.from('dbd-documents').remove([documentPath]);
    if (recordId) await svc.from('dbd_records').delete().eq('id', recordId);
    await deleteTestUser(admin.id);
  });

  it('creates a record from parsed input and attributes it to the admin', async () => {
    const input = dbdRecordInputSchema.parse({ company_name_th: 'บริษัท ทดสอบ จำกัด', issued_on: '13/07/2569' });
    const row = await createDbdRecord(asAdmin, input, admin.id);
    recordId = row.id;
    expect(row).toMatchObject({ company_name_th: 'บริษัท ทดสอบ จำกัด', issued_on: '2026-07-13', created_by: admin.id, extraction_status: 'none' });
  });

  it('refuses confirmation until core fields exist, then confirms', async () => {
    await expect(confirmDbdRecord(asAdmin, recordId, admin.id)).rejects.toMatchObject({ code: '23514' });
    await updateDbdRecord(asAdmin, recordId, dbdRecordInputSchema.parse({ company_name_th: 'บริษัท ทดสอบ จำกัด', juristic_id: '0105568233704', issued_on: '13/07/2569' }));
    const confirmed = await confirmDbdRecord(asAdmin, recordId, admin.id);
    expect(confirmed.extraction_status).toBe('confirmed');
    expect(confirmed.confirmed_by).toBe(admin.id);
  });

  it('uploads the certificate and stores its path', async () => {
    const bytes = readFileSync('tests/fixtures/tiny.pdf');
    const file = new File([bytes], 'certificate.pdf', { type: 'application/pdf' });
    documentPath = await uploadDbdDocument(asAdmin, recordId, file);
    expect(documentPath.startsWith(`${recordId}/`)).toBe(true);
    const row = await getDbdRecord(asAdmin, recordId);
    expect(row?.document_path).toBe(documentPath);
  });

  it('lists records newest first', async () => {
    const rows = await listDbdRecords(asAdmin);
    expect(rows.some((r) => r.id === recordId)).toBe(true);
  });
});
```

- [ ] **Step 4: Implement `lib/db/dbd-records.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DbdRecordInput } from '@/lib/domain/dbd-record';
import type { Database, Json } from './database.types';

type Db = SupabaseClient<Database>;
export type DbdRecordRow = Database['public']['Tables']['dbd_records']['Row'];

function toColumns(input: DbdRecordInput) {
  return { ...input, directors: input.directors as unknown as Json };
}

export async function listDbdRecords(db: Db): Promise<DbdRecordRow[]> {
  const { data, error } = await db.from('dbd_records').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getDbdRecord(db: Db, id: string): Promise<DbdRecordRow | null> {
  const { data, error } = await db.from('dbd_records').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createDbdRecord(db: Db, input: DbdRecordInput, createdBy: string): Promise<DbdRecordRow> {
  const { data, error } = await db
    .from('dbd_records')
    .insert({ ...toColumns(input), created_by: createdBy })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateDbdRecord(db: Db, id: string, input: DbdRecordInput): Promise<DbdRecordRow> {
  const { data, error } = await db.from('dbd_records').update(toColumns(input)).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

/** The database check constraint rejects this while juristic_id / company_name_th are missing. */
export async function confirmDbdRecord(db: Db, id: string, confirmedBy: string): Promise<DbdRecordRow> {
  const { data, error } = await db
    .from('dbd_records')
    .update({ extraction_status: 'confirmed', confirmed_by: confirmedBy, confirmed_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function uploadDbdDocument(db: Db, id: string, file: File | Blob): Promise<string> {
  const path = `${id}/${Date.now()}-certificate.pdf`;
  const { error } = await db.storage.from('dbd-documents').upload(path, file, { contentType: 'application/pdf' });
  if (error) throw error;
  const { error: updateError } = await db.from('dbd_records').update({ document_path: path }).eq('id', id);
  if (updateError) throw updateError;
  return path;
}
```

Run: `pnpm test:integration` → PASS. Run `pnpm typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(dbd): BE/CE-aware record input schema and data-access functions with tests"
```

---

### Task 12: Admin DBD record screens (create, edit, upload certificate, confirm)

**Files:**
- Create: `app/[locale]/(admin)/admin/dbd-records/page.tsx`, `app/[locale]/(admin)/admin/dbd-records/actions.ts`, `app/[locale]/(admin)/admin/dbd-records/dbd-record-form.tsx`, `app/[locale]/(admin)/admin/dbd-records/new/page.tsx`, `app/[locale]/(admin)/admin/dbd-records/[id]/page.tsx`, `app/[locale]/(admin)/admin/dbd-records/[id]/record-tools.tsx`, `tests/e2e/admin-dbd.spec.ts`
- Modify: `app/[locale]/(admin)/admin/page.tsx` (add nav link), `messages/*.json`, `tests/e2e/helpers.ts`

**Interfaces:**
- Consumes: `dbdRecordInputSchema`, `parseDirectorsText`, `directorsToText`, `missingFieldsForConfirmation` (Task 11); `createDbdRecord`, `updateDbdRecord`, `confirmDbdRecord`, `uploadDbdDocument`, `getDbdRecord`, `listDbdRecords` (Task 11); `requireAdmin` (Task 7).
- Produces: `saveDbdRecordAction`, `confirmDbdRecordAction`, `uploadDocumentAction`; E2E helper `createConfirmedRecord(page, fields)`.

- [ ] **Step 1: Server actions** — `app/[locale]/(admin)/admin/dbd-records/actions.ts`

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { confirmDbdRecord, createDbdRecord, getDbdRecord, updateDbdRecord, uploadDbdDocument } from '@/lib/db/dbd-records';
import { createSupabaseServerClient } from '@/lib/db/server';
import { dbdRecordInputSchema, missingFieldsForConfirmation, parseDirectorsText } from '@/lib/domain/dbd-record';

export type SaveState = { ok: boolean; error: string | null; fieldErrors: Record<string, string> };
export type ToolState = { ok: boolean; error: string | null };

const TEXT_FIELDS = [
  'juristic_id', 'certificate_no', 'document_ref', 'company_name_th', 'company_name_en',
  'registered_on', 'issued_on', 'registered_capital', 'head_office_address', 'signing_authority',
  'objectives_count', 'issuing_office', 'registrar_name',
] as const;

function formDataToInput(formData: FormData) {
  const raw: Record<string, unknown> = {};
  for (const f of TEXT_FIELDS) raw[f] = String(formData.get(f) ?? '');
  raw.directors = parseDirectorsText(String(formData.get('directors_text') ?? ''));
  return raw;
}

export async function saveDbdRecordAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  const admin = await requireAdmin(locale);
  const parsed = dbdRecordInputSchema.safeParse(formDataToInput(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? '_')] = issue.message;
    return { ok: false, error: 'validation', fieldErrors };
  }
  const db = await createSupabaseServerClient();
  try {
    if (id) {
      await updateDbdRecord(db, id, parsed.data);
      revalidatePath(`/${locale}/admin/dbd-records/${id}`);
      return { ok: true, error: null, fieldErrors: {} };
    }
    const row = await createDbdRecord(db, parsed.data, admin.id);
    redirect(`/${locale}/admin/dbd-records/${row.id}`);
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e; // Next.js redirect signal
    return { ok: false, error: e instanceof Error ? e.message : 'Unexpected error', fieldErrors: {} };
  }
}

export async function confirmDbdRecordAction(_prev: ToolState, formData: FormData): Promise<ToolState> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  const admin = await requireAdmin(locale);
  const db = await createSupabaseServerClient();
  const record = await getDbdRecord(db, id);
  if (!record) return { ok: false, error: 'not-found' };
  const missing = missingFieldsForConfirmation(record);
  if (missing.length > 0) return { ok: false, error: `missing:${missing.join(',')}` };
  try {
    await confirmDbdRecord(db, id, admin.id);
    revalidatePath(`/${locale}/admin/dbd-records/${id}`);
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unexpected error' };
  }
}

const MAX_PDF_BYTES = 10 * 1024 * 1024;

export async function uploadDocumentAction(_prev: ToolState, formData: FormData): Promise<ToolState> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  await requireAdmin(locale);
  const file = formData.get('document');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'no-file' };
  if (file.type !== 'application/pdf' || file.size > MAX_PDF_BYTES) return { ok: false, error: 'invalid-file' };
  const db = await createSupabaseServerClient();
  try {
    await uploadDbdDocument(db, id, file);
    revalidatePath(`/${locale}/admin/dbd-records/${id}`);
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unexpected error' };
  }
}
```

- [ ] **Step 2: The form (client component)** — `app/[locale]/(admin)/admin/dbd-records/dbd-record-form.tsx`

```tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import type { DbdRecordRow } from '@/lib/db/dbd-records';
import { directorsToText, type Director } from '@/lib/domain/dbd-record';
import { saveDbdRecordAction, type SaveState } from './actions';

const FIELDS = [
  ['company_name_th', 'companyNameTh'], ['company_name_en', 'companyNameEn'], ['juristic_id', 'juristicId'],
  ['certificate_no', 'certificateNo'], ['document_ref', 'documentRef'], ['registered_on', 'registeredOn'],
  ['issued_on', 'issuedOn'], ['registered_capital', 'registeredCapital'], ['head_office_address', 'headOfficeAddress'],
  ['signing_authority', 'signingAuthority'], ['objectives_count', 'objectivesCount'], ['issuing_office', 'issuingOffice'],
  ['registrar_name', 'registrarName'],
] as const;

const DATE_FIELDS = new Set(['registered_on', 'issued_on']);
const initial: SaveState = { ok: false, error: null, fieldErrors: {} };

export function DbdRecordForm({ record }: { record: DbdRecordRow | null }) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd');
  const [state, formAction, pending] = useActionState(saveDbdRecordAction, initial);
  const locked = record?.extraction_status === 'confirmed';
  return (
    <form action={formAction} className="grid max-w-2xl gap-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={record?.id ?? ''} />
      {FIELDS.map(([name, label]) => (
        <label key={name} className="text-sm">
          {t(`fields.${label}`)}
          <input
            name={name}
            defaultValue={record?.[name] == null ? '' : String(record[name])}
            readOnly={locked}
            className="mt-1 w-full rounded border px-2 py-1 read-only:bg-gray-100"
          />
          {DATE_FIELDS.has(name) && <span className="text-xs text-gray-500">{t('dateHint')}</span>}
          {state.fieldErrors[name] && <span role="alert" className="block text-xs text-red-700">{state.fieldErrors[name]}</span>}
        </label>
      ))}
      <label className="text-sm">
        {t('fields.directors')}
        <textarea
          name="directors_text"
          rows={3}
          readOnly={locked}
          defaultValue={directorsToText(((record?.directors as unknown) as Director[] | null) ?? [])}
          className="mt-1 w-full rounded border px-2 py-1 read-only:bg-gray-100"
        />
        <span className="text-xs text-gray-500">{t('directorsHint')}</span>
      </label>
      {state.error && state.error !== 'validation' && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {state.ok && <p role="status" className="text-sm text-green-700">{t('saved')}</p>}
      {!locked && (
        <button type="submit" disabled={pending} className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50">
          {t('save')}
        </button>
      )}
    </form>
  );
}
```

- [ ] **Step 3: Confirm + upload tools** — `app/[locale]/(admin)/admin/dbd-records/[id]/record-tools.tsx`

```tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { confirmDbdRecordAction, uploadDocumentAction, type ToolState } from '../actions';

const initial: ToolState = { ok: false, error: null };

export function RecordTools({ id, status, documentPath }: { id: string; status: string; documentPath: string | null }) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd');
  const [confirmState, confirmAction, confirming] = useActionState(confirmDbdRecordAction, initial);
  const [uploadState, uploadAction, uploading] = useActionState(uploadDocumentAction, initial);
  const missing = confirmState.error?.startsWith('missing:') ? confirmState.error.slice('missing:'.length) : null;
  return (
    <div className="grid max-w-2xl gap-4">
      <form action={uploadAction} className="grid gap-2 rounded border p-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="id" value={id} />
        <p className="text-sm">{documentPath ? t('documentUploaded') : t('documentMissing')}</p>
        <input name="document" type="file" accept="application/pdf" required className="text-sm" />
        {uploadState.error && (
          <p role="alert" className="text-sm text-red-700">
            {uploadState.error === 'no-file' || uploadState.error === 'invalid-file'
              ? t(`errors.${uploadState.error}`)
              : uploadState.error}
          </p>
        )}
        {uploadState.ok && <p role="status" className="text-sm text-green-700">{t('uploaded')}</p>}
        <button type="submit" disabled={uploading} className="rounded border px-4 py-2 disabled:opacity-50">{t('upload')}</button>
      </form>
      <form action={confirmAction} className="grid gap-2 rounded border p-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="id" value={id} />
        <p className="text-sm">{t('status')}: <span data-testid="record-status">{status}</span></p>
        {missing && <p role="alert" className="text-sm text-red-700">{t('missingForConfirmation', { fields: missing })}</p>}
        {confirmState.error && !missing && <p role="alert" className="text-sm text-red-700">{confirmState.error}</p>}
        {status !== 'confirmed' && (
          <button type="submit" disabled={confirming} className="rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50">{t('confirm')}</button>
        )}
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Pages**

`app/[locale]/(admin)/admin/dbd-records/page.tsx`:

```tsx
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { listDbdRecords } from '@/lib/db/dbd-records';
import { createSupabaseServerClient } from '@/lib/db/server';

export default async function DbdRecordsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireAdmin(locale);
  const records = await listDbdRecords(await createSupabaseServerClient());
  const t = await getTranslations('admin.dbd');
  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Link href="/admin/dbd-records/new" className="rounded bg-gray-900 px-3 py-1 text-sm text-white">{t('new')}</Link>
      </div>
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b"><th className="py-2">{t('fields.companyNameTh')}</th><th>{t('fields.juristicId')}</th><th>{t('fields.issuedOn')}</th><th>{t('status')}</th></tr></thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="py-2"><Link href={`/admin/dbd-records/${r.id}`} className="underline">{r.company_name_th ?? '—'}</Link></td>
              <td>{r.juristic_id ?? '—'}</td>
              <td>{r.issued_on ?? '—'}</td>
              <td>{r.extraction_status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

`app/[locale]/(admin)/admin/dbd-records/new/page.tsx`:

```tsx
import { getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/auth/session';
import { DbdRecordForm } from '../dbd-record-form';

export default async function NewDbdRecordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireAdmin(locale);
  const t = await getTranslations('admin.dbd');
  return (
    <section className="grid gap-4">
      <h1 className="text-2xl font-semibold">{t('new')}</h1>
      <DbdRecordForm record={null} />
    </section>
  );
}
```

`app/[locale]/(admin)/admin/dbd-records/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { getDbdRecord } from '@/lib/db/dbd-records';
import { createSupabaseServerClient } from '@/lib/db/server';
import { DbdRecordForm } from '../dbd-record-form';
import { RecordTools } from './record-tools';

export default async function DbdRecordPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  await requireAdmin(locale);
  const record = await getDbdRecord(await createSupabaseServerClient(), id);
  if (!record) notFound();
  const t = await getTranslations('admin.dbd');
  return (
    <section className="grid gap-6">
      <Link href="/admin/dbd-records" className="text-sm underline">← {t('title')}</Link>
      <h1 className="text-2xl font-semibold">{record.company_name_th ?? t('untitled')}</h1>
      <RecordTools id={record.id} status={record.extraction_status} documentPath={record.document_path} />
      <DbdRecordForm record={record} />
    </section>
  );
}
```

In `app/[locale]/(admin)/admin/page.tsx` add a second list item linking to `/admin/dbd-records` with label `t('nav.dbdRecords')`.

- [ ] **Step 5: Messages** — add `admin.nav.dbdRecords` and the `admin.dbd` block to all three catalogs (English shown):

```json
"dbd": {
  "title": "DBD records",
  "new": "New DBD record",
  "untitled": "(no company name yet)",
  "save": "Save",
  "saved": "Saved",
  "status": "Status",
  "confirm": "Confirm record",
  "missingForConfirmation": "Cannot confirm — missing: {fields}",
  "dateHint": "DD/MM/YYYY (BE 2569 or CE 2026) or YYYY-MM-DD",
  "directorsHint": "One director per line: Thai name | English name",
  "documentMissing": "No certificate PDF uploaded",
  "documentUploaded": "Certificate PDF uploaded",
  "upload": "Upload PDF",
  "uploaded": "Uploaded",
  "errors": { "no-file": "Choose a PDF file", "invalid-file": "Only PDF files up to 10 MB are accepted" },
  "fields": {
    "companyNameTh": "Company name (Thai)", "companyNameEn": "Company name (English)",
    "juristicId": "Juristic person ID (13 digits)", "certificateNo": "Certificate no.", "documentRef": "Document ref.",
    "registeredOn": "Registration date", "issuedOn": "Certificate issued on", "registeredCapital": "Registered capital (THB)",
    "headOfficeAddress": "Head office address", "signingAuthority": "Signing authority", "objectivesCount": "Number of objectives",
    "issuingOffice": "Issuing office", "registrarName": "Registrar", "directors": "Directors"
  }
}
```

Thai values the E2E tests depend on — use exactly: `"save": "บันทึก"`, `"confirm": "ยืนยันข้อมูล"`, `"title": "ข้อมูล DBD"`, `"new": "เพิ่มข้อมูล DBD"`.

Run: `pnpm test:unit && pnpm typecheck && pnpm lint` → PASS.

- [ ] **Step 6: E2E** — add to `tests/e2e/helpers.ts`:

```ts
import { expect } from '@playwright/test';

/** Creates and confirms a DBD record through the admin UI; returns its id. Caller must be logged in as admin. */
export async function createConfirmedRecord(
  page: Page,
  fields: { companyNameTh: string; juristicId: string; issuedOn: string },
): Promise<string> {
  await page.goto('/th/admin/dbd-records/new');
  await page.locator('input[name="company_name_th"]').fill(fields.companyNameTh);
  await page.locator('input[name="juristic_id"]').fill(fields.juristicId);
  await page.locator('input[name="issued_on"]').fill(fields.issuedOn);
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await expect(page).toHaveURL(/\/th\/admin\/dbd-records\/[0-9a-f-]{36}$/);
  await page.getByRole('button', { name: 'ยืนยันข้อมูล' }).click();
  await expect(page.getByTestId('record-status')).toHaveText('confirmed');
  return page.url().split('/').pop()!;
}
```

(`บันทึก` = Thai `admin.dbd.save`, `ยืนยันข้อมูล` = Thai `admin.dbd.confirm`.)

`tests/e2e/admin-dbd.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { createConfirmedRecord, login } from './helpers';

test('admin creates a record with a BE date, sees it stored as CE, and confirms it', async ({ page }) => {
  await login(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await createConfirmedRecord(page, { companyNameTh: 'บริษัท อีทูอี จำกัด', juristicId: '0105568233704', issuedOn: '13/07/2569' });
  await expect(page.locator('input[name="issued_on"]')).toHaveValue('2026-07-13');
});

test('confirmation is blocked while the juristic id is missing', async ({ page }) => {
  await login(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/dbd-records/new');
  await page.locator('input[name="company_name_th"]').fill('บริษัท ไม่ครบ จำกัด');
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await expect(page).toHaveURL(/\/th\/admin\/dbd-records\/[0-9a-f-]{36}$/);
  await page.getByRole('button', { name: 'ยืนยันข้อมูล' }).click();
  await expect(page.getByRole('alert')).toContainText('juristic_id');
  await expect(page.getByTestId('record-status')).toHaveText('none');
});
```

Run: `pnpm test:e2e` → all pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(admin): DBD record create/edit, certificate upload and confirmation screens"
```

---

### Task 13: Assign a confirmed company to a learner

**Files:**
- Create: `lib/db/assignments.ts`, `tests/integration/assignments.db.test.ts`, `app/[locale]/(admin)/admin/users/[id]/assignment-panel.tsx`, `tests/e2e/admin-assign.spec.ts`
- Modify: `app/[locale]/(admin)/admin/users/[id]/actions.ts`, `app/[locale]/(admin)/admin/users/[id]/page.tsx`, `messages/*.json`

**Interfaces:**
- Consumes: tables from Task 10; `formatDate` (Task 2); `DbdRecordRow` (Task 11).
- Produces:
  - `type AssignmentRow`, `type EligibilitySnapshotRow`, `type ActiveAssignment = AssignmentRow & { dbd_records: DbdRecordRow }`
  - `getActiveAssignmentForUser(db, userId): Promise<ActiveAssignment | null>`
  - `assignDbdRecord(db, { userId, dbdRecordId }): Promise<AssignmentRow>`
  - `deactivateAssignment(db, assignmentId): Promise<void>`
  - `getLatestEligibility(db, userId, dbdRecordId): Promise<EligibilitySnapshotRow | null>`
  - `listConfirmedDbdRecords(db): Promise<Array<Pick<DbdRecordRow, 'id' | 'company_name_th' | 'juristic_id' | 'issued_on'>>>`
  - Actions `assignRecordAction`, `deactivateAssignmentAction`

- [ ] **Step 1: Write the failing data-access test** — `tests/integration/assignments.db.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assignDbdRecord,
  deactivateAssignment,
  getActiveAssignmentForUser,
  getLatestEligibility,
  listConfirmedDbdRecords,
} from '@/lib/db/assignments';
import { adminClient, clientFor, createTestUser, deleteTestUser, type Client, type TestUser } from './helpers';

describe('lib/db/assignments', () => {
  let admin: TestUser;
  let learner: TestUser;
  let asAdmin: Client;
  let recordId: string;

  beforeAll(async () => {
    [admin, learner] = await Promise.all([createTestUser('admin'), createTestUser('learner')]);
    asAdmin = await clientFor(admin);
    const { data } = await asAdmin
      .from('dbd_records')
      .insert({ company_name_th: 'บริษัท มอบหมาย จำกัด', juristic_id: '0105568233704', issued_on: '2026-07-13' })
      .select()
      .single();
    recordId = data!.id;
    await asAdmin
      .from('dbd_records')
      .update({ extraction_status: 'confirmed', confirmed_by: admin.id, confirmed_at: new Date().toISOString() })
      .eq('id', recordId);
  });

  afterAll(async () => {
    const svc = adminClient();
    await svc.from('user_dbd_assignments').delete().eq('dbd_record_id', recordId);
    await svc.from('eligibility_snapshots').delete().eq('dbd_record_id', recordId);
    await svc.from('dbd_records').delete().eq('id', recordId);
    await Promise.all([admin, learner].map((u) => deleteTestUser(u.id)));
  });

  it('lists confirmed records only', async () => {
    const rows = await listConfirmedDbdRecords(asAdmin);
    expect(rows.some((r) => r.id === recordId)).toBe(true);
  });

  it('assigns, reads back the joined record and the latest eligibility, then deactivates', async () => {
    expect(await getActiveAssignmentForUser(asAdmin, learner.id)).toBeNull();

    const assignment = await assignDbdRecord(asAdmin, { userId: learner.id, dbdRecordId: recordId });
    const active = await getActiveAssignmentForUser(asAdmin, learner.id);
    expect(active?.id).toBe(assignment.id);
    expect(active?.dbd_records.company_name_th).toBe('บริษัท มอบหมาย จำกัด');

    const eligibility = await getLatestEligibility(asAdmin, learner.id, recordId);
    expect(eligibility?.available_from).toBe('2026-08-27');

    await deactivateAssignment(asAdmin, assignment.id);
    expect(await getActiveAssignmentForUser(asAdmin, learner.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Implement `lib/db/assignments.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import type { DbdRecordRow } from './dbd-records';

type Db = SupabaseClient<Database>;
export type AssignmentRow = Database['public']['Tables']['user_dbd_assignments']['Row'];
export type EligibilitySnapshotRow = Database['public']['Tables']['eligibility_snapshots']['Row'];
export type ActiveAssignment = AssignmentRow & { dbd_records: DbdRecordRow };

export async function getActiveAssignmentForUser(db: Db, userId: string): Promise<ActiveAssignment | null> {
  const { data, error } = await db
    .from('user_dbd_assignments')
    .select('*, dbd_records(*)')
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  return (data as ActiveAssignment | null) ?? null;
}

/** The database enforces "confirmed only" and "one active per learner"; errors surface as thrown PostgrestErrors. */
export async function assignDbdRecord(db: Db, args: { userId: string; dbdRecordId: string }): Promise<AssignmentRow> {
  const { data, error } = await db
    .from('user_dbd_assignments')
    .insert({ user_id: args.userId, dbd_record_id: args.dbdRecordId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deactivateAssignment(db: Db, assignmentId: string): Promise<void> {
  const { error } = await db
    .from('user_dbd_assignments')
    .update({ active: false, deactivated_at: new Date().toISOString() })
    .eq('id', assignmentId);
  if (error) throw error;
}

export async function getLatestEligibility(db: Db, userId: string, dbdRecordId: string): Promise<EligibilitySnapshotRow | null> {
  const { data, error } = await db
    .from('eligibility_snapshots')
    .select('*')
    .eq('user_id', userId)
    .eq('dbd_record_id', dbdRecordId)
    .order('calculated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listConfirmedDbdRecords(db: Db) {
  const { data, error } = await db
    .from('dbd_records')
    .select('id, company_name_th, juristic_id, issued_on')
    .eq('extraction_status', 'confirmed')
    .order('company_name_th');
  if (error) throw error;
  return data;
}
```

Run: `pnpm test:integration` → PASS.

- [ ] **Step 3: Actions** — append to `app/[locale]/(admin)/admin/users/[id]/actions.ts`:

```ts
import { assignDbdRecord, deactivateAssignment } from '@/lib/db/assignments';
import { createSupabaseServerClient } from '@/lib/db/server';

export async function assignRecordAction(_prev: AccountActionState, formData: FormData): Promise<AccountActionState> {
  const locale = String(formData.get('locale') ?? 'th');
  const userId = String(formData.get('userId') ?? '');
  const dbdRecordId = String(formData.get('dbdRecordId') ?? '');
  await requireAdmin(locale);
  if (!dbdRecordId) return { message: null, error: 'no-record' };
  try {
    await assignDbdRecord(await createSupabaseServerClient(), { userId, dbdRecordId });
    revalidatePath(`/${locale}/admin/users/${userId}`);
    return { message: 'assigned', error: null };
  } catch (e) {
    const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
    if (code === '23505') return { message: null, error: 'already-assigned' };
    if (code === '23514') return { message: null, error: 'not-confirmed' };
    return { message: null, error: e instanceof Error ? e.message : 'Unexpected error' };
  }
}

export async function deactivateAssignmentAction(_prev: AccountActionState, formData: FormData): Promise<AccountActionState> {
  const locale = String(formData.get('locale') ?? 'th');
  const userId = String(formData.get('userId') ?? '');
  const assignmentId = String(formData.get('assignmentId') ?? '');
  await requireAdmin(locale);
  try {
    await deactivateAssignment(await createSupabaseServerClient(), assignmentId);
    revalidatePath(`/${locale}/admin/users/${userId}`);
    return { message: 'deactivated', error: null };
  } catch (e) {
    return { message: null, error: e instanceof Error ? e.message : 'Unexpected error' };
  }
}
```

- [ ] **Step 4: Panel** — `app/[locale]/(admin)/admin/users/[id]/assignment-panel.tsx`

```tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { assignRecordAction, deactivateAssignmentAction, type AccountActionState } from './actions';

type Option = { id: string; company_name_th: string | null; juristic_id: string | null; issued_on: string | null };
type Current = { assignmentId: string; companyNameTh: string | null; issuedOn: string | null; availableFromLabel: string | null } | null;

const initial: AccountActionState = { message: null, error: null };

export function AssignmentPanel({ userId, current, options }: { userId: string; current: Current; options: Option[] }) {
  const locale = useLocale();
  const t = useTranslations('admin.assignment');
  const [assignState, assignAction, assigning] = useActionState(assignRecordAction, initial);
  const [deactState, deactAction, deactivating] = useActionState(deactivateAssignmentAction, initial);
  return (
    <div className="grid max-w-md gap-2 rounded border p-4">
      <h2 className="font-semibold">{t('title')}</h2>
      {current ? (
        <form action={deactAction} className="grid gap-2">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="assignmentId" value={current.assignmentId} />
          <p className="text-sm" data-testid="assigned-company">{current.companyNameTh ?? '—'}</p>
          <p className="text-sm" data-testid="available-from">
            {current.availableFromLabel ? t('availableFrom', { date: current.availableFromLabel }) : t('eligibilityPending')}
          </p>
          {deactState.error && <p role="alert" className="text-sm text-red-700">{deactState.error}</p>}
          <button type="submit" disabled={deactivating} className="rounded border px-4 py-2 disabled:opacity-50">{t('deactivate')}</button>
        </form>
      ) : (
        <form action={assignAction} className="grid gap-2">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="userId" value={userId} />
          <select name="dbdRecordId" defaultValue="" className="rounded border px-2 py-1 text-sm">
            <option value="">{t('choose')}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.company_name_th ?? o.id} · {o.juristic_id ?? '—'} · {o.issued_on ?? '—'}</option>
            ))}
          </select>
          {assignState.error && (
            <p role="alert" className="text-sm text-red-700">
              {assignState.error === 'no-record' || assignState.error === 'already-assigned' || assignState.error === 'not-confirmed'
                ? t(`errors.${assignState.error}`)
                : assignState.error}
            </p>
          )}
          <button type="submit" disabled={assigning} className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50">{t('assign')}</button>
        </form>
      )}
    </div>
  );
}
```

In `app/[locale]/(admin)/admin/users/[id]/page.tsx`, after loading `user`, add:

```tsx
const db = await createSupabaseServerClient();
const active = await getActiveAssignmentForUser(db, user.id);
const eligibility = active ? await getLatestEligibility(db, user.id, active.dbd_record_id) : null;
const options = active ? [] : await listConfirmedDbdRecords(db);
const current = active
  ? {
      assignmentId: active.id,
      companyNameTh: active.dbd_records.company_name_th,
      issuedOn: active.dbd_records.issued_on,
      availableFromLabel: eligibility ? formatDate(eligibility.available_from, locale as AppLocale) : null,
    }
  : null;
```

and render `<AssignmentPanel userId={user.id} current={current} options={options} />` below `<AccountControls … />`. Import `getActiveAssignmentForUser`, `getLatestEligibility`, `listConfirmedDbdRecords` from `@/lib/db/assignments`, `formatDate` from `@/lib/domain/thai-date`, `type AppLocale` from `@/i18n/routing`.

- [ ] **Step 5: Messages** — add `admin.assignment` to all three catalogs (English shown):

```json
"assignment": {
  "title": "Assigned company",
  "choose": "Choose a confirmed DBD record…",
  "assign": "Assign",
  "deactivate": "Remove assignment",
  "availableFrom": "Bank verification available from {date}",
  "eligibilityPending": "Eligibility date pending — the certificate issue date is missing",
  "errors": { "no-record": "Choose a record", "already-assigned": "This learner already has an active assignment", "not-confirmed": "Only confirmed records can be assigned" }
}
```

Thai for `availableFrom`: `"ยืนยันตัวตนกับธนาคารได้ตั้งแต่ {date}"`; `assign`: `"มอบหมาย"`.

Run: `pnpm test:unit && pnpm typecheck && pnpm lint` → PASS.

- [ ] **Step 6: E2E** — `tests/e2e/admin-assign.spec.ts`

```ts
import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { createConfirmedRecord, login } from './helpers';

test('admin assigns a confirmed record and sees the +45-day date in Thai', async ({ page }) => {
  await login(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const company = `บริษัท มอบหมาย ${Date.now()} จำกัด`;
  await createConfirmedRecord(page, { companyNameTh: company, juristicId: '0105568233704', issuedOn: '13/07/2569' });

  const loginId = `e2e-assign-${Date.now()}`;
  await page.goto('/th/admin/users');
  await page.locator('input[name="loginId"]').fill(loginId);
  await page.locator('input[name="password"]').fill('Learner-Pass-123');
  await page.getByRole('button', { name: 'สร้างผู้ใช้' }).click();
  await page.getByRole('link', { name: loginId }).click();

  const optionValue = await page
    .locator('select[name="dbdRecordId"] option', { hasText: company })
    .getAttribute('value');
  await page.locator('select[name="dbdRecordId"]').selectOption(optionValue!);
  await page.getByRole('button', { name: 'มอบหมาย' }).click();
  await expect(page.getByTestId('assigned-company')).toHaveText(company);
  await expect(page.getByTestId('available-from')).toContainText('27 สิงหาคม 2569');
});
```

Run: `pnpm test:e2e` → all pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(admin): assign confirmed DBD records to learners with eligibility date display"
```

---

### Task 14: Learner dashboard — my company and bank-verification eligibility

**Files:**
- Create: `lib/db/learner.ts`, `tests/integration/learner.db.test.ts`, `tests/e2e/seed.ts`, `tests/e2e/learner-dashboard.spec.ts`
- Modify: `app/[locale]/(learner)/dashboard/page.tsx`, `messages/*.json`

**Interfaces:**
- Consumes: `getActiveAssignmentForUser`, `getLatestEligibility` (Task 13); `isBankStageOpen` (Task 3); `todayInBangkok`, `formatDate` (Task 2); `createSupabaseAdminClient` (Task 5).
- Produces:
  - `getMyCompany(db, userId): Promise<ActiveAssignment | null>` (RLS-scoped; same shape as Task 13)
  - `getMyEligibility(db, userId, dbdRecordId): Promise<EligibilitySnapshotRow | null>`
  - `createMyDocumentSignedUrl(userId, dbdRecordId): Promise<string | null>` — service role, but only after verifying the caller's active assignment; 5-minute URL

- [ ] **Step 1: Write the failing test** — `tests/integration/learner.db.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMyDocumentSignedUrl, getMyCompany, getMyEligibility } from '@/lib/db/learner';
import { adminClient, clientFor, createTestUser, deleteTestUser, type Client, type TestUser } from './helpers';

describe('lib/db/learner', () => {
  let admin: TestUser;
  let owner: TestUser;
  let other: TestUser;
  let asOwner: Client;
  let asOther: Client;
  let recordId: string;
  const path = `learner-test/${Date.now()}.pdf`;

  beforeAll(async () => {
    [admin, owner, other] = await Promise.all([createTestUser('admin'), createTestUser('learner'), createTestUser('learner')]);
    [asOwner, asOther] = await Promise.all([clientFor(owner), clientFor(other)]);
    const svc = adminClient();
    await svc.storage.from('dbd-documents').upload(path, Buffer.from('%PDF-1.4 test'), { contentType: 'application/pdf' });
    const { data } = await svc
      .from('dbd_records')
      .insert({
        company_name_th: 'บริษัท ของฉัน จำกัด', juristic_id: '0105568233704', issued_on: '2026-07-13',
        document_path: path, extraction_status: 'confirmed', confirmed_by: admin.id, confirmed_at: new Date().toISOString(),
      })
      .select()
      .single();
    recordId = data!.id;
    await svc.from('user_dbd_assignments').insert({ user_id: owner.id, dbd_record_id: recordId, assigned_by: admin.id });
  });

  afterAll(async () => {
    const svc = adminClient();
    await svc.storage.from('dbd-documents').remove([path]);
    await svc.from('user_dbd_assignments').delete().eq('dbd_record_id', recordId);
    await svc.from('eligibility_snapshots').delete().eq('dbd_record_id', recordId);
    await svc.from('dbd_records').delete().eq('id', recordId);
    await Promise.all([admin, owner, other].map((u) => deleteTestUser(u.id)));
  });

  it('returns the owner’s company and eligibility, and nothing for another learner', async () => {
    const mine = await getMyCompany(asOwner, owner.id);
    expect(mine?.dbd_records.company_name_th).toBe('บริษัท ของฉัน จำกัด');
    const eligibility = await getMyEligibility(asOwner, owner.id, recordId);
    expect(eligibility?.available_from).toBe('2026-08-27');

    expect(await getMyCompany(asOther, other.id)).toBeNull();
    // Even asking for the owner's id under the other learner's session yields nothing (RLS).
    expect(await getMyCompany(asOther, owner.id)).toBeNull();
  });

  it('signs the document URL only for the assigned learner', async () => {
    const url = await createMyDocumentSignedUrl(owner.id, recordId);
    expect(url).toMatch(/dbd-documents/);
    expect(await createMyDocumentSignedUrl(other.id, recordId)).toBeNull();
  });
});
```

- [ ] **Step 2: Implement `lib/db/learner.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from './admin';
import { getActiveAssignmentForUser, getLatestEligibility, type ActiveAssignment, type EligibilitySnapshotRow } from './assignments';
import type { Database } from './database.types';

type Db = SupabaseClient<Database>;

/** RLS guarantees a learner's client can only ever see their own assignment. */
export async function getMyCompany(db: Db, userId: string): Promise<ActiveAssignment | null> {
  return getActiveAssignmentForUser(db, userId);
}

export async function getMyEligibility(db: Db, userId: string, dbdRecordId: string): Promise<EligibilitySnapshotRow | null> {
  return getLatestEligibility(db, userId, dbdRecordId);
}

const SIGNED_URL_SECONDS = 300;

/** Service role is needed to sign, so ownership is verified explicitly first (spec §5). */
export async function createMyDocumentSignedUrl(userId: string, dbdRecordId: string): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data: assignment } = await admin
    .from('user_dbd_assignments')
    .select('dbd_records(document_path)')
    .eq('user_id', userId)
    .eq('dbd_record_id', dbdRecordId)
    .eq('active', true)
    .maybeSingle();
  const documentPath = (assignment?.dbd_records as { document_path: string | null } | null)?.document_path;
  if (!documentPath) return null;
  const { data, error } = await admin.storage.from('dbd-documents').createSignedUrl(documentPath, SIGNED_URL_SECONDS);
  if (error) return null;
  return data.signedUrl;
}
```

Run: `pnpm test:integration` → PASS.

- [ ] **Step 3: Replace the dashboard page** — `app/[locale]/(learner)/dashboard/page.tsx`

```tsx
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { requireUser } from '@/lib/auth/session';
import { createMyDocumentSignedUrl, getMyCompany, getMyEligibility } from '@/lib/db/learner';
import { createSupabaseServerClient } from '@/lib/db/server';
import type { Director } from '@/lib/domain/dbd-record';
import { isBankStageOpen } from '@/lib/domain/eligibility';
import { formatDate, todayInBangkok } from '@/lib/domain/thai-date';

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireUser(locale);
  const t = await getTranslations('dashboard');
  const db = await createSupabaseServerClient();
  const mine = await getMyCompany(db, user.id);

  if (!mine) {
    return (
      <section>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-2" data-testid="no-company">{t('noCompany')}</p>
      </section>
    );
  }

  const record = mine.dbd_records;
  const eligibility = await getMyEligibility(db, user.id, record.id);
  const documentUrl = await createMyDocumentSignedUrl(user.id, record.id);
  const directors = ((record.directors as unknown) as Director[] | null) ?? [];
  const loc = locale as AppLocale;
  const open = eligibility
    ? isBankStageOpen({ availableFrom: eligibility.available_from, expiresAt: eligibility.expires_at }, todayInBangkok())
    : false;

  return (
    <section className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('welcome', { name: user.displayName ?? user.loginId })}</h1>

      <div className="rounded border p-4">
        <h2 className="font-semibold">{t('company.title')}</h2>
        <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt>{t('company.name')}</dt><dd data-testid="company-name">{record.company_name_th ?? '—'}</dd>
          <dt>{t('company.juristicId')}</dt><dd>{record.juristic_id ?? '—'}</dd>
          <dt>{t('company.registeredCapital')}</dt><dd>{record.registered_capital == null ? '—' : `${Number(record.registered_capital).toLocaleString(loc === 'th' ? 'th-TH' : loc)} ${t('company.baht')}`}</dd>
          <dt>{t('company.address')}</dt><dd>{record.head_office_address ?? '—'}</dd>
          <dt>{t('company.directors')}</dt><dd>{directors.length ? directors.map((d) => d.name_th).join(', ') : '—'}</dd>
          <dt>{t('company.issuedOn')}</dt><dd>{record.issued_on ? formatDate(record.issued_on, loc) : '—'}</dd>
        </dl>
        {documentUrl && (
          <a href={documentUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm underline">{t('company.openCertificate')}</a>
        )}
      </div>

      <div className="rounded border p-4" data-testid="bank-stage">
        <h2 className="font-semibold">{t('bank.title')}</h2>
        {!eligibility && <p className="mt-2 text-sm">{t('bank.pending')}</p>}
        {eligibility && open && <p className="mt-2 text-sm text-green-700">{t('bank.available')}</p>}
        {eligibility && !open && (
          <p className="mt-2 text-sm">{t('bank.lockedUntil', { date: formatDate(eligibility.available_from, loc) })}</p>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Messages** — extend `dashboard` in all three catalogs (English shown):

```json
"dashboard": {
  "title": "Dashboard",
  "welcome": "Welcome, {name}",
  "noCompany": "No company has been assigned to you yet. Please contact your administrator.",
  "company": {
    "title": "Your company", "name": "Company", "juristicId": "Juristic person ID", "registeredCapital": "Registered capital",
    "baht": "THB", "address": "Head office", "directors": "Directors", "issuedOn": "Certificate issued on", "openCertificate": "Open certificate (PDF)"
  },
  "bank": {
    "title": "Bank verification",
    "pending": "Eligibility date pending — the certificate issue date is missing.",
    "available": "Available now.",
    "lockedUntil": "Available from {date}"
  }
}
```

Thai values the E2E tests depend on — use exactly: `bank.lockedUntil`: `"เปิดให้ทำได้ตั้งแต่ {date}"`; `bank.pending`: `"ยังไม่สามารถคำนวณวันที่ได้ เนื่องจากไม่มีวันที่ออกหนังสือรับรอง"`; `bank.available`: `"เปิดให้ทำได้แล้ว"`; `noCompany`: `"ยังไม่มีบริษัทที่มอบหมายให้คุณ กรุณาติดต่อผู้ดูแลระบบ"`.

Run: `pnpm test:unit && pnpm typecheck && pnpm lint` → PASS.

- [ ] **Step 5: E2E seed helper and spec**

`tests/e2e/seed.ts`:

```ts
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { E2E_PASSWORD } from './fixtures';

config({ path: '.env.local' });

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Creates a learner with a confirmed, assigned company. Returns the login id. */
export async function seedLearnerWithCompany(companyNameTh: string, issuedOn: string | null): Promise<string> {
  const admin = svc();
  const domain = process.env.APP_INTERNAL_EMAIL_DOMAIN ?? 'learner.portal.internal';
  const loginId = `e2e-seed-${Date.now()}`;
  const { data: user, error } = await admin.auth.admin.createUser({
    email: `${loginId}@${domain}`, password: E2E_PASSWORD, email_confirm: true,
    user_metadata: { login_id: loginId, display_name: loginId, preferred_language: 'th' }, app_metadata: { role: 'learner' },
  });
  if (error) throw error;
  const { data: record } = await admin
    .from('dbd_records')
    .insert({ company_name_th: companyNameTh, juristic_id: '0105568233704', issued_on: issuedOn, extraction_status: 'none' })
    .select()
    .single();
  await admin
    .from('dbd_records')
    .update({ extraction_status: 'confirmed', confirmed_by: user.user.id, confirmed_at: new Date().toISOString() })
    .eq('id', record!.id);
  await admin.from('user_dbd_assignments').insert({ user_id: user.user.id, dbd_record_id: record!.id });
  return loginId;
}
```

`tests/e2e/learner-dashboard.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { E2E_LEARNER, E2E_PASSWORD } from './fixtures';
import { login } from './helpers';
import { seedLearnerWithCompany } from './seed';

test('a learner sees their company and the locked bank stage with the Thai date', async ({ page }) => {
  const loginId = await seedLearnerWithCompany('บริษัท แดชบอร์ด จำกัด', '2099-01-01');
  await login(page, loginId, E2E_PASSWORD);
  await expect(page.getByTestId('company-name')).toHaveText('บริษัท แดชบอร์ด จำกัด');
  await expect(page.getByTestId('bank-stage')).toContainText('15 กุมภาพันธ์ 2642');
});

test('a learner whose certificate has no issue date sees the pending message', async ({ page }) => {
  const loginId = await seedLearnerWithCompany('บริษัท ไม่มีวันที่ จำกัด', null);
  await login(page, loginId, E2E_PASSWORD);
  await expect(page.getByTestId('bank-stage')).toContainText('ยังไม่สามารถคำนวณวันที่ได้');
});

test('a learner with no assignment sees the no-company message', async ({ page }) => {
  await login(page, E2E_LEARNER.loginId, E2E_PASSWORD);
  await expect(page.getByTestId('no-company')).toBeVisible();
});
```

(2099-01-01 + 45 days = 2099-02-15 = BE 2642. The Thai `bank.pending` text must contain `ยังไม่สามารถคำนวณวันที่ได้`.)

Run: `pnpm test:e2e` → all pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(learner): dashboard with assigned company, certificate link and bank-stage lock"
```

---

### Task 15: Isolation matrix and client-bundle secret scan

**Files:**
- Create: `tests/integration/isolation.test.ts`, `scripts/check-client-secrets.mjs`
- Modify: `.github/workflows/ci.yml`, `package.json`

**Interfaces:**
- Produces: `pnpm check:secrets` (fails the build if the service-role key or its variable name appears in `.next/static`).

- [ ] **Step 1: Isolation matrix** — `tests/integration/isolation.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, clientFor, createTestUser, deleteTestUser, type Client, type TestUser } from './helpers';

// Every table a learner may touch, and what they may do with it (spec §5).
const LEARNER_READ_OWN = ['profiles', 'user_dbd_assignments', 'eligibility_snapshots'] as const;
const ADMIN_ONLY = ['audit_logs', 'policy_config'] as const;

describe('learner isolation matrix', () => {
  let admin: TestUser;
  let a: TestUser;
  let b: TestUser;
  let asA: Client;
  let recordA: string;
  let recordB: string;

  beforeAll(async () => {
    [admin, a, b] = await Promise.all([createTestUser('admin'), createTestUser('learner'), createTestUser('learner')]);
    asA = await clientFor(a);
    const svc = adminClient();
    const mk = async (name: string) => {
      const { data } = await svc
        .from('dbd_records')
        .insert({ company_name_th: name, juristic_id: '0105568233704', issued_on: '2026-07-13', extraction_status: 'confirmed', confirmed_by: admin.id, confirmed_at: new Date().toISOString() })
        .select()
        .single();
      return data!.id as string;
    };
    [recordA, recordB] = await Promise.all([mk('A'), mk('B')]);
    await svc.from('user_dbd_assignments').insert([
      { user_id: a.id, dbd_record_id: recordA, assigned_by: admin.id },
      { user_id: b.id, dbd_record_id: recordB, assigned_by: admin.id },
    ]);
  });

  afterAll(async () => {
    const svc = adminClient();
    await svc.from('user_dbd_assignments').delete().in('dbd_record_id', [recordA, recordB]);
    await svc.from('eligibility_snapshots').delete().in('dbd_record_id', [recordA, recordB]);
    await svc.from('dbd_records').delete().in('id', [recordA, recordB]);
    await Promise.all([admin, a, b].map((u) => deleteTestUser(u.id)));
  });

  it.each(LEARNER_READ_OWN)('%s: learner A sees only rows where user_id/id is their own', async (table) => {
    const column = table === 'profiles' ? 'id' : 'user_id';
    const { data, error } = await asA.from(table).select(column);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.every((row) => (row as Record<string, string>)[column] === a.id)).toBe(true);
  });

  it('dbd_records: learner A sees only the assigned record, never B’s', async () => {
    const { data } = await asA.from('dbd_records').select('id');
    expect(data?.map((r) => r.id)).toEqual([recordA]);
    const { data: byId } = await asA.from('dbd_records').select('id').eq('id', recordB);
    expect(byId).toEqual([]);
  });

  it.each(ADMIN_ONLY)('%s: learner A reads nothing', async (table) => {
    const { data, error } = await asA.from(table).select('*');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('admin-only tables reject learner writes with an RLS error', async () => {
    const { error: auditInsert } = await asA
      .from('audit_logs')
      .insert({ action: 'isolation-test', entity_type: 'isolation-test' });
    expect(auditInsert?.code).toBe('42501');
    const { error: policyInsert } = await asA.from('policy_config').insert({ key: 'isolation-test', value: 1 });
    expect(policyInsert?.code).toBe('42501');
  });

  it('learner A cannot modify their assignment, snapshots or record', async () => {
    const { data: updAssign } = await asA.from('user_dbd_assignments').update({ active: false }).eq('user_id', a.id).select();
    expect(updAssign).toEqual([]);
    const { data: updSnap } = await asA.from('eligibility_snapshots').update({ available_from: '2000-01-01' }).eq('user_id', a.id).select();
    expect(updSnap).toEqual([]);
    const { data: updRec } = await asA.from('dbd_records').update({ issued_on: '2000-01-01' }).eq('id', recordA).select();
    expect(updRec).toEqual([]);
  });

  it('learner A cannot list or read the document bucket', async () => {
    const { data, error } = await asA.storage.from('dbd-documents').list();
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });
});
```

Run: `pnpm test:integration` → PASS.

- [ ] **Step 2: Secret scan script** — `scripts/check-client-secrets.mjs`

```js
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';

config({ path: '.env.local' });

const STATIC_DIR = '.next/static';
const NEEDLES = ['SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY].filter(
  (n) => typeof n === 'string' && n.length > 0,
);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

let leaks = 0;
for (const file of walk(STATIC_DIR)) {
  const text = readFileSync(file, 'utf8');
  for (const needle of NEEDLES) {
    if (text.includes(needle)) {
      console.error(`LEAK: ${needle === process.env.SUPABASE_SERVICE_ROLE_KEY ? 'service role key value' : needle} found in ${file}`);
      leaks++;
    }
  }
}

if (leaks > 0) {
  console.error(`${leaks} secret leak(s) in client bundles`);
  process.exit(1);
}
console.log('No server secrets found in client bundles');
```

Add script `"check:secrets": "node scripts/check-client-secrets.mjs"`.

Run: `pnpm build && pnpm check:secrets` → `No server secrets found in client bundles`.

- [ ] **Step 3: Wire into CI** — in `.github/workflows/ci.yml`, directly after the `Build` step:

```yaml
      - name: Client bundle secret scan
        run: pnpm check:secrets
```

- [ ] **Step 4: Full verification and commit**

Run: `pnpm lint && pnpm typecheck && pnpm format:check && pnpm test:unit && pnpm test:integration && pnpm build && pnpm check:secrets && pnpm test:e2e`
Expected: everything green.

```bash
git add -A
git commit -m "test(security): learner isolation matrix and client-bundle secret scan in CI"
```

---

## Done criteria for this plan (spec §15 rows P0, P1)

- A provisioned learner logs in, sees only their assigned company, and the bank stage is locked with the exact date (AC-001/002/003 for the display path; enforcement endpoints arrive with P8).
- Admin creates users, DBD records (BE dates accepted, stored CE), uploads certificates, confirms, assigns; every change is audited with the admin as actor.
- `available_from` is computed by the database and matches `lib/domain` on boundary dates.
- Negative RLS tests exist for every table and the bucket; CI runs lint, typecheck, unit, integration, build, secret scan and E2E.

Next plan: **P1.5 + P2** (AI extraction with admin review; dashboard stage cards, progression derivation, language switcher and full catalogs).
