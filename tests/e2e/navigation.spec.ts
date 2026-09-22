import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';

test('every page below the home offers Back and Home; the home page does not', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin');
  await expect(page.getByTestId('nav-back')).toHaveCount(0);
  await expect(page.getByTestId('nav-home')).toHaveCount(0);

  await page.getByRole('link', { name: 'ผู้ใช้' }).first().click();
  await expect(page).toHaveURL(/\/th\/admin\/users$/);
  await page.getByTestId('nav-back').click();
  await expect(page).toHaveURL(/\/th\/admin$/);

  await page.goto('/th/admin/dbd-records');
  await page.getByTestId('nav-home').click();
  await expect(page).toHaveURL(/\/th\/admin$/);

  // The app name in the header leads home as well.
  await page.goto('/th/admin/settings');
  await page.getByRole('link', { name: /Admin$/ }).click();
  await expect(page).toHaveURL(/\/th\/admin$/);
});
