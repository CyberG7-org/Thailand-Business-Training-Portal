import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompany } from './seed';

/**
 * The shared learner shell keeps the standard back pill and stage segments on learner pages.
 * The dashboard is home, while the mobile-first study overview intentionally replaces those
 * controls with its progress-first layout and four fixed stage tabs.
 */
test('learner pages use the shared shell while study uses its focused navigation', async ({
  page,
}) => {
  const loginId = await seedLearnerWithCompany('บริษัท เชลล์ร่วม จำกัด', '2026-07-13');
  await loginAs(page, loginId, E2E_PASSWORD);
  await expect(page).toHaveURL(/\/th\/dashboard$/);
  await expect(page.getByTestId('shell-header')).toBeVisible();
  await expect(page.getByTestId('nav-back')).toHaveCount(0);

  await page.goto('/th/study');
  await expect(page.getByTestId('nav-back')).toHaveCount(0);
  await expect(page.getByTestId('step-segments')).toHaveCount(0);
  await expect(
    page.getByTestId('learner-stage-tabs').locator('[data-testid^="learner-stage-tab-"]'),
  ).toHaveCount(4);
  await expect(page.getByTestId('learner-stage-tab-home')).toHaveAttribute('href', '/th/dashboard');
  await expect(page.getByTestId('learner-stage-tab-study')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('เอกสารเรียนรู้');

  // The steps beside the page (the owner, 2026-10-02): this page's step marked, an open step a
  // link, a locked one not; the dashboard lists the steps itself and has no column.
  const nav = page.getByTestId('learner-nav');
  await expect(nav.getByRole('link', { name: /เอกสารเรียนรู้/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByTestId('learner-nav-interview').getByRole('link')).toHaveCount(0);
  await nav.getByRole('link', { name: /นามบัตร/ }).click();
  await expect(page).toHaveURL(/\/th\/name-card$/);
  await expect(page.getByTestId('step-segments')).toContainText('ขั้นตอนที่ 2 จาก 5');
  await expect(page.getByTestId('step-segments').locator('[data-state]')).toHaveCount(5);
  await expect(page.getByTestId('nav-back')).toBeVisible();
  await page.getByTestId('learner-nav-home').click();
  await expect(page).toHaveURL(/\/th\/dashboard$/);
  await expect(page.getByTestId('learner-nav')).toHaveCount(0);

  await page.goto('/th/name-card');
  await page.getByTestId('nav-back').click();
  await expect(page).toHaveURL(/\/th\/dashboard$/);
  await page.goto('/th/study');
  await page.getByTestId('nav-home').click();
  await expect(page).toHaveURL(/\/th\/dashboard$/);
});

test('the shell fits a phone: no horizontal page scroll and a usable header', async ({ page }) => {
  const loginId = await seedLearnerWithCompany('บริษัท จอเล็ก จำกัด', '2026-07-13');
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, loginId, E2E_PASSWORD);
  await page.goto('/th/study');
  await expect(page.getByTestId('shell-header')).toBeVisible();
  await expect(page.getByTestId('nav-back')).toHaveCount(0);
  await expect(page.getByTestId('learner-stage-tabs')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
