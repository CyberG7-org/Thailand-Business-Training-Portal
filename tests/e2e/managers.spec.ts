import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { createManager, loginAs, switchTo } from './helpers';

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

  // Spec §7: creating a manager, and suspending one, are recorded in the audit log.
  await page.goto('/th/admin/audit');
  await expect(page.locator('tr').filter({ hasText: 'profiles.create' }).first()).toContainText(
    code.toLowerCase(),
  );
  await expect(page.locator('tr').filter({ hasText: 'profiles.status' }).first()).toContainText(
    'disabled',
  );
});

test('the admin types a manager code after T-, and a taken one is refused', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/managers');
  const form = page.locator('form:has([data-testid="create-manager"])');
  await expect(form.getByTestId('login-id-prefix')).toHaveText('T-');
  // A free code is filled in (D69); ↻ offers another.
  const first = await form.getByTestId('login-suffix').inputValue();
  expect(first).toMatch(/^[A-Z][0-9]$/);
  await form.getByTestId('suggest-login-id').click();
  await expect(form.getByTestId('login-id-status')).toHaveAttribute('data-state', 'available');

  // A code of up to six letters or digits, typed in any case, is stored as typed and shown
  // upper-case.
  const suffix = `m${Date.now().toString(36).slice(-5)}`;
  const code = await createManager(page, 'ผู้จัดการพิมพ์รหัส', MANAGER_PASSWORD, suffix);
  expect(code).toBe(`T-${suffix.toUpperCase()}`);

  await page.goto('/th/admin/managers');
  await form.getByTestId('login-suffix').fill(suffix.toUpperCase());
  await expect(form.getByTestId('login-id-status')).toHaveAttribute('data-state', 'taken');
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
