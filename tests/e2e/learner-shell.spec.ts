import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompany } from './seed';

/**
 * The primary learner pages use the dashboard glass header on desktop, keep the compact header
 * on phones, and share the four-destination navigation. Home replaces the old Back control.
 */
test('primary learner pages share the focused navigation on desktop', async ({ page }) => {
  const loginId = await seedLearnerWithCompany('บริษัท เชลล์ร่วม จำกัด', '2026-07-13');
  await loginAs(page, loginId, E2E_PASSWORD);
  await expect(page).toHaveURL(/\/th\/dashboard$/);
  await expect(page.getByTestId('shell-header')).toBeVisible();
  await expect(page.getByTestId('nav-back')).toHaveCount(0);

  await page.goto('/th/study');
  await expect(page.getByTestId('shell-header')).toHaveClass(/glass/);
  await expect(page.getByTestId('nav-back')).toHaveCount(0);
  await expect(page.getByTestId('step-segments')).toHaveCount(0);
  await expect(
    page.getByTestId('learner-stage-tabs').locator('[data-testid^="learner-stage-tab-"]'),
  ).toHaveCount(4);
  await expect(page.getByTestId('learner-stage-tab-home')).toHaveAttribute('href', '/th/dashboard');
  await expect(page.getByTestId('learner-stage-tab-study')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('เอกสารเรียนรู้');

  await expect(page.getByTestId('learner-nav')).toHaveCount(0);
  await page.getByTestId('learner-stage-tab-nameCard').click();
  await expect(page).toHaveURL(/\/th\/name-card$/);
  await expect(page.getByTestId('step-segments')).toContainText('ขั้นตอนที่ 2 จาก 5');
  await expect(page.getByTestId('step-segments').locator('[data-state]')).toHaveCount(5);
  await expect(page.getByTestId('nav-back')).toHaveCount(0);
  await expect(page.getByTestId('shell-header')).toHaveAttribute('data-variant', 'study');
  await expect(page.getByTestId('learner-stage-tabs')).toBeVisible();
  await expect(page.getByTestId('learner-nav')).toHaveCount(0);
  await page.getByTestId('learner-stage-tab-home').click();
  await expect(page).toHaveURL(/\/th\/dashboard$/);
  await expect(page.getByTestId('learner-nav')).toHaveCount(0);

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
  await expect(page.getByTestId('learner-stage-tab-home')).toBeVisible();
  await expect(page.getByTestId('learner-stage-tab-study')).toHaveCount(0);

  for (const [route, current] of [
    ['/th/exam', 'exam'],
    ['/th/interview', 'interview'],
    ['/th/name-card', 'nameCard'],
  ] as const) {
    await page.goto(route);
    const tabs = page.getByTestId('learner-stage-tabs');
    await expect(page.getByTestId('shell-header')).toHaveAttribute('data-variant', 'study');
    await expect(page.getByTestId('nav-back')).toHaveCount(0);
    await expect(tabs).toBeVisible();
    await expect(tabs.locator('[data-testid^="learner-stage-tab-"]')).toHaveCount(4);
    await expect(tabs.locator('[data-testid^="learner-stage-tab-"]').first()).toHaveAttribute(
      'data-testid',
      'learner-stage-tab-home',
    );
    await expect(page.getByTestId(`learner-stage-tab-${current}`)).toHaveCount(0);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
