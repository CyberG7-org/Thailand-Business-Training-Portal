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

test('a manager cannot reach the Managers screen', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ผู้จัดการอื่น', MANAGER_PASSWORD);

  await switchTo(page, code.toLowerCase(), MANAGER_PASSWORD);
  await page.goto('/th/admin/managers');
  await expect(page).toHaveURL(/\/th\/admin$/);
});
