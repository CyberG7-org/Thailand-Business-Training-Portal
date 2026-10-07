import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './fixtures';
import { loginAs, switchTo } from './helpers';
import { seedManager, seedTeamLearner } from './seed';

async function selectLearner(page: import('@playwright/test').Page, loginId: string) {
  const option = page
    .locator('[data-testid="appointment-learner"] option')
    .filter({ hasText: loginId });
  await page.getByTestId('appointment-learner').selectOption((await option.getAttribute('value'))!);
}

test('the owning manager books and replaces a ready learner date; the learner only reads it', async ({
  page,
}) => {
  const manager = await seedManager('ผู้จัดการเลือกวัน');
  const learner = await seedTeamLearner(manager.id, 'บริษัท เลือกวัน จำกัด', '2026-01-05');

  await loginAs(page, learner, E2E_PASSWORD);
  await page.goto('/th/appointment');
  await expect(page.getByTestId('appointment-waiting-manager')).toBeVisible();
  await expect(page.getByTestId('appointment-waiting-manager').locator('button')).toHaveCount(0);

  await switchTo(page, manager.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/appointments');
  await selectLearner(page, learner);
  await page.getByRole('button', { name: 'แสดงปฏิทิน' }).click();
  await page.getByTestId('month-next').click();
  const first = page.locator('[data-testid^="appointment-date-"]:not([disabled])').nth(5);
  const firstTestId = await first.getAttribute('data-testid');
  await first.click();
  await expect(page.getByTestId('appointment-saved')).toBeVisible();
  await expect(page.locator('[data-testid^="admin-appointment-"]').first()).toContainText(
    'บริษัท เลือกวัน จำกัด',
  );

  const second = page.locator('[data-testid^="appointment-date-"]:not([disabled])').nth(9);
  const secondTestId = await second.getAttribute('data-testid');
  expect(secondTestId).not.toBe(firstTestId);
  await second.click();
  await expect(page.getByTestId(secondTestId!)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-testid^="admin-appointment-"]')).toHaveCount(1);

  await switchTo(page, learner, E2E_PASSWORD);
  await page.goto('/th/appointment');
  await expect(page.getByTestId('booking-card')).toBeVisible();
  await expect(page.getByTestId('booking-card')).toContainText('ผู้จัดการเลือกวัน');
  await expect(page.getByTestId('cancel-booking')).toHaveCount(0);
});

test('the manager month calendar is a 42-cell month view and fits a phone', async ({ page }) => {
  const manager = await seedManager('ผู้จัดการปฏิทินมือถือ');
  const learner = await seedTeamLearner(manager.id, 'บริษัท ปฏิทินมือถือ จำกัด', '2026-01-05');
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, manager.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/appointments');
  await selectLearner(page, learner);
  await page.getByRole('button', { name: 'แสดงปฏิทิน' }).click();
  await expect(page.getByTestId('appointment-month')).toBeVisible();
  await expect(page.locator('[data-calendar-cell]')).toHaveCount(42);
  await page.getByTestId('month-next').click();
  await expect(page).toHaveURL(/month=\d{4}-\d{2}/);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
