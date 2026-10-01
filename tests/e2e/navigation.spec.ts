import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';

/**
 * D82: staff pages carry no Back or Home buttons — the sidebar reaches every section, the app
 * name leads home, and a detail page links to its own list.
 */
test('staff pages have no Back or Home buttons; the sidebar and the app name lead around', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  for (const path of ['/th/admin', '/th/admin/users', '/th/admin/learners', '/th/admin/settings']) {
    await page.goto(path);
    await expect(page.getByTestId('staff-nav'), path).toBeVisible();
    await expect(page.getByTestId('nav-back'), path).toHaveCount(0);
    await expect(page.getByTestId('nav-home'), path).toHaveCount(0);
  }

  await page.getByTestId('staff-nav').getByRole('link', { name: 'บันทึกผู้เรียน' }).click();
  await expect(page).toHaveURL(/\/th\/admin\/learners$/);

  // The app name in the header leads home.
  await page.getByRole('link', { name: 'พอร์ทัลฝึกอบรมธุรกิจ', exact: true }).click();
  await expect(page).toHaveURL(/\/th\/admin$/);
});
