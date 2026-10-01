import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { createManager, loginAs, switchTo } from './helpers';
import { auditRowsFor } from './seed';

const MANAGER_PASSWORD = 'Manager-Password-1!';

test('the admin creates a manager, sees the team, and can suspend it', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ผู้จัดการทดสอบ', MANAGER_PASSWORD);

  const row = page.getByTestId(`manager-${code.toLowerCase()}`);
  await expect(row).toContainText(code);
  await expect(row).toContainText('ผู้จัดการทดสอบ');
  await expect(row.getByTestId('learner-count')).toHaveText('0');
  await expect(row.getByTestId('record-count')).toHaveText('0');

  await row.getByTestId('toggle-status').click();
  await expect(page.getByTestId(`manager-${code.toLowerCase()}`)).toContainText('disabled');

  // Spec §7: creating a manager, and suspending one, are recorded in the audit log (read from
  // the table: there is no audit screen, D81).
  const created = await auditRowsFor({
    action: 'profiles.create',
    actorLoginId: E2E_ADMIN.loginId,
  });
  expect(
    created.some((r) => (r.after as { login_id?: string }).login_id === code.toLowerCase()),
  ).toBe(true);
  const [suspended] = await auditRowsFor({
    action: 'profiles.status',
    actorLoginId: E2E_ADMIN.loginId,
  });
  expect((suspended.after as { status?: string }).status).toBe('disabled');
});

test('the admin types a manager code after T-, and a taken one is refused', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/managers');
  const form = page.locator('form:has([data-testid="create-manager"])');
  await expect(form.getByTestId('login-id-prefix')).toHaveText('T-');
  // A free code is filled in (D69): one letter and two digits (D85); ↻ offers another.
  const first = await form.getByTestId('login-suffix').inputValue();
  expect(first).toMatch(/^[A-Z][0-9]{2}$/);
  await form.getByTestId('suggest-login-id').click();
  await expect(form.getByTestId('login-id-status')).toHaveAttribute('data-state', 'available');
  const offered = await form.getByTestId('login-suffix').inputValue();
  expect(offered).toMatch(/^[A-Z][0-9]{2}$/);

  // D69's two-character shape is refused as it is typed, in the manager's words (D85).
  await form.getByTestId('login-suffix').fill('G4');
  await expect(form.getByTestId('login-id-status')).toHaveAttribute('data-state', 'invalid');
  await expect(form.getByTestId('login-id-status')).toHaveText(
    'ใช้ตัวอักษรภาษาอังกฤษ 1 ตัวตามด้วยตัวเลข 2 ตัว เช่น A12',
  );

  // A code typed in any case is stored as typed and shown upper-case.
  const suffix = offered.toLowerCase();
  const code = await createManager(page, 'ผู้จัดการพิมพ์รหัส', MANAGER_PASSWORD, suffix);
  expect(code).toBe(`T-${offered}`);

  await page.goto('/th/admin/managers');
  // Typed before the page hydrates, the input never reaches React; type until it answers.
  await expect(async () => {
    await form.getByTestId('login-suffix').fill(suffix.toUpperCase());
    await expect(form.getByTestId('login-id-status')).toHaveAttribute('data-state', 'taken', {
      timeout: 2_000,
    });
  }).toPass();
  await form.locator('input[name="displayName"]').fill('ผู้จัดการซ้ำ');
  await form.locator('input[name="password"]').fill(MANAGER_PASSWORD);
  await page.getByTestId('create-manager').click();
  await expect(page.getByTestId('create-manager-error')).toHaveText(
    'รหัสนี้มีผู้ใช้แล้ว กรุณาเลือกรหัสอื่น',
  );
});

test('a manager cannot reach the Managers screen', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ผู้จัดการอื่น', MANAGER_PASSWORD);

  await switchTo(page, code.toLowerCase(), MANAGER_PASSWORD);
  await page.goto('/th/admin/managers');
  await expect(page).toHaveURL(/\/th\/admin$/);
});
