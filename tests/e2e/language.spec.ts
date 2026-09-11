import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompany } from './seed';

test('switching language re-renders and persists; the next login lands on it', async ({ page }) => {
  const loginId = await seedLearnerWithCompany('บริษัท ภาษา จำกัด', '2026-07-13');
  await loginAs(page, loginId, E2E_PASSWORD);
  await expect(page).toHaveURL(/\/th\/dashboard$/);

  await page.getByTestId('language-switcher').selectOption('en');
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expect(page.getByRole('heading', { name: `Welcome, ${loginId}` })).toBeVisible();
  await expect(page.getByTestId('stage-bank-status')).toHaveText('Locked');

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/en\/login$/);

  // Log in from the Thai login page: the stored preference (en) wins.
  await loginAs(page, loginId, E2E_PASSWORD);
  await expect(page).toHaveURL(/\/en\/dashboard$/);

  await page.getByTestId('language-switcher').selectOption('zh');
  await expect(page).toHaveURL(/\/zh\/dashboard$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans');
});
