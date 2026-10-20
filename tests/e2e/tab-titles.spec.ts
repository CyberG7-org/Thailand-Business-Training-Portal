import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_LEARNER, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';

/** Browser tabs read "Page · Role" in the page's language, never the web address. */
test('tab titles name the page first, then the role', async ({ page }) => {
  await page.goto('/en/login');
  await expect(page).toHaveTitle('Sign in · Business Training Portal');

  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/en/admin');
  await expect(page).toHaveTitle('Dashboard · Owner');
  await page.goto('/en/admin/submanagers');
  await expect(page).toHaveTitle('Submanagers · Owner');
  await page.goto('/th/admin/learners');
  await expect(page).toHaveTitle('บันทึกผู้เรียน · เจ้าของ');

  await page.context().clearCookies();
  await loginAs(page, E2E_LEARNER.loginId, E2E_PASSWORD);
  await page.goto('/en/dashboard');
  await expect(page).toHaveTitle('Dashboard · Learner');
  await page.goto('/en/study');
  await expect(page).toHaveTitle('Study material · Learner');
});
