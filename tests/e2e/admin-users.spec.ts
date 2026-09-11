import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { login, loginAs } from './helpers';

test('admin creates a learner who can then sign in', async ({ page }) => {
  const loginId = `e2e-new-${Date.now()}`;
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/users');
  await page.locator('input[name="loginId"]').fill(loginId);
  await page.locator('input[name="password"]').fill('Learner-Pass-123');
  await page.locator('input[name="displayName"]').fill('E2E Learner');
  await page.getByRole('button', { name: 'สร้างผู้ใช้' }).click();
  await expect(page.getByTestId('create-user-status')).toContainText(loginId);
  await expect(page.getByRole('link', { name: loginId })).toBeVisible();

  await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
  await login(page, loginId, 'Learner-Pass-123');
  await expect(page).toHaveURL(/\/th\/dashboard$/);
  await expect(page.getByText('ยินดีต้อนรับ E2E Learner')).toBeVisible();
});

test('admin can disable an account and it can no longer sign in', async ({ page }) => {
  const loginId = `e2e-disable-${Date.now()}`;
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/users');
  await page.locator('input[name="loginId"]').fill(loginId);
  await page.locator('input[name="password"]').fill('Learner-Pass-123');
  await page.getByRole('button', { name: 'สร้างผู้ใช้' }).click();
  await page.getByRole('link', { name: loginId }).click();
  await page.getByRole('button', { name: 'ระงับบัญชี' }).click();
  await expect(page.getByTestId('account-status')).toHaveText('disabled');

  await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
  await login(page, loginId, 'Learner-Pass-123');
  await expect(page.getByTestId('login-error')).toBeVisible();
  await expect(page).toHaveURL(/\/th\/login$/);
});
