import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompany } from './seed';

/**
 * The shared learner shell (design handoff, "Shared shell"): every learner page sits under the
 * navy band with the glass header, a back pill and the five step segments; the dashboard is the
 * home and has no back pill. Segments mark the current step and only the steps actually done.
 */
test('a learner page shows the band with the step segments and a back pill; the dashboard does not', async ({
  page,
}) => {
  const loginId = await seedLearnerWithCompany('บริษัท เชลล์ร่วม จำกัด', '2026-07-13');
  await loginAs(page, loginId, E2E_PASSWORD);
  await expect(page).toHaveURL(/\/th\/dashboard$/);
  await expect(page.getByTestId('shell-header')).toBeVisible();
  await expect(page.getByTestId('nav-back')).toHaveCount(0);

  await page.goto('/th/study');
  await expect(page.getByTestId('step-segments')).toContainText('ขั้นตอนที่ 1 จาก 5');
  const segments = page.getByTestId('step-segments').locator('[data-state]');
  await expect(segments).toHaveCount(5);
  await expect(segments.nth(0)).toHaveAttribute('data-state', 'current');
  // Nothing is done yet, so no segment claims gold.
  await expect(page.getByTestId('step-segments').locator('[data-state="done"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('เอกสารเรียนรู้');

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
  await expect(page.getByTestId('nav-back')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
