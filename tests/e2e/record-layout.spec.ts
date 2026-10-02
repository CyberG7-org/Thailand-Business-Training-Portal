import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompleteCompany, setProvenance } from './seed';

/**
 * A company record (the owner, 2026-10-02): where it stands sits under the sidebar, so the tabs
 * and the Level 4 answers take the page's full width; the column belongs to this page alone.
 */
test('the status column sits under the sidebar and leaves with the record', async ({ page }) => {
  test.setTimeout(90_000);
  const learner = await seedLearnerWithCompleteCompany(`บริษัท คอลัมน์ข้าง ${Date.now()} จำกัด`);
  const recordId = await setProvenance(learner, { registered_capital: 0.6 });

  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto(`/th/admin/dbd-records/${recordId}?tab=interview`);
  await page.getByTestId('recheck-button').click();
  const side = page.locator('[data-staff-side]');
  await expect(side.getByTestId('acceptance-state')).toHaveAttribute('data-blockers', '1');
  await expect(side.getByTestId('coverage-panel')).toBeVisible();
  await expect(side.getByTestId('training-versions')).toBeVisible();

  // Under the sidebar, in its column; the answers fill the width beside it.
  const nav = (await page.getByTestId('staff-nav').boundingBox())!;
  const column = (await side.boundingBox())!;
  const answers = (await page.getByTestId('interview-answers').boundingBox())!;
  expect(Math.abs(column.x - nav.x)).toBeLessThan(2);
  expect(column.width).toBeLessThanOrEqual(nav.width + 1);
  expect(column.y).toBeGreaterThan(nav.y + nav.height);
  expect(answers.x).toBeGreaterThan(nav.x + nav.width);
  expect(answers.x + answers.width).toBeGreaterThan(page.viewportSize()!.width - 40);

  // A card in the column still opens a tab.
  await side.getByRole('button', { name: 'ดูข้อยกเว้น' }).click();
  await expect(page.getByTestId('record-tab-exceptions')).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/[?&]tab=exceptions/);
  await expect(page.getByTestId('exception-low_confidence-registered_capital')).toBeVisible();

  // Another page has nothing under the sidebar, and its sidebar stays pinned.
  await page.getByTestId('staff-nav').getByRole('link', { name: 'ข้อยกเว้น', exact: true }).click();
  await expect(page).toHaveURL(/\/th\/admin\/exceptions/);
  await expect(side).toHaveCount(0);
  await expect(page.getByTestId('staff-nav').locator('..')).toHaveCSS('position', 'sticky');
});
