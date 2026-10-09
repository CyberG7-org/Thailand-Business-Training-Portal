import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { ensureStarterCards, seedLearnerWithCompany } from './seed';

/**
 * The mobile-first study list: progress first, five fixed stage tabs and compact lesson rows.
 * Opening a card counts under the default "viewed" tracking, so the next Continue action moves on.
 */
test('the study list shows progress, points at the next card, and moves on when a card is done', async ({
  page,
}) => {
  await ensureStarterCards();
  const loginId = await seedLearnerWithCompany('บริษัท รายการเรียน จำกัด', '2026-07-13');
  await loginAs(page, loginId, E2E_PASSWORD);
  await page.goto('/th/study');

  const rows = page.locator('[data-testid^="study-item-"]');
  const total = await rows.count();
  expect(total).toBeGreaterThan(1);
  await expect(page.getByTestId('study-summary')).toContainText(`0 จาก ${total}`);
  await expect(page.getByTestId('study-segments').locator('[data-state]')).toHaveCount(total);
  await expect(rows.first()).toHaveAttribute('data-current', 'true');
  await expect(
    page.getByTestId('learner-stage-tabs').locator('[data-testid^="learner-stage-tab-"]'),
  ).toHaveCount(5);
  await expect(page.getByTestId('learner-stage-tab-home')).toHaveAttribute('href', '/th/dashboard');
  await expect(page.getByTestId('learner-stage-tab-study')).toHaveAttribute('aria-current', 'page');
  await expect(rows.first()).toContainText(`1/${total}`);
  await expect(rows.first()).toHaveAttribute('data-current', 'true');
  await expect(rows.first()).toHaveAttribute('href', /\/th\/study\//);

  const recorded = page.waitForResponse(
    (response) => response.request().method() === 'POST' && /\/th\/study\//.test(response.url()),
  );
  await rows.first().click();
  await expect(page).toHaveURL(/\/th\/study\/[^/]+$/);
  expect((await recorded).ok()).toBe(true);
  await page.goto('/th/study');
  await expect(page.getByTestId('study-summary')).toContainText(`1 จาก ${total}`);
  await expect(page.getByTestId('study-segments').locator('[data-state="done"]')).toHaveCount(1);
  await expect(rows.nth(1)).toHaveAttribute('data-current', 'true');
  await expect(rows.first()).not.toHaveAttribute('data-current', 'true');
  await expect(rows.first()).not.toContainText('ทบทวน');
});

test('the study list fits a phone', async ({ page }) => {
  const loginId = await seedLearnerWithCompany('บริษัท รายการมือถือ จำกัด', '2026-07-13');
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, loginId, E2E_PASSWORD);
  await page.goto('/th/study');
  await expect(page.locator('[data-testid^="study-item-"][data-current="true"]')).toBeVisible();
  await expect(page.getByTestId('nav-back')).toHaveCount(0);
  await expect(page.getByTestId('learner-stage-tabs')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
