import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs, switchTo } from './helpers';

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

  await switchTo(page, code.toLowerCase(), 'Manager-Password-1!');
  await page.goto('/th/admin/managers');
  await expect(page).toHaveURL(/\/th\/admin$/);
});
