# P15b — Creating people Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the three roles usable from the screens: the admin creates managers, a manager creates learners, codes are allocated automatically as `T01` / `T01-01`, and each role lands somewhere that belongs to it.

**Architecture:** P15a already put the roles, the two team columns, `allocate_login_id`, the six team predicates and every team-scoped RLS policy in the database. This stage adds no schema. It splits the session guard (`requireAdmin` → `requireAdmin` + `requireStaff`), moves account creation behind two provisioning functions that allocate the code rather than asking a human to type one, adds an admin-only Managers screen, and makes the Users screen and the navigation read the caller's role. Every list stays RLS-backed, so a missed filter shows an empty table rather than another team's data.

**Tech Stack:** Next.js 16 App Router (server components, server actions), Supabase (service role for account creation, RLS for reads), next-intl (th/en/zh), Tailwind v4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-23-teams-and-roles-design.md` — stage 2 of §12; screens in §11; codes in §3.3; lifecycle in §7.

## Global Constraints

- Login ids are stored lower-case and displayed upper-case (spec §3.3).
- Manager code is `t` + number padded to two digits; learner code is the manager code + `-` + number padded to two digits; numbers pass 99 by growing a digit (spec §3.3).
- A number is never reused, even after the account is deleted (spec §3.3).
- The existing `owner` admin keeps its login id and sits outside the team system (spec §3.3).
- Only a learner carries `manager_id`, and it always references an active `manager` (spec §5.2, enforced by `enforce_team_membership`).
- Pages that stay admin-only: Policy settings, Managers, the audit log, Notifications (spec §11).
- Notifications remain deferred at the owner's instruction (spec §8).
- Every user-visible string exists in `messages/th.json`, `messages/en.json` and `messages/zh.json`; `tests/unit/messages.test.ts` fails otherwise.
- `pnpm lint && pnpm format:check && pnpm build && pnpm check:secrets` must pass before any commit that ends a task.

## Review Focus

1. **Two accounts created in the same moment.** Two managers (or two learners in one team) created concurrently must get different codes — `allocate_login_id` serialises on the counter row, and the app must not read-then-write around it. Pinned in Task 2.
2. **A manager suspended while signed in.** Their browser still holds a valid JWT; `requireStaff` must read the profile row, not the token, so the admin screens close immediately. Pinned in Task 5 ("a suspended manager loses the admin area on the next request").
3. **A manager typing `/admin/settings` or `/admin/audit`.** Hiding a link is not access control; the page itself must bounce them. Pinned in Task 5.
4. **A manager choosing another team's company for a new learner.** The picker is RLS-narrowed, so another team's company must not even be offered — a manager who cannot see a record cannot assign it. Pinned in Task 4 ("a manager sees only their own learners and no team picker").
5. **Creating a learner with no team chosen.** The admin's form must refuse in words rather than failing inside the allocator; when no manager exists at all the picker says so instead of offering an empty list. Pinned in Task 4 ("the admin must say which team").

---

### Task 1: The staff guard, the display helper, and where each role lands

**Files:**

- Create: `lib/domain/login-id.ts`
- Create: `tests/unit/domain/login-id.test.ts`
- Modify: `lib/auth/session.ts:48-52`
- Modify: `app/[locale]/page.tsx:8`
- Modify: `app/[locale]/(admin)/layout.tsx:13`
- Modify: `components/app-header.tsx:19`
- Test: `tests/integration/session-guards.test.ts`

**Interfaces:**

- Consumes: `is_manager()`, `my_team()` from P15a; `CurrentUser` from `lib/auth/session.ts`.
- Produces: `displayLoginId(loginId: string | null): string`, `requireStaff(locale: string): Promise<CurrentUser>`.

- [ ] **Step 1: Write the failing unit test**

Create `tests/unit/domain/login-id.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { displayLoginId } from '@/lib/domain/login-id';

describe('displayLoginId', () => {
  it('shows a stored code upper-case (spec §3.3)', () => {
    expect(displayLoginId('t01')).toBe('T01');
    expect(displayLoginId('t01-03')).toBe('T01-03');
    expect(displayLoginId('t100-100')).toBe('T100-100');
  });

  it('leaves the admin account readable and survives nothing', () => {
    expect(displayLoginId('owner')).toBe('OWNER');
    expect(displayLoginId(null)).toBe('—');
    expect(displayLoginId('')).toBe('—');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/login-id.test.ts`
Expected: FAIL — `Cannot find module '@/lib/domain/login-id'`.

- [ ] **Step 3: Write the helper**

Create `lib/domain/login-id.ts`:

```ts
/**
 * Login ids are stored lower-case, as every login id in this project is, and shown upper-case
 * so a code reads as what it is: T01 is a manager, T01-03 the third learner of that team
 * (spec §3.3). One helper, so `t01-03` can never reach a screen.
 */
export function displayLoginId(loginId: string | null | undefined): string {
  const trimmed = loginId?.trim();
  return trimmed ? trimmed.toUpperCase() : '—';
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/login-id.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Write the failing guard test**

Create `tests/integration/session-guards.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { STAFF_ROLES, isStaffRole } from '@/lib/auth/session';

describe('who counts as staff', () => {
  it('is the admin and an active manager, never a learner', () => {
    expect(isStaffRole('admin')).toBe(true);
    expect(isStaffRole('manager')).toBe(true);
    expect(isStaffRole('learner')).toBe(false);
    expect([...STAFF_ROLES].sort()).toEqual(['admin', 'manager']);
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/session-guards.test.ts`
Expected: FAIL — `STAFF_ROLES` is not exported.

- [ ] **Step 7: Split the guard**

In `lib/auth/session.ts`, replace the body of `requireAdmin` and add the staff guard beneath it:

```ts
/** Level 1 and level 2 both reach the working screens; only level 1 reaches settings (spec §11). */
export const STAFF_ROLES = ['admin', 'manager'] as const;

export function isStaffRole(role: CurrentUser['role']): boolean {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

export async function requireAdmin(locale: string): Promise<CurrentUser> {
  const user = await requireUser(locale);
  if (user.role !== 'admin') redirect(`/${locale}/${isStaffRole(user.role) ? 'admin' : 'dashboard'}`);
  return user;
}

/**
 * The admin or an active manager. `requireUser` has already read the profile row rather than the
 * JWT, so a manager suspended mid-session loses these screens on their next request.
 */
export async function requireStaff(locale: string): Promise<CurrentUser> {
  const user = await requireUser(locale);
  if (!isStaffRole(user.role)) redirect(`/${locale}/dashboard`);
  return user;
}
```

- [ ] **Step 8: Run the guard test**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/session-guards.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 9: Send each role to its own home**

In `app/[locale]/page.tsx`, replace the final redirect:

```tsx
  // Staff work in the admin area; learners study (spec §11).
  const home = user.role === 'learner' ? 'dashboard' : 'admin';
  redirect(`/${user.preferredLanguage}/${home}`);
```

In `app/[locale]/(admin)/layout.tsx`, swap the guard:

```tsx
import { requireStaff } from '@/lib/auth/session';
...
  const user = await requireStaff(locale);
```

In `components/app-header.tsx`, show the code upper-case:

```tsx
import { displayLoginId } from '@/lib/domain/login-id';
...
          <span>{user.displayName ?? displayLoginId(user.loginId)}</span>
```

- [ ] **Step 10: Verify nothing regressed**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run --config vitest.config.ts && pnpm exec playwright test tests/e2e/auth.spec.ts tests/e2e/navigation.spec.ts`
Expected: typecheck clean; unit suite green; both e2e specs pass — the admin still lands on `/admin` and a learner on `/dashboard`.

- [ ] **Step 11: Commit**

```bash
git add lib/domain/login-id.ts lib/auth/session.ts app tests/unit/domain/login-id.test.ts tests/integration/session-guards.test.ts components/app-header.tsx
git commit -m "feat(p15b): a staff guard, upper-case codes, and a home per role"
```

---

### Task 2: Accounts are provisioned with an allocated code

**Files:**

- Modify: `lib/db/provisioning.ts:8-18` (schema), `:29-60` (`createAccount`)
- Test: `tests/integration/provisioning.test.ts`

**Interfaces:**

- Consumes: `allocate_login_id(p_scope text, p_prefix text) returns text` from P15a (service-role only, returns lower-case); `enforce_team_membership` trigger.
- Produces:
  - `createManagerAccount(input: { password: string; displayName?: string; preferredLanguage?: 'th' | 'en' | 'zh' }): Promise<{ id: string; loginId: string }>`
  - `createLearnerAccount(input: { password: string; displayName?: string; preferredLanguage?: 'th' | 'en' | 'zh'; managerId: string }): Promise<{ id: string; loginId: string }>`
  - `ProvisioningError` gains code `'no-manager'`.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/provisioning.test.ts`:

```ts
import { afterAll, describe, expect, it } from 'vitest';
import { ProvisioningError, createLearnerAccount, createManagerAccount } from '@/lib/db/provisioning';
import { adminClient, deleteTestUser } from './helpers';

const svc = adminClient();
const PASSWORD = 'Test-Password-123!';

describe('provisioning allocates the code', () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created.reverse()) await deleteTestUser(id);
  });

  it('gives managers t01, t02 … and never asks for a login id', async () => {
    const first = await createManagerAccount({ password: PASSWORD, displayName: 'หนึ่ง' });
    const second = await createManagerAccount({ password: PASSWORD, displayName: 'สอง' });
    created.push(first.id, second.id);
    expect(first.loginId).toMatch(/^t\d{2,}$/);
    expect(second.loginId).not.toBe(first.loginId);

    const { data } = await svc.from('profiles').select('role, manager_id').eq('id', first.id).single();
    expect(data!.role).toBe('manager');
    expect(data!.manager_id).toBeNull();
  });

  it('gives a learner their manager code plus a number, and puts them in that team', async () => {
    const manager = await createManagerAccount({ password: PASSWORD, displayName: 'ทีม' });
    created.push(manager.id);
    const one = await createLearnerAccount({ password: PASSWORD, managerId: manager.id });
    const two = await createLearnerAccount({ password: PASSWORD, managerId: manager.id });
    created.push(one.id, two.id);

    expect(one.loginId).toBe(`${manager.loginId}-01`);
    expect(two.loginId).toBe(`${manager.loginId}-02`);
    const { data } = await svc.from('profiles').select('role, manager_id').eq('id', one.id).single();
    expect(data!.role).toBe('learner');
    expect(data!.manager_id).toBe(manager.id);
  });

  it('never hands two concurrent creations the same code', async () => {
    const manager = await createManagerAccount({ password: PASSWORD });
    created.push(manager.id);
    const learners = await Promise.all(
      Array.from({ length: 5 }, () => createLearnerAccount({ password: PASSWORD, managerId: manager.id })),
    );
    created.push(...learners.map((l) => l.id));
    expect(new Set(learners.map((l) => l.loginId)).size).toBe(5);
  });

  it('refuses a learner whose parent is not a manager', async () => {
    const manager = await createManagerAccount({ password: PASSWORD });
    const learner = await createLearnerAccount({ password: PASSWORD, managerId: manager.id });
    created.push(manager.id, learner.id);
    await expect(
      createLearnerAccount({ password: PASSWORD, managerId: learner.id }),
    ).rejects.toBeInstanceOf(ProvisioningError);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/provisioning.test.ts`
Expected: FAIL — `createManagerAccount` is not exported from `lib/db/provisioning`.

- [ ] **Step 3: Widen the schema and add the two provisioning functions**

In `lib/db/provisioning.ts`, change the role enum and the login id field, then append the two functions:

```ts
export const newAccountSchema = z.object({
  loginId: z
    .string()
    .trim()
    .refine(isValidLoginId, 'Login ID must be 3–64 letters, digits, ".", "_" or "-"'),
  password: z.string().min(10, 'Password must be at least 10 characters'),
  role: z.enum(['learner', 'manager', 'admin']).default('learner'),
  displayName: z.string().trim().max(120).optional(),
  preferredLanguage: z.enum(['th', 'en', 'zh']).default('th'),
});
```

Change `ProvisioningError`'s code union to `'duplicate' | 'invalid' | 'unknown' | 'no-manager'`, then append:

```ts
type NewPerson = {
  password: string;
  displayName?: string;
  preferredLanguage?: 'th' | 'en' | 'zh';
};

/** One round trip to the counter; it serialises on its own row, so concurrent callers queue. */
async function allocate(scope: string, prefix: string): Promise<string> {
  const { data, error } = await createSupabaseAdminClient().rpc('allocate_login_id', {
    p_scope: scope,
    p_prefix: prefix,
  });
  if (error || !data) throw new ProvisioningError(error?.message ?? 'No code allocated', 'unknown');
  return data as string;
}

/**
 * A manager is a team. Their code comes from the one global counter and becomes the prefix every
 * learner of theirs is numbered under (spec §3.3).
 */
export async function createManagerAccount(
  input: NewPerson,
): Promise<{ id: string; loginId: string }> {
  const loginId = await allocate('manager', 't');
  return createAccount({ ...input, loginId, role: 'manager' });
}

/**
 * A learner is numbered inside their manager's team, and carries `manager_id` so every
 * team-scoped policy can find them. The profile is created by a trigger from the auth user, so
 * the team is set immediately afterwards; `enforce_team_membership` rejects a non-manager parent.
 */
export async function createLearnerAccount(
  input: NewPerson & { managerId: string },
): Promise<{ id: string; loginId: string }> {
  const admin = createSupabaseAdminClient();
  const { data: manager } = await admin
    .from('profiles')
    .select('login_id, role')
    .eq('id', input.managerId)
    .maybeSingle();
  if (!manager || manager.role !== 'manager') {
    throw new ProvisioningError('That account is not a manager', 'no-manager');
  }
  const loginId = await allocate(input.managerId, `${manager.login_id}-`);
  const created = await createAccount({ ...input, loginId, role: 'learner' });
  const { error } = await admin
    .from('profiles')
    .update({ manager_id: input.managerId })
    .eq('id', created.id);
  if (error) throw new ProvisioningError(error.message, 'unknown');
  return created;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/provisioning.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Check nothing that creates accounts broke**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/teams.test.ts tests/integration/team-isolation.test.ts tests/integration/login-ids.test.ts`
Expected: PASS, unchanged counts (4, 13, 4).

- [ ] **Step 6: Commit**

```bash
git add lib/db/provisioning.ts tests/integration/provisioning.test.ts
git commit -m "feat(p15b): managers and learners are created with an allocated code"
```

---

### Task 3: The Managers screen

**Files:**

- Create: `app/[locale]/(admin)/admin/managers/page.tsx`
- Create: `app/[locale]/(admin)/admin/managers/actions.ts`
- Create: `app/[locale]/(admin)/admin/managers/new-manager-form.tsx`
- Create: `app/[locale]/(admin)/admin/managers/row-controls.tsx`
- Modify: `messages/th.json`, `messages/en.json`, `messages/zh.json`
- Test: `tests/e2e/managers.spec.ts`

**Interfaces:**

- Consumes: `createManagerAccount` and `setAccountStatus`/`setAccountPassword` from Task 2, `displayLoginId` from Task 1, `requireAdmin` from Task 1.
- Produces: the route `/admin/managers`; `createManagerAction`, `setManagerStatusAction`, `resetManagerPasswordAction`, all `(prev: ManagerState, formData: FormData) => Promise<ManagerState>` where `ManagerState = { ok: boolean; error: string | null; createdLoginId: string | null }`.

- [ ] **Step 1: Write the failing e2e**

Create `tests/e2e/managers.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';

test('the admin creates a manager, sees the team, and can suspend it', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/managers');

  await page.locator('input[name="displayName"]').fill('ผู้จัดการทดสอบ');
  await page.locator('input[name="password"]').fill('Manager-Password-1!');
  await page.getByTestId('create-manager').click();

  const created = page.getByTestId('created-manager');
  await expect(created).toBeVisible();
  const code = (await created.textContent())!.match(/T\d+/)![0];

  const row = page.getByTestId(`manager-${code.toLowerCase()}`);
  await expect(row).toContainText(code);
  await expect(row).toContainText('ผู้จัดการทดสอบ');
  await expect(row.getByTestId('learner-count')).toHaveText('0');
  await expect(row.getByTestId('record-count')).toHaveText('0');

  await row.getByTestId('toggle-status').click();
  await expect(page.getByTestId(`manager-${code.toLowerCase()}`)).toContainText('disabled');
});

test('a manager cannot reach the Managers screen', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/managers');
  await page.locator('input[name="displayName"]').fill('ผู้จัดการอื่น');
  await page.locator('input[name="password"]').fill('Manager-Password-1!');
  await page.getByTestId('create-manager').click();
  const code = (await page.getByTestId('created-manager').textContent())!.match(/T\d+/)![0];

  await loginAs(page, code.toLowerCase(), 'Manager-Password-1!');
  await page.goto('/th/admin/managers');
  await expect(page).toHaveURL(/\/th\/admin$/);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec playwright test tests/e2e/managers.spec.ts`
Expected: FAIL — `/th/admin/managers` is a 404, so the display-name input is never found.

- [ ] **Step 3: Add the messages**

Add to `messages/en.json` under `admin`, a sibling of `users`:

```json
"managers": {
  "title": "Managers",
  "new": "New manager",
  "displayName": "Holder's name",
  "password": "Initial password",
  "create": "Create manager",
  "created": "Created {code} for {name}",
  "code": "Code",
  "learners": "Learners",
  "records": "Companies",
  "status": "Status",
  "actions": "Actions",
  "disable": "Suspend",
  "enable": "Re-enable",
  "resetPassword": "Reset password",
  "passwordUpdated": "Password updated",
  "suspendHint": "Suspending a manager stops their sign-in. Their learners keep studying and their companies stay visible to you.",
  "empty": "No managers yet."
}
```

Thai, under the same key:

```json
"managers": {
  "title": "ผู้จัดการ",
  "new": "เพิ่มผู้จัดการ",
  "displayName": "ชื่อผู้ดูแลทีม",
  "password": "รหัสผ่านเริ่มต้น",
  "create": "สร้างผู้จัดการ",
  "created": "สร้าง {code} ให้ {name} แล้ว",
  "code": "รหัส",
  "learners": "ผู้เรียน",
  "records": "บริษัท",
  "status": "สถานะ",
  "actions": "จัดการ",
  "disable": "ระงับการใช้งาน",
  "enable": "เปิดใช้งานอีกครั้ง",
  "resetPassword": "ตั้งรหัสผ่านใหม่",
  "passwordUpdated": "เปลี่ยนรหัสผ่านแล้ว",
  "suspendHint": "การระงับผู้จัดการจะทำให้เข้าสู่ระบบไม่ได้ แต่ผู้เรียนในทีมยังเรียนต่อได้ และบริษัทของทีมยังอยู่ให้คุณเห็น",
  "empty": "ยังไม่มีผู้จัดการ"
}
```

Chinese, under the same key:

```json
"managers": {
  "title": "经理",
  "new": "新增经理",
  "displayName": "负责人姓名",
  "password": "初始密码",
  "create": "创建经理",
  "created": "已为 {name} 创建 {code}",
  "code": "代码",
  "learners": "学员",
  "records": "公司",
  "status": "状态",
  "actions": "操作",
  "disable": "停用",
  "enable": "重新启用",
  "resetPassword": "重置密码",
  "passwordUpdated": "密码已更新",
  "suspendHint": "停用经理后其无法登录，但团队中的学员仍可继续学习，公司记录对您依然可见。",
  "empty": "暂无经理。"
}
```

- [ ] **Step 4: Write the actions**

Create `app/[locale]/(admin)/admin/managers/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import {
  ProvisioningError,
  createManagerAccount,
  setAccountPassword,
  setAccountStatus,
} from '@/lib/db/provisioning';

export type ManagerState = { ok: boolean; error: string | null; createdLoginId: string | null };

const fail = (error: string): ManagerState => ({ ok: false, error, createdLoginId: null });

/** Only the admin creates managers (spec §4). The code is allocated, never typed. */
export async function createManagerAction(
  _prev: ManagerState,
  formData: FormData,
): Promise<ManagerState> {
  const locale = String(formData.get('locale') ?? 'th');
  await requireAdmin(locale);
  try {
    const created = await createManagerAccount({
      password: String(formData.get('password') ?? ''),
      displayName: String(formData.get('displayName') ?? '') || undefined,
    });
    revalidatePath(`/${locale}/admin/managers`);
    return { ok: true, error: null, createdLoginId: created.loginId };
  } catch (e) {
    return fail(e instanceof ProvisioningError ? e.message : 'Unexpected error');
  }
}

export async function setManagerStatusAction(
  _prev: ManagerState,
  formData: FormData,
): Promise<ManagerState> {
  const locale = String(formData.get('locale') ?? 'th');
  await requireAdmin(locale);
  const status = String(formData.get('status') ?? '') === 'disabled' ? 'disabled' : 'active';
  try {
    await setAccountStatus(String(formData.get('id') ?? ''), status);
    revalidatePath(`/${locale}/admin/managers`);
    return { ok: true, error: null, createdLoginId: null };
  } catch (e) {
    return fail(e instanceof ProvisioningError ? e.message : 'Unexpected error');
  }
}

export async function resetManagerPasswordAction(
  _prev: ManagerState,
  formData: FormData,
): Promise<ManagerState> {
  const locale = String(formData.get('locale') ?? 'th');
  await requireAdmin(locale);
  try {
    await setAccountPassword(
      String(formData.get('id') ?? ''),
      String(formData.get('newPassword') ?? ''),
    );
    revalidatePath(`/${locale}/admin/managers`);
    return { ok: true, error: null, createdLoginId: null };
  } catch (e) {
    return fail(e instanceof ProvisioningError ? e.message : 'Unexpected error');
  }
}
```

- [ ] **Step 5: Write the create form**

Create `app/[locale]/(admin)/admin/managers/new-manager-form.tsx`:

```tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { displayLoginId } from '@/lib/domain/login-id';
import { createManagerAction, type ManagerState } from './actions';

const initial: ManagerState = { ok: false, error: null, createdLoginId: null };

export function NewManagerForm() {
  const locale = useLocale();
  const t = useTranslations('admin.managers');
  const [state, formAction, pending] = useActionState(createManagerAction, initial);
  return (
    <form action={formAction} className="grid max-w-md gap-3 rounded border p-4">
      <input type="hidden" name="locale" value={locale} />
      <h2 className="text-sm font-semibold">{t('new')}</h2>
      <label className="text-sm">
        {t('displayName')}
        <input name="displayName" required className="mt-1 w-full rounded border px-2 py-1" />
      </label>
      <label className="text-sm">
        {t('password')}
        <input
          name="password"
          type="password"
          required
          minLength={10}
          className="mt-1 w-full rounded border px-2 py-1"
        />
      </label>
      {state.error && (
        <p role="alert" data-testid="create-manager-error" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.ok && state.createdLoginId && (
        <p role="status" data-testid="created-manager" className="text-sm text-green-700">
          {displayLoginId(state.createdLoginId)}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        data-testid="create-manager"
        className="justify-self-start rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {t('create')}
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Write the page**

Create `app/[locale]/(admin)/admin/managers/page.tsx`:

```tsx
import { getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/db/server';
import { displayLoginId } from '@/lib/domain/login-id';
import { ManagerRowControls } from './row-controls';
import { NewManagerForm } from './new-manager-form';

/** Admin only: managers are the one thing a manager may not create (spec §4). */
export default async function ManagersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireAdmin(locale);
  const db = await createSupabaseServerClient();
  const t = await getTranslations('admin.managers');

  const { data: managers } = await db
    .from('profiles')
    .select('id, login_id, display_name, status, created_at')
    .eq('role', 'manager')
    .order('login_id');
  const ids = (managers ?? []).map((m) => m.id);
  const { data: learners } = ids.length
    ? await db.from('profiles').select('manager_id').in('manager_id', ids)
    : { data: [] };
  const { data: records } = ids.length
    ? await db.from('dbd_records').select('team_id').in('team_id', ids)
    : { data: [] };
  const count = (rows: { [k: string]: string | null }[], key: string, id: string) =>
    rows.filter((r) => r[key] === id).length;

  return (
    <section className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <NewManagerForm />
      <p className="text-xs text-gray-600">{t('suspendHint')}</p>
      {(managers ?? []).length === 0 ? (
        <p className="text-sm">{t('empty')}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">{t('code')}</th>
              <th>{t('displayName')}</th>
              <th>{t('learners')}</th>
              <th>{t('records')}</th>
              <th>{t('status')}</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {(managers ?? []).map((m) => (
              <tr key={m.id} className="border-b" data-testid={`manager-${m.login_id}`}>
                <td className="py-2 font-mono">{displayLoginId(m.login_id)}</td>
                <td>{m.display_name ?? '—'}</td>
                <td data-testid="learner-count">
                  {count(learners ?? [], 'manager_id', m.id)}
                </td>
                <td data-testid="record-count">{count(records ?? [], 'team_id', m.id)}</td>
                <td>{m.status}</td>
                <td>
                  <ManagerRowControls id={m.id} status={m.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
```

- [ ] **Step 7: Write the row controls**

Create `app/[locale]/(admin)/admin/managers/row-controls.tsx`:

```tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  resetManagerPasswordAction,
  setManagerStatusAction,
  type ManagerState,
} from './actions';

const initial: ManagerState = { ok: false, error: null, createdLoginId: null };

export function ManagerRowControls({ id, status }: { id: string; status: string }) {
  const locale = useLocale();
  const t = useTranslations('admin.managers');
  const [statusState, statusAction, statusPending] = useActionState(
    setManagerStatusAction,
    initial,
  );
  const [pwState, pwAction, pwPending] = useActionState(resetManagerPasswordAction, initial);
  const next = status === 'disabled' ? 'active' : 'disabled';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={statusAction}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="status" value={next} />
        <button
          type="submit"
          disabled={statusPending}
          data-testid="toggle-status"
          className="text-xs underline disabled:opacity-50"
        >
          {next === 'disabled' ? t('disable') : t('enable')}
        </button>
      </form>
      <form action={pwAction} className="flex items-center gap-1">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="id" value={id} />
        <input
          name="newPassword"
          type="password"
          minLength={10}
          placeholder={t('resetPassword')}
          className="w-36 rounded border px-1 py-0.5 text-xs"
        />
        <button
          type="submit"
          disabled={pwPending}
          data-testid="reset-password"
          className="text-xs underline disabled:opacity-50"
        >
          {t('resetPassword')}
        </button>
      </form>
      {(statusState.error ?? pwState.error) && (
        <span role="alert" className="text-xs text-red-700">
          {statusState.error ?? pwState.error}
        </span>
      )}
      {pwState.ok && <span className="text-xs text-green-700">{t('passwordUpdated')}</span>}
    </div>
  );
}
```

- [ ] **Step 8: Run the e2e**

Run: `pnpm exec playwright test tests/e2e/managers.spec.ts`
Expected: PASS, 2 tests.

- [ ] **Step 9: Verify the message files stay in step**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/messages.test.ts`
Expected: PASS, 3 tests — all three locales carry the same keys.

- [ ] **Step 10: Commit**

```bash
git add app/[locale]/\(admin\)/admin/managers messages tests/e2e/managers.spec.ts
git commit -m "feat(p15b): the Managers screen"
```

---

### Task 4: The Users screen becomes a team screen

**Files:**

- Modify: `app/[locale]/(admin)/admin/users/page.tsx`
- Modify: `app/[locale]/(admin)/admin/users/new-user-form.tsx`
- Modify: `app/[locale]/(admin)/admin/users/actions.ts`
- Modify: `messages/th.json`, `messages/en.json`, `messages/zh.json`
- Test: `tests/e2e/admin-users.spec.ts`

**Interfaces:**

- Consumes: `createLearnerAccount` from Task 2, `displayLoginId` from Task 1, `requireStaff` from Task 1.
- Produces: `createUserAction` keeps its signature `(prev: CreateUserState, formData: FormData) => Promise<CreateUserState>`; `CreateUserState` gains no fields. The form posts `managerId` (admins only), `password`, `displayName`, `dbdRecordId` — and no longer posts `loginId`.

- [ ] **Step 1: Write the failing e2e**

Replace the first test in `tests/e2e/admin-users.spec.ts` and add two more, keeping the rest of the file:

```ts
test('a learner is created inside a team, with an allocated code', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);

  await page.goto('/th/admin/managers');
  await page.locator('input[name="displayName"]').fill('หัวหน้าทีม');
  await page.locator('input[name="password"]').fill('Manager-Password-1!');
  await page.getByTestId('create-manager').click();
  const code = (await page.getByTestId('created-manager').textContent())!.match(/T\d+/)![0];

  const recordId = await createConfirmedRecord(page, {
    companyNameTh: 'บริษัท ของทีม จำกัด',
    juristicId: '0105568233706',
    issuedOn: '13/07/2569',
  });
  await page.goto(`/th/admin/dbd-records/${recordId}`);

  await page.goto('/th/admin/users');
  await page.locator('select[name="managerId"]').selectOption({ label: new RegExp(code) });
  await page.locator('input[name="displayName"]').fill('ผู้เรียนของทีม');
  await page.locator('input[name="password"]').fill('Learner-Password-1!');
  await page.locator('select[name="dbdRecordId"]').selectOption({ label: 'บริษัท ของทีม จำกัด' });
  await page.getByTestId('create-user').click();

  await expect(page.getByTestId('create-user-status')).toContainText(`${code}-01`);
  await expect(page.getByTestId(`team-${code.toLowerCase()}-01`)).toHaveText(code);
});

test('a manager sees only their own learners, no team picker, and no other team company', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/managers');
  await page.locator('input[name="displayName"]').fill('ทีมเดียว');
  await page.locator('input[name="password"]').fill('Manager-Password-1!');
  await page.getByTestId('create-manager').click();
  const code = (await page.getByTestId('created-manager').textContent())!.match(/T\d+/)![0];

  // A confirmed company that belongs to the admin, not to this manager.
  await createConfirmedRecord(page, {
    companyNameTh: 'บริษัท ของแอดมิน จำกัด',
    juristicId: '0105568233708',
    issuedOn: '13/07/2569',
  });

  await loginAs(page, code.toLowerCase(), 'Manager-Password-1!');
  await page.goto('/th/admin/users');
  await expect(page.locator('select[name="managerId"]')).toHaveCount(0);
  await expect(page.getByRole('row')).toHaveCount(1); // the header row only
  // The picker is RLS-narrowed: a record they cannot read is not an option they can pick.
  await expect(page.locator('select[name="dbdRecordId"]')).not.toContainText(
    'บริษัท ของแอดมิน จำกัด',
  );
});

test('the admin must say which team', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const recordId = await createConfirmedRecord(page, {
    companyNameTh: 'บริษัท ไม่มีทีม จำกัด',
    juristicId: '0105568233709',
    issuedOn: '13/07/2569',
  });
  expect(recordId).toBeTruthy();

  await page.goto('/th/admin/users');
  await page.locator('input[name="displayName"]').fill('ผู้เรียนไร้ทีม');
  await page.locator('input[name="password"]').fill('Learner-Password-1!');
  await page.locator('select[name="dbdRecordId"]').selectOption({
    label: 'บริษัท ไม่มีทีม จำกัด',
  });
  // Leaving the team unchosen must be refused in words, not inside the allocator.
  await page.getByTestId('create-user').click();
  await expect(page.getByTestId('create-user-error')).toBeVisible();
});
```

Both new tests use `createConfirmedRecord`, so widen the spec's import:

```ts
import { createConfirmedRecord, loginAs } from './helpers';
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec playwright test tests/e2e/admin-users.spec.ts`
Expected: FAIL — there is no `select[name="managerId"]`, and the form still demands a typed login id.

- [ ] **Step 3: Add the messages**

Add to `admin.users` in `messages/en.json`: `"team": "Team"`, `"chooseTeam": "Which team?"`, `"noManager": "Create a manager first — every learner belongs to a team."`, `"createdCode": "Created {code} for {company}"`.

In `messages/th.json`: `"team": "ทีม"`, `"chooseTeam": "อยู่ทีมใด"`, `"noManager": "สร้างผู้จัดการก่อน — ผู้เรียนทุกคนต้องอยู่ในทีม"`, `"createdCode": "สร้าง {code} สำหรับ {company} แล้ว"`.

In `messages/zh.json`: `"team": "团队"`, `"chooseTeam": "属于哪个团队？"`, `"noManager": "请先创建经理——每位学员都属于某个团队。"`, `"createdCode": "已为 {company} 创建 {code}"`.

- [ ] **Step 4: Rewrite the action**

In `app/[locale]/(admin)/admin/users/actions.ts`, swap the guard and the creation call:

```ts
import { requireStaff } from '@/lib/auth/session';
import { ProvisioningError, createLearnerAccount } from '@/lib/db/provisioning';
...
export async function createUserAction(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const locale = String(formData.get('locale') ?? 'th');
  const staff = await requireStaff(locale);
  const fail = (error: string): CreateUserState => ({
    ok: false,
    error,
    createdLoginId: null,
    company: null,
  });
  const db = await createSupabaseServerClient();

  // A manager creates inside their own team; the admin says which team it is (spec §7).
  const managerId =
    staff.role === 'manager' ? staff.id : String(formData.get('managerId') ?? '');
  if (!managerId) return fail('Choose the team this learner belongs to');

  const dbdRecordId = String(formData.get('dbdRecordId') ?? '');
  if (!dbdRecordId) return fail('Choose the company the learner belongs to');
  const { data: record, error: recordError } = await db
    .from('dbd_records')
    .select('id, company_name_th, extraction_status')
    .eq('id', dbdRecordId)
    .maybeSingle();
  if (recordError) return fail(recordError.message);
  if (!record || record.extraction_status !== 'confirmed') {
    return fail('The chosen DBD record is not confirmed yet');
  }

  let created: { id: string; loginId: string };
  try {
    created = await createLearnerAccount({
      password: String(formData.get('password') ?? ''),
      displayName: String(formData.get('displayName') ?? '') || undefined,
      managerId,
    });
  } catch (e) {
    return fail(e instanceof ProvisioningError ? e.message : 'Unexpected error');
  }
  try {
    await assignDbdRecord(db, { userId: created.id, dbdRecordId: record.id });
  } catch (e) {
    revalidatePath(`/${locale}/admin/users`);
    const message = e instanceof Error ? e.message : String(e);
    return fail(`Created ${created.loginId}, but the company could not be assigned: ${message}`);
  }
  revalidatePath(`/${locale}/admin/users`);
  return {
    ok: true,
    error: null,
    createdLoginId: created.loginId,
    company: record.company_name_th ?? record.id,
  };
}
```

- [ ] **Step 5: Rewrite the form**

In `app/[locale]/(admin)/admin/users/new-user-form.tsx`, remove the `loginId` input entirely and add the team picker above the company picker. The component gains two props:

```tsx
export type TeamOption = { id: string; code: string; name: string | null };

export function NewUserForm({
  companies,
  teams = null,
}: {
  companies: CompanyOption[];
  /** Null for a manager: they create inside their own team (spec §7). */
  teams?: TeamOption[] | null;
}) {
```

and, immediately after the hidden `locale` input:

```tsx
      {teams && (
        <label className="text-sm">
          {t('team')}
          {teams.length === 0 ? (
            <p data-testid="no-manager" className="text-sm text-amber-800">
              {t('noManager')}
            </p>
          ) : (
            <select name="managerId" required className="mt-1 w-full rounded border px-2 py-1">
              <option value="">{t('chooseTeam')}</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name ? `${team.code} — ${team.name}` : team.code}
                </option>
              ))}
            </select>
          )}
        </label>
      )}
```

Replace the success line so it shows the allocated code:

```tsx
      {state.ok && state.createdLoginId && (
        <p role="status" data-testid="create-user-status" className="text-sm text-green-700">
          {t('createdCode', {
            code: displayLoginId(state.createdLoginId),
            company: state.company ?? '',
          })}
        </p>
      )}
```

- [ ] **Step 6: Rewrite the page**

In `app/[locale]/(admin)/admin/users/page.tsx`: swap `requireAdmin` for `requireStaff`, keep the caller, load the teams only for an admin, and add the team column. The existing page names its client `supabase` — keep that name. Widen the import to carry the new type:

```tsx
import { requireStaff } from '@/lib/auth/session';
import { displayLoginId } from '@/lib/domain/login-id';
import { NewUserForm, type CompanyOption, type TeamOption } from './new-user-form';
```

Then replace the guard line and the `NewUserForm` call:

```tsx
  const staff = await requireStaff(locale);
  ...
  // RLS already narrows both lists to the caller's team; the admin sees every row.
  const { data: managers } = staff.role === 'admin'
    ? await supabase
        .from('profiles')
        .select('id, login_id, display_name')
        .eq('role', 'manager')
        .eq('status', 'active')
        .order('login_id')
    : { data: null };
  const teams: TeamOption[] | null = managers
    ? managers.map((m) => ({ id: m.id, code: displayLoginId(m.login_id), name: m.display_name }))
    : null;
  const teamCodeOf = new Map((managers ?? []).map((m) => [m.id, displayLoginId(m.login_id)]));
  ...
  <NewUserForm companies={companies} teams={teams} />
```

Add `manager_id` to the profiles select, show the code in the table, and add the column header `{t('team')}` between Company and Role:

```tsx
              <td data-testid={`team-${u.login_id}`}>
                {u.manager_id ? (teamCodeOf.get(u.manager_id) ?? '—') : '—'}
              </td>
```

and show the login id upper-case in the first cell:

```tsx
                <Link href={`/admin/users/${u.id}`} className="underline">
                  {displayLoginId(u.login_id)}
                </Link>
```

- [ ] **Step 7: Run the e2e**

Run: `pnpm exec playwright test tests/e2e/admin-users.spec.ts`
Expected: PASS — a learner is created as `T0n-01`, the team column shows `T0n`, and a manager sees no team picker and no other team's learners.

- [ ] **Step 8: Run the suites that create users**

Run: `pnpm exec playwright test tests/e2e/admin-assign.spec.ts tests/e2e/language.spec.ts && pnpm exec vitest run --config vitest.integration.config.ts`
Expected: PASS, unchanged counts.

- [ ] **Step 9: Commit**

```bash
git add app/[locale]/\(admin\)/admin/users messages tests/e2e/admin-users.spec.ts
git commit -m "feat(p15b): the Users screen is scoped to a team"
```

---

### Task 5: Navigation and the admin-only doors

**Files:**

- Modify: `app/[locale]/(admin)/admin/page.tsx`
- Modify: `app/[locale]/(admin)/admin/settings/page.tsx`, `audit/page.tsx`, `notifications/page.tsx` (keep `requireAdmin`)
- Modify: `app/[locale]/(admin)/admin/dbd-records/page.tsx`, `content/page.tsx`, `questions/page.tsx`, `calls/page.tsx` (to `requireStaff`)
- Modify: `messages/th.json`, `messages/en.json`, `messages/zh.json`
- Test: `tests/e2e/manager-access.spec.ts`

**Interfaces:**

- Consumes: `requireStaff` and `requireAdmin` from Task 1, the Managers route from Task 3.
- Produces: no new exports; the admin hub renders a different list per role.

- [ ] **Step 1: Write the failing e2e**

Create `tests/e2e/manager-access.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';

const MANAGER_PASSWORD = 'Manager-Password-1!';

async function newManager(page: import('@playwright/test').Page): Promise<string> {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/managers');
  await page.locator('input[name="displayName"]').fill('ผู้จัดการสิทธิ์');
  await page.locator('input[name="password"]').fill(MANAGER_PASSWORD);
  await page.getByTestId('create-manager').click();
  return (await page.getByTestId('created-manager').textContent())!.match(/T\d+/)![0].toLowerCase();
}

test('a manager lands in the admin area and sees only their own doors', async ({ page }) => {
  const code = await newManager(page);
  await loginAs(page, code, MANAGER_PASSWORD);

  await expect(page).toHaveURL(/\/th\/admin$/);
  const nav = page.getByTestId('admin-nav');
  await expect(nav).toContainText('ข้อมูล DBD');
  await expect(nav).not.toContainText('ตั้งค่านโยบาย');
  await expect(nav).not.toContainText('บันทึกการใช้งาน');
  await expect(nav).not.toContainText('ผู้จัดการ');
});

test('typing an admin-only URL does not get a manager in', async ({ page }) => {
  const code = await newManager(page);
  await loginAs(page, code, MANAGER_PASSWORD);

  for (const path of ['settings', 'audit', 'notifications', 'managers']) {
    await page.goto(`/th/admin/${path}`);
    await expect(page, path).toHaveURL(/\/th\/admin$/);
  }
});

test('a suspended manager loses the admin area on the next request', async ({ page }) => {
  const code = await newManager(page);
  await loginAs(page, code, MANAGER_PASSWORD);
  await expect(page).toHaveURL(/\/th\/admin$/);

  const managerPage = page;
  const admin = await page.context().browser()!.newContext();
  const adminPage = await admin.newPage();
  await loginAs(adminPage, E2E_ADMIN.loginId, E2E_PASSWORD);
  await adminPage.goto('/th/admin/managers');
  await adminPage.getByTestId(`manager-${code}`).getByTestId('toggle-status').click();
  await expect(adminPage.getByTestId(`manager-${code}`)).toContainText('disabled');
  await admin.close();

  await managerPage.goto('/th/admin/dbd-records');
  await expect(managerPage).toHaveURL(/\/th\/login/);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec playwright test tests/e2e/manager-access.spec.ts`
Expected: FAIL — there is no `admin-nav` test id, and every admin page still admits any staff member.

- [ ] **Step 3: Add the nav message**

Add `"managers": "Managers"` to `admin.nav` in `messages/en.json`, `"managers": "ผู้จัดการ"` in `messages/th.json`, `"managers": "经理"` in `messages/zh.json`.

- [ ] **Step 4: Filter the hub by role**

Replace the body of `app/[locale]/(admin)/admin/page.tsx`:

```tsx
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireStaff } from '@/lib/auth/session';

/** The doors a manager may open, in order; the admin gets these plus the admin-only ones. */
const STAFF_LINKS = [
  ['/admin/users', 'users'],
  ['/admin/dbd-records', 'dbdRecords'],
  ['/admin/content', 'content'],
  ['/admin/questions', 'questions'],
  ['/admin/calls', 'calls'],
] as const;

const ADMIN_LINKS = [
  ['/admin/managers', 'managers'],
  ['/admin/notifications', 'notifications'],
  ['/admin/settings', 'settings'],
  ['/admin/audit', 'audit'],
] as const;

export default async function AdminHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireStaff(locale);
  const t = await getTranslations('admin');
  const links = user.role === 'admin' ? [...ADMIN_LINKS, ...STAFF_LINKS] : STAFF_LINKS;
  return (
    <section>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <ul className="mt-4 list-disc pl-6" data-testid="admin-nav">
        {links.map(([href, key]) => (
          <li key={href}>
            <Link href={href} className="underline">
              {t(`nav.${key}` as 'nav.users')}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 5: Open the staff doors and keep the admin ones shut**

In each of `admin/dbd-records/page.tsx`, `admin/content/page.tsx`, `admin/questions/page.tsx` and `admin/calls/page.tsx`, change the import and the call:

```tsx
import { requireStaff } from '@/lib/auth/session';
...
  await requireStaff(locale);
```

Leave `admin/settings/page.tsx`, `admin/audit/page.tsx` and `admin/notifications/page.tsx` calling `requireAdmin` — Task 1 made that redirect a manager to `/admin` rather than `/dashboard`.

- [ ] **Step 6: Run the e2e**

Run: `pnpm exec playwright test tests/e2e/manager-access.spec.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Check every other admin page still works for the admin**

Run: `pnpm exec playwright test`
Expected: PASS, all specs.

- [ ] **Step 8: Commit**

```bash
git add app/[locale]/\(admin\) messages tests/e2e/manager-access.spec.ts
git commit -m "feat(p15b): navigation and page guards follow the role"
```

---

### Task 6: The three-role walkthrough, the decision, and the whole suite

**Files:**

- Create: `tests/e2e/three-roles.spec.ts`
- Modify: `docs/decisions-log.md`
- Modify: `docs/superpowers/specs/2026-09-23-teams-and-roles-design.md:5` (status line)
- Modify: `docs/security-checklist.md`

**Interfaces:**

- Consumes: everything from Tasks 1–5.
- Produces: decision D59; the spec marked as stage 2 implemented.

- [ ] **Step 1: Write the walkthrough**

Create `tests/e2e/three-roles.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { createConfirmedRecord, loginAs } from './helpers';

const MANAGER_PASSWORD = 'Manager-Password-1!';
const LEARNER_PASSWORD = 'Learner-Password-1!';

test('owner creates a manager, the manager creates a learner, the learner studies', async ({
  page,
}) => {
  // 1. The owner creates a manager.
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/managers');
  await page.locator('input[name="displayName"]').fill('คุณผู้จัดการ');
  await page.locator('input[name="password"]').fill(MANAGER_PASSWORD);
  await page.getByTestId('create-manager').click();
  const code = (await page.getByTestId('created-manager').textContent())!.match(/T\d+/)![0];

  // 2. The manager signs in, and the company they upload is their own.
  await loginAs(page, code.toLowerCase(), MANAGER_PASSWORD);
  await expect(page).toHaveURL(/\/th\/admin$/);
  await createConfirmedRecord(page, {
    companyNameTh: 'บริษัท สามระดับ จำกัด',
    juristicId: '0105568233707',
    issuedOn: '13/07/2569',
  });

  // 3. The manager creates a learner: the code follows their own.
  await page.goto('/th/admin/users');
  await page.locator('input[name="displayName"]').fill('ผู้เรียนสามระดับ');
  await page.locator('input[name="password"]').fill(LEARNER_PASSWORD);
  await page.locator('select[name="dbdRecordId"]').selectOption({
    label: 'บริษัท สามระดับ จำกัด',
  });
  await page.getByTestId('create-user').click();
  await expect(page.getByTestId('create-user-status')).toContainText(`${code}-01`);

  // 4. The learner signs in and sees their own company.
  await loginAs(page, `${code.toLowerCase()}-01`, LEARNER_PASSWORD);
  await expect(page).toHaveURL(/\/th\/dashboard$/);
  await expect(page.getByTestId('company-name')).toHaveText('บริษัท สามระดับ จำกัด');
});
```

- [ ] **Step 2: Run it**

Run: `pnpm exec playwright test tests/e2e/three-roles.spec.ts`
Expected: PASS — this is the check the owner asked for, in one spec.

- [ ] **Step 3: Record the decision**

Insert this row in `docs/decisions-log.md` directly above the `| 2026-09-24 | D58 |` row:

```markdown
| 2026-09-24 | D59 | Account codes are allocated, never typed: the Managers screen creates `T01`, `T02` … and the Users screen creates `T01-01` inside a chosen team, both from `allocate_login_id`, stored lower-case and shown upper-case through `displayLoginId`. A learner always belongs to a team, so the admin picks which one and a manager's own team is implied. `requireAdmin` splits into `requireAdmin` (Policy settings, Managers, audit, notifications) and `requireStaff` (users, records, content, questions, calls); the hub lists only the doors a role may open, and each admin-only page bounces a manager itself rather than trusting the hidden link | `lib/db/provisioning.ts`, `lib/auth/session.ts`, `app/[locale]/(admin)/admin/managers/` |
```

- [ ] **Step 4: Mark the spec**

In `docs/superpowers/specs/2026-09-23-teams-and-roles-design.md`, change the status line to:

```markdown
| Status | Stages 1–2 implemented (P15a, P15b); stage 3 (P15c) pending |
```

- [ ] **Step 5: Add the checklist row**

Append to the table in `docs/security-checklist.md`:

```markdown
| 20 | A manager cannot reach Policy settings, the Managers screen, notifications or the full audit log by typing the URL, and a manager suspended mid-session loses the admin area on their next request | ✅ | `tests/e2e/manager-access.spec.ts` |
```

- [ ] **Step 6: Run everything**

Run: `pnpm exec vitest run --config vitest.config.ts && pnpm exec vitest run --config vitest.integration.config.ts && pnpm exec playwright test && pnpm lint && pnpm format:check && pnpm build && pnpm check:secrets`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/three-roles.spec.ts docs
git commit -m "docs(p15b): record the allocated-code model as D59"
```

- [ ] **Step 8: Deploy**

P15b adds no migration, so nothing is applied to Supabase. Merge to `main` and push; CI and the staging deploy follow as usual.

---

## Self-review

**Spec coverage.** §3.3 codes → Task 2. §4 permissions (managers admin-only, learners team-scoped) → Tasks 3, 4, 5. §7 creating a manager and a learner → Tasks 3, 4. §7 suspending a manager → Task 3, proven in Task 5. §11 session guards → Task 1. §11 screens (Managers, team-scoped Users, filtered navigation, upper-case display) → Tasks 3, 4, 5, 1. §12 stage 2 → the whole plan.

**Deliberate gaps, both from the spec.** §7 mentions a *contact channel* when creating a manager and §11 mentions editing it; nothing reads it, because §8 defers notifications at the owner's instruction, so storing it now would be a column with no consumer. §11's "Queries pass the caller's team" is satisfied by RLS alone here — the two lists this stage touches are already narrowed by policy, and a redundant filter would only hide a policy bug. Both are noted rather than silently dropped.
