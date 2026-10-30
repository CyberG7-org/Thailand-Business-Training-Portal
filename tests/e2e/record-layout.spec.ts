import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompleteCompany, setProvenance } from './seed';

/**
 * A company record (the owner, 2026-10-02): where it stands sits in the content area beside the
 * answers; the column belongs to this page alone while the application sidebar remains full-height.
 */
test('the status column sits beside the record and leaves with it', async ({ page }) => {
  test.setTimeout(90_000);
  const learner = await seedLearnerWithCompleteCompany(`บริษัท คอลัมน์ข้าง ${Date.now()} จำกัด`, {
    category: true,
  });
  const recordId = await setProvenance(learner, { registered_capital: 0.6 });

  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto(`/th/admin/dbd-records/${recordId}?tab=interview`);
  await page.getByTestId('recheck-button').click();
  const side = page.locator('[data-staff-side]');
  await expect(side.getByTestId('acceptance-state')).toHaveAttribute('data-blockers', '1');
  await expect(side.getByTestId('coverage-panel')).toBeVisible();
  await expect(side.getByTestId('training-versions')).toBeVisible();

  // The application sidebar owns the viewport edge; the record column and answers share main.
  const sidebar = (await page.getByTestId('staff-sidebar').boundingBox())!;
  const column = (await side.boundingBox())!;
  const answers = (await page.getByTestId('interview-answers').boundingBox())!;
  expect(sidebar.x).toBe(0);
  expect(sidebar.y).toBe(0);
  expect(sidebar.height).toBe(page.viewportSize()!.height);
  expect(column.x).toBeGreaterThanOrEqual(sidebar.x + sidebar.width);
  expect(column.width).toBeLessThanOrEqual(236);
  expect(answers.x).toBeGreaterThanOrEqual(column.x + column.width);
  expect(answers.x + answers.width).toBeGreaterThan(page.viewportSize()!.width - 40);

  // A card in the column still opens a tab.
  await side.getByRole('button', { name: 'ดูข้อยกเว้น' }).click();
  await expect(page.getByTestId('record-tab-exceptions')).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/[?&]tab=exceptions/);
  await expect(page.getByTestId('exception-low_confidence-registered_capital')).toBeVisible();

  // Another page has no record-only column; the application sidebar remains full-height.
  await page
    .getByTestId('staff-nav')
    .getByRole('link', { name: 'ข้อผิดพลาด', exact: true })
    .click();
  await expect(page).toHaveURL(/\/th\/admin\/exceptions/);
  await expect(side).toHaveCount(0);
  expect((await page.getByTestId('staff-sidebar').boundingBox())!.height).toBe(
    page.viewportSize()!.height,
  );
});
