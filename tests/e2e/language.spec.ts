import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompany } from './seed';

test('switching language re-renders and persists; the next login lands on it', async ({ page }) => {
  const loginId = await seedLearnerWithCompany('บริษัท ภาษา จำกัด', '2026-07-13');
  await loginAs(page, loginId, E2E_PASSWORD);
  await expect(page).toHaveURL(/\/th\/dashboard$/);

  await page.getByTestId('language-menu-button').click();
  await expect(page.getByTestId('lang-ms')).toBeVisible();
  await expect(page.getByTestId('lang-ta')).toBeVisible();
  await expect(page.getByTestId('lang-th')).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('lang-en').click();
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expect(page.getByRole('heading', { name: `Welcome, ${loginId}` })).toBeVisible();
  await expect(page.getByTestId('stage-interview-status')).toHaveText('Locked');

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/en\/login$/);

  // Log in from the Thai login page: the stored preference (en) wins.
  await loginAs(page, loginId, E2E_PASSWORD);
  await expect(page).toHaveURL(/\/en\/dashboard$/);

  await page.getByTestId('language-menu-button').click();
  await page.getByTestId('lang-zh').click();
  await expect(page).toHaveURL(/\/zh\/dashboard$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans');
  await page.getByTestId('language-menu-button').click();
  await expect(page.getByTestId('lang-zh')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('lang-zh')).toHaveCount(0);

  // A language chosen on the login page itself beats the stored preference and is persisted.
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page).toHaveURL(/\/zh\/login$/);
  await page.getByTestId('language-menu-button').click();
  await page.getByTestId('lang-en').click();
  await expect(page).toHaveURL(/\/en\/login$/);
  await page.locator('input[name="loginId"]').fill(loginId);
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await loginAs(page, loginId, E2E_PASSWORD);
  await expect(page).toHaveURL(/\/en\/dashboard$/);

  for (const language of ['ms', 'ta'] as const) {
    await page.getByTestId('language-menu-button').click();
    await page.getByTestId(`lang-${language}`).click();
    await expect(page).toHaveURL(new RegExp(`/${language}/dashboard$`));
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      language === 'ms' ? 'Selamat datang' : 'வரவேற்கிறோம்',
    );
    await page.getByTestId('language-menu-button').click();
    await expect(page.getByTestId(`lang-${language}`)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Escape');
  }
});
