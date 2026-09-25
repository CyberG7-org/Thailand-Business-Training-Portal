# P15c — Scoping the rest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every staff screen and action in records, documents, questions, content, calls, name cards, audit and navigation acts only within the caller's team, and the paths that run as service role on a caller-supplied id are proven to be gated by an RLS read first.

**Architecture:** P15a put the team boundary in RLS; P15b opened the staff screens and their server actions to managers under `requireStaff`. A sweep of every staff action shows all of them use the caller's client, so RLS already narrows what they read and write directly. What remains is (1) the handful of `lib/db` functions those actions call that switch to the service role — "Ask the documents" (Pinecone), signed upload URLs, recording URLs — each of which must be reached only through an RLS-backed read, and this stage pins that with tests and makes the gate explicit in code; (2) the audit log, which spec §9 gives to managers for their own team and which stayed admin-only in P15b — the `audit_logs_with_actor` view is `security_invoker = true`, so opening the page is enough for RLS to narrow it; (3) the records list, where the admin now needs to see whose record is whose. **No schema change**: P15a's policies and the security-invoker view carry all of it.

**Tech Stack:** Next.js 16 App Router, Supabase (caller client under RLS; service role only after an RLS-backed read), next-intl (th/en/zh), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-23-teams-and-roles-design.md` — stage 3 of §12; permissions §4; audit §9; screens §11.

## Global Constraints

- No schema change in this stage: every policy needed exists from P15a, and `audit_logs_with_actor` is `security_invoker = true` (migration `20260911000010`), so RLS applies through it.
- Every service-role path reachable from a staff action must be preceded by a read under the caller's client, and a test must prove the service-role step is never reached for another team's id.
- Pages that stay admin-only: Policy settings, Managers, Notifications (spec §11). The audit log opens to staff, narrowed to the caller's team by RLS; the admin's remains the full log (spec §9, §11).
- Codes are shown through `displayLoginId` wherever a login id appears (spec §3.3).
- Every user-visible string exists in `messages/th.json`, `messages/en.json` and `messages/zh.json`; `tests/unit/messages.test.ts` fails otherwise.
- Never leave a `next dev` running while the Playwright suite runs: `playwright.config.ts` forces every provider to `fake` on the server it starts, and `reuseExistingServer` would adopt a running one carrying the real `ANTHROPIC_API_KEY`.
- The e2e suite creates accounts it never deletes; run `pnpm db:reset` before a full run if the local database has been used for several.
- `pnpm lint && pnpm format:check && pnpm build && pnpm check:secrets` must pass before any commit that ends a task.

## Review Focus

1. **A manager asking "Ask the documents" about another team's record.** They must get nothing, and Pinecone must never be queried with that record id — the RLS read of `dbd_documents` is the gate. Pinned in Task 1.
2. **A signed upload URL under another team's record prefix.** Storage RLS must refuse it; `prepareUploadsAction` is newly reachable by a manager and nothing covered it. Pinned in Task 1.
3. **A manager opening another team's call session by URL.** The page must 404 before any recording URL is signed. Pinned in Task 1 (the RLS read that the page depends on returns null).
4. **A manager's audit view.** It must show their own team's actions and nothing the admin or another team did. Pinned in Task 2.
5. **The admin looking at the records list with three teams uploading.** They must be able to tell whose record is whose. Pinned in Task 3.

---

### Task 1: The service-role paths are gated, and the gate is named

**Files:**

- Modify: `lib/db/dbd-index.ts:194-202` (the `dbd_documents` read in `askRecordDocuments`)
- Test: `tests/integration/team-gates.test.ts`

**Interfaces:**

- Consumes: `seedTeam`, `confirmRecord`, `deleteTeam`, `adminClient` from `tests/integration/helpers.ts`; `askRecordDocuments(db, vector, input)` from `lib/db/dbd-index.ts`; `FakeVectorStore(loadChunks: ChunkLoader)` from `lib/integrations/vector/fake.ts`; `getCallSession(db, id)` from `lib/db/calls.ts`.
- Produces: nothing new — this task pins behaviour.

- [ ] **Step 1: Write the failing tests**

Create `tests/integration/team-gates.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getCallSession } from '@/lib/db/calls';
import { askRecordDocuments } from '@/lib/db/dbd-index';
import { FakeVectorStore } from '@/lib/integrations/vector/fake';
import { adminClient, confirmRecord, deleteTeam, seedTeam, type Team } from './helpers';

const svc = adminClient();

/**
 * Three staff paths end in a service-role call: the vector store, a signed upload URL, and a
 * signed recording URL. Each is reached only through a read the caller's own client makes under
 * RLS, and these tests prove another team's id never gets past that read.
 */
describe('the service-role paths are gated by an RLS read', () => {
  let a: Team;
  let b: Team;

  beforeAll(async () => {
    a = await seedTeam('เกต');
    b = await seedTeam('เกตสอง');
    await confirmRecord(a.recordId, a.manager.id);
    await confirmRecord(b.recordId, b.manager.id);
  });

  afterAll(async () => {
    for (const team of [a, b]) await deleteTeam(team);
  });

  it('never asks the vector store about another team record', async () => {
    let searches = 0;
    const store = new FakeVectorStore(async () => {
      searches += 1;
      return [];
    });
    const { data: doc } = await svc
      .from('dbd_documents')
      .select('id')
      .eq('record_id', b.recordId)
      .single();
    await svc.from('dbd_documents').update({ index_status: 'ready' }).eq('id', doc!.id);

    const theirs = await askRecordDocuments(a.asManager, store, {
      recordId: b.recordId,
      question: 'บริษัทนี้ทำอะไร',
    });
    expect(theirs.error).toBe('not_indexed');
    expect(theirs.passages).toEqual([]);
    expect(searches).toBe(0);

    // The same question about their own indexed record does reach the store.
    const { data: own } = await svc
      .from('dbd_documents')
      .select('id')
      .eq('record_id', a.recordId)
      .single();
    await svc.from('dbd_documents').update({ index_status: 'ready' }).eq('id', own!.id);
    const mine = await askRecordDocuments(a.asManager, store, {
      recordId: a.recordId,
      question: 'บริษัทนี้ทำอะไร',
    });
    expect(mine.error).toBeNull();
    expect(searches).toBe(1);
  });

  it('refuses a signed upload URL under another team record', async () => {
    const theirs = await a.asManager.storage
      .from('dbd-documents')
      .createSignedUploadUrl(`${b.recordId}/${Date.now()}-stolen.pdf`);
    expect(theirs.error).not.toBeNull();

    const mine = await a.asManager.storage
      .from('dbd-documents')
      .createSignedUploadUrl(`${a.recordId}/${Date.now()}-own.pdf`);
    expect(mine.error).toBeNull();
  });

  it('hides another team call session before any recording could be signed', async () => {
    const { data: session } = await svc
      .from('call_sessions')
      .insert({
        user_id: b.learner.id,
        dbd_record_id: b.recordId,
        modality: 'fake',
        recording_path: `${crypto.randomUUID()}/${Date.now()}.mp3`,
      })
      .select()
      .single();

    expect(await getCallSession(a.asManager, session!.id)).toBeNull();
    const own = await getCallSession(b.asManager, session!.id);
    expect(own?.id).toBe(session!.id);
  });
});
```

- [ ] **Step 2: Run them and read the output**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/team-gates.test.ts`
Expected: PASS, 3 tests — these pin behaviour P15a and P15b already produce. If any fails, that is a real hole: stop and fix it under superpowers:systematic-debugging before continuing. A test that passes first time here is the point: the assertion is what keeps it true.

- [ ] **Step 3: Name the gate in the code**

In `lib/db/dbd-index.ts`, directly above the `dbd_documents` read inside `askRecordDocuments`:

```ts
  // This read is the team boundary for the whole function: it runs under the caller's client, so
  // another team's record yields no documents, reports `not_indexed`, and never reaches the vector
  // store below. Keep it before the search, and keep it on `db`, not the service role.
  const { data: docs, error } = await db
```

- [ ] **Step 4: Run the ask suite and the gates again**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/dbd-index.ask.test.ts tests/integration/team-gates.test.ts`
Expected: PASS, unchanged counts plus 3.

- [ ] **Step 5: Commit**

```bash
git add lib/db/dbd-index.ts tests/integration/team-gates.test.ts
git commit -m "test(p15c): the service-role paths are gated by an RLS read"
```

---

### Task 2: The audit log for a manager's own team

**Files:**

- Modify: `app/[locale]/(admin)/admin/audit/page.tsx:3,33`
- Modify: `lib/db/middleware.ts` (the `GUARDS` table)
- Modify: `app/[locale]/(admin)/admin/page.tsx` (`STAFF_LINKS` / `ADMIN_LINKS`)
- Modify: `tests/e2e/manager-access.spec.ts`
- Modify: `docs/security-checklist.md` (row 20)

**Interfaces:**

- Consumes: `requireStaff` from `lib/auth/session.ts`; the policy `audit: admins read all, managers read their team` (P15a) through the `security_invoker` view `audit_logs_with_actor`; `createManager`, `createConfirmedRecord`, `switchTo` from `tests/e2e/helpers.ts`.
- Produces: `/admin/audit` reachable by staff; the hub lists it for managers.

- [ ] **Step 1: Write the failing e2e**

In `tests/e2e/manager-access.spec.ts`, change the nav test's audit line and the bounced list, and add a test:

```ts
test('a manager lands in the admin area and sees only their own doors', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ผู้จัดการสิทธิ์', MANAGER_PASSWORD);
  await switchTo(page, code.toLowerCase(), MANAGER_PASSWORD);

  await expect(page).toHaveURL(/\/th\/admin$/);
  const nav = page.getByTestId('admin-nav');
  await expect(nav).toContainText('ข้อมูล DBD');
  await expect(nav).toContainText('บันทึกการใช้งาน');
  await expect(nav).not.toContainText('ตั้งค่านโยบาย');
  await expect(nav).not.toContainText('ผู้จัดการ');
});

test('typing an admin-only URL does not get a manager in', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ผู้จัดการลองพิมพ์', MANAGER_PASSWORD);
  await switchTo(page, code.toLowerCase(), MANAGER_PASSWORD);

  for (const path of ['settings', 'notifications', 'managers']) {
    await page.goto(`/th/admin/${path}`);
    await expect(page, path).toHaveURL(/\/th\/admin$/);
  }
});

test('a manager reads their own team in the audit log and nothing else', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ผู้จัดการตรวจสอบ', MANAGER_PASSWORD);
  // An admin action that must not appear for the manager: creating this very manager.
  await page.goto('/th/admin/audit');
  await expect(page.locator('tr').filter({ hasText: 'profiles.create' }).first()).toContainText(
    code.toLowerCase(),
  );

  await switchTo(page, code.toLowerCase(), MANAGER_PASSWORD);
  const company = `บริษัท ตรวจสอบได้ ${Date.now()} จำกัด`;
  await createConfirmedRecord(page, {
    companyNameTh: company,
    juristicId: '0105568233715',
    issuedOn: '13/07/2569',
  });

  await page.goto('/th/admin/audit');
  await expect(page).toHaveURL(/\/th\/admin\/audit$/);
  // Their own upload is there; the admin's creation of their account is not.
  await expect(page.locator('tr').filter({ hasText: 'dbd_records.insert' }).first()).toContainText(
    code,
  );
  await expect(page.locator('tr').filter({ hasText: 'profiles.create' })).toHaveCount(0);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec playwright test tests/e2e/manager-access.spec.ts`
Expected: FAIL — the nav has no audit link for a manager, and `/th/admin/audit` bounces them to `/th/admin`.

- [ ] **Step 3: Open the door**

In `app/[locale]/(admin)/admin/audit/page.tsx`:

```tsx
import { requireStaff } from '@/lib/auth/session';
...
  // Spec §9: the admin reads everything, a manager reads their own team. The view is
  // security_invoker, so the P15a policy on audit_logs does the narrowing.
  await requireStaff(locale);
```

In `lib/db/middleware.ts`, delete the line `{ prefix: '/admin/audit', role: 'admin' },` from `GUARDS`.

In `app/[locale]/(admin)/admin/page.tsx`, move `['/admin/audit', 'audit'],` from `ADMIN_LINKS` to the end of `STAFF_LINKS`.

- [ ] **Step 4: Run the e2e**

Run: `pnpm exec playwright test tests/e2e/manager-access.spec.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Reword the checklist row**

In `docs/security-checklist.md`, replace row 20 with:

```markdown
| 20 | A manager cannot reach Policy settings, the Managers screen or notifications by typing the URL — the request-boundary guard turns them away and each page re-checks against the profile row — and a manager suspended mid-session loses the admin area on their next request. The audit log opens to staff but is narrowed to the caller's team by RLS through the `security_invoker` view | ✅ | `tests/e2e/manager-access.spec.ts` |
```

- [ ] **Step 6: Commit**

```bash
git add app/[locale]/\(admin\)/admin/audit/page.tsx lib/db/middleware.ts app/[locale]/\(admin\)/admin/page.tsx tests/e2e/manager-access.spec.ts docs/security-checklist.md
git commit -m "feat(p15c): a manager reads their own team in the audit log"
```

---

### Task 3: The admin sees whose record is whose, and a manager's pickers stay inside the team

**Files:**

- Modify: `app/[locale]/(admin)/admin/dbd-records/page.tsx`
- Modify: `messages/th.json`, `messages/en.json`, `messages/zh.json` (`admin.dbd.team`)
- Modify: `tests/e2e/manager-access.spec.ts` (the upload-ownership test)
- Modify: `tests/e2e/manager-manages.spec.ts` (the generation test)

**Interfaces:**

- Consumes: `displayLoginId` from `lib/domain/login-id.ts`; `listDbdRecords(db)` from `lib/db/dbd-records.ts` (rows carry `team_id`); `requireStaff`.
- Produces: a Team column on the records list, admin only.

- [ ] **Step 1: Write the failing e2e**

In `tests/e2e/manager-access.spec.ts`, extend the upload-ownership test's ending:

```ts
  // Their own record is still theirs after saving; the admin's is not visible at all.
  await page.goto('/th/admin/dbd-records');
  await expect(page.locator('tbody')).toContainText(ownCompany);
  await expect(page.locator('tbody')).not.toContainText(adminCompany);
  // A manager sees no Team column: every record on their list is theirs.
  await expect(page.getByRole('columnheader', { name: 'ทีม' })).toHaveCount(0);

  // The admin sees both, and can tell which team uploaded which.
  await switchTo(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/dbd-records');
  await expect(page.getByRole('columnheader', { name: 'ทีม' })).toBeVisible();
  await expect(page.locator('tr').filter({ hasText: ownCompany })).toContainText(code);
  await expect(page.locator('tr').filter({ hasText: adminCompany })).not.toContainText(code);
```

In `tests/e2e/manager-manages.spec.ts`, in the AI generation test, create an admin-owned company before switching to the manager, and assert it is not offered:

```ts
test('a manager can open the AI generation screen and use it', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ผู้จัดการสร้างข้อสอบ', MANAGER_PASSWORD);
  const adminCompany = `บริษัท ต้นแบบของแอดมิน ${Date.now()} จำกัด`;
  await createConfirmedRecord(page, {
    companyNameTh: adminCompany,
    juristicId: '0105568233716',
    issuedOn: '13/07/2569',
  });

  await switchTo(page, code.toLowerCase(), MANAGER_PASSWORD);
  const company = `บริษัท ออกข้อสอบ ${Date.now()} จำกัด`;
  await createConfirmedRecord(page, {
    companyNameTh: company,
    juristicId: '0105568233713',
    issuedOn: '13/07/2569',
  });

  await page.goto('/th/admin/questions/generate');
  await expect(page).toHaveURL(/\/th\/admin\/questions\/generate$/);
  // The reference picker is RLS-narrowed: another team's company is not on offer.
  await expect(page.locator('select[name="reference_record_id"]')).not.toContainText(adminCompany);
  const record = page.locator('select[name="reference_record_id"] option', { hasText: company });
  await page
    .locator('select[name="reference_record_id"]')
    .selectOption((await record.getAttribute('value'))!);
  await page.getByTestId('generate-submit').click();
  // The action must accept a manager: being bounced to /admin is the failure this pins.
  await expect(page).not.toHaveURL(/\/th\/admin$/);
});
```

- [ ] **Step 2: Run them and watch the records test fail**

Run: `pnpm exec playwright test tests/e2e/manager-access.spec.ts tests/e2e/manager-manages.spec.ts`
Expected: the upload-ownership test FAILS — there is no Team column; the generation test PASSES (its new assertion pins RLS behaviour that already holds).

- [ ] **Step 3: Add the messages**

Add `"team": "Team"` to `admin.dbd` in `messages/en.json`, `"team": "ทีม"` in `messages/th.json`, `"team": "团队"` in `messages/zh.json`.

- [ ] **Step 4: Add the column**

Replace the top of `app/[locale]/(admin)/admin/dbd-records/page.tsx` down to the table header:

```tsx
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireStaff } from '@/lib/auth/session';
import { listDbdRecords } from '@/lib/db/dbd-records';
import { createSupabaseServerClient } from '@/lib/db/server';
import { displayLoginId } from '@/lib/domain/login-id';
import { formatDate, type Locale } from '@/lib/domain/thai-date';

export default async function DbdRecordsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const staff = await requireStaff(locale);
  const supabase = await createSupabaseServerClient();
  const records = await listDbdRecords(supabase);
  // Only the admin sees more than one team, so only the admin gets the column (spec §11).
  const { data: managers } =
    staff.role === 'admin'
      ? await supabase.from('profiles').select('id, login_id').eq('role', 'manager')
      : { data: null };
  const teamCodeOf = new Map((managers ?? []).map((m) => [m.id, displayLoginId(m.login_id)]));
  const showTeam = staff.role === 'admin';
  const t = await getTranslations('admin.dbd');
```

Then in the table header, after the company-name header:

```tsx
            {showTeam && <th>{t('team')}</th>}
```

and in each row, after the company-name cell:

```tsx
              {showTeam && (
                <td data-testid={`record-team-${r.id}`}>
                  {r.team_id ? (teamCodeOf.get(r.team_id) ?? '—') : '—'}
                </td>
              )}
```

- [ ] **Step 5: Run the two specs**

Run: `pnpm exec playwright test tests/e2e/manager-access.spec.ts tests/e2e/manager-manages.spec.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Check the message files stay in step**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/messages.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Commit**

```bash
git add app/[locale]/\(admin\)/admin/dbd-records/page.tsx messages tests/e2e/manager-access.spec.ts tests/e2e/manager-manages.spec.ts
git commit -m "feat(p15c): the admin sees which team owns each record"
```

---

### Task 4: The decision, the spec, and the whole suite

**Files:**

- Modify: `docs/decisions-log.md`
- Modify: `docs/superpowers/specs/2026-09-23-teams-and-roles-design.md:5`
- Modify: `docs/security-checklist.md` (row 21)

**Interfaces:**

- Consumes: everything from Tasks 1–3.
- Produces: decision D60; the spec marked complete.

- [ ] **Step 1: Run everything**

Run: `pnpm db:reset && pnpm exec vitest run --config vitest.config.ts && pnpm exec vitest run --config vitest.integration.config.ts && pnpm exec playwright test && pnpm lint && pnpm format:check && pnpm build && pnpm check:secrets`
Expected: all green.

- [ ] **Step 2: Record the decision**

Insert directly above the `| 2026-09-24 | D59 |` row in `docs/decisions-log.md`:

```markdown
| 2026-09-25 | D60 | Team scoping is complete with no new schema: every staff action already runs under the caller's client, so RLS narrows what it reads and writes; the three paths that end in the service role — "Ask the documents" (the vector store), signed upload URLs and signed recording URLs — are each reached only through an RLS-backed read, which `tests/integration/team-gates.test.ts` proves by asking about another team's record and counting zero searches. The audit log opens to staff: `audit_logs_with_actor` is `security_invoker`, so P15a's policy gives a manager their own team's rows and the admin the full log (spec §9). The admin's records list shows which team uploaded each record; a manager's shows no column because everything on it is theirs. Name cards have no staff screen, so there was nothing to scope | `tests/integration/team-gates.test.ts`, `app/[locale]/(admin)/admin/audit/page.tsx`, `app/[locale]/(admin)/admin/dbd-records/page.tsx` |
```

- [ ] **Step 3: Mark the spec complete**

Change the status line in `docs/superpowers/specs/2026-09-23-teams-and-roles-design.md` to:

```markdown
| Status | Implemented — stages 1–3 (P15a, P15b, P15c); notifications deferred (§8) |
```

- [ ] **Step 4: Add the checklist row**

Append to the table in `docs/security-checklist.md`:

```markdown
| 21 | The service-role paths a manager can reach — the vector store, signed upload URLs, signed recording URLs — are each gated by a read under the caller's client, so another team's record id yields nothing and never reaches the service role | ✅ | `tests/integration/team-gates.test.ts` |
```

- [ ] **Step 5: Verify formatting and commit**

Run: `pnpm exec prettier --write docs && pnpm format:check`
Expected: "All matched files use Prettier code style!"

```bash
git add docs/decisions-log.md docs/superpowers/specs/2026-09-23-teams-and-roles-design.md docs/security-checklist.md
git commit -m "docs(p15c): record the completed team model as D60"
```

- [ ] **Step 6: Deploy**

No migration to apply. Merge to `main` and push; CI and the staging deploy follow.

---

## Self-review

**Spec coverage.** §4 permissions per area: records/documents (Task 1 gates + P15b RLS), questions and content (shared by `is_staff`, P15a — Task 3 pins the generation picker), calls (Task 1), name cards (no staff screen exists; noted in D60), audit (Task 2), navigation (Task 2 moves the audit link). §9 → Task 2. §11 "the admin additionally sees which team" → Task 3 extends it to records. §12 stage 3 → the whole plan.

**Deliberate gaps.** Name cards: spec §4 gives managers "own team only", but no staff name-card screen exists, so there is nothing to scope until one does — recorded in D60 rather than inventing a screen. The manager's contact channel stays out (spec §8 defers notifications; nothing would read it).

**Type consistency.** `askRecordDocuments(db, vector, { recordId, question })` matches its signature in `lib/db/dbd-index.ts:176`; `FakeVectorStore` takes a `ChunkLoader` (`fake.ts:13`); `getCallSession(db, id)` returns `CallSessionWithUser | null` (`calls.ts:323`); `listDbdRecords` rows carry `team_id` (column added in P15a). Test helpers `seedTeam`, `confirmRecord`, `deleteTeam`, `createManager`, `createConfirmedRecord`, `switchTo` all exist from P15a/P15b.

**Review Focus.** Each of the five lines names its task and its test.
