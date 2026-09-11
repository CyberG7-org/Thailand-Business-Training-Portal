import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_LEARNER, E2E_PASSWORD } from './fixtures';
import { login, loginAs } from './helpers';

test('wrong password and unknown account show the same generic error', async ({ page }) => {
  await login(page, E2E_LEARNER.loginId, 'wrong-password');
  await expect(page.getByTestId('login-error')).toHaveText('รหัสผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  await expect(page).toHaveURL(/\/th\/login$/);

  await login(page, 'no-such-user', 'wrong-password');
  await expect(page.getByTestId('login-error')).toHaveText('รหัสผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
});

test('a learner lands on the dashboard and cannot open admin', async ({ page }) => {
  await loginAs(page, E2E_LEARNER.loginId, E2E_PASSWORD);
  await expect(page).toHaveURL(/\/th\/dashboard$/);
  await expect(page.getByText(`ยินดีต้อนรับ ${E2E_LEARNER.loginId}`)).toBeVisible();

  await page.goto('/th/admin');
  await expect(page).toHaveURL(/\/th\/dashboard$/);
});

test('an admin lands on the admin home', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await expect(page).toHaveURL(/\/th\/admin$/);
});

test('signed-out visitors are sent to login, and sign-out works', async ({ page }) => {
  await page.goto('/th/dashboard');
  await expect(page).toHaveURL(/\/th\/login$/);

  await loginAs(page, E2E_LEARNER.loginId, E2E_PASSWORD);
  await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
  await expect(page).toHaveURL(/\/th\/login$/);
  await page.goto('/th/dashboard');
  await expect(page).toHaveURL(/\/th\/login$/);
});
