import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompany, seedPassedExam } from './seed';

/**
 * The dashboard from the design handoff (Dashboard v4): the hero with the company pill, the
 * next step and its CTA, the progress ring, the six-step stepper, the "Your steps" list and the
 * company card. What it says must follow the learner's real progress.
 */
test('a new learner sees the company, the first step current, and the interview locked', async ({
  page,
}) => {
  const loginId = await seedLearnerWithCompany('บริษัท แดชบอร์ดใหม่ จำกัด', '2026-07-13');
  await loginAs(page, loginId, E2E_PASSWORD);
  await expect(page.getByTestId('hero-kicker')).toContainText('บริษัท แดชบอร์ดใหม่ จำกัด');
  await expect(page.getByRole('img', { name: 'เสร็จแล้ว 0 จาก 6 ขั้นตอน' })).toBeVisible();

  const stepper = page.getByTestId('stepper');
  await expect(stepper.getByRole('listitem')).toHaveCount(6);
  await expect(stepper.locator('[aria-current="step"]')).toHaveText(/เอกสารเรียนรู้/);

  await expect(page.getByRole('link', { name: 'ไปที่เอกสารเรียนรู้' })).toHaveAttribute(
    'href',
    '/th/study',
  );
  await expect(page.getByRole('link', { name: 'ดูผลล่าสุด' })).toHaveCount(0);
  await expect(page.getByTestId('stage-interview')).toHaveAttribute('data-locked', 'true');
  await expect(page.getByTestId('stage-appointment')).toHaveAttribute('data-locked', 'true');
  await expect(page.getByTestId('stage-study').getByRole('link', { name: 'เปิด' })).toHaveAttribute(
    'href',
    '/th/study',
  );
});

test('after a passed exam the next step moves on and the last result is one click away', async ({
  page,
}) => {
  const loginId = await seedLearnerWithCompany('บริษัท สอบผ่านแล้ว จำกัด', '2026-07-13');
  await seedPassedExam(loginId);
  await loginAs(page, loginId, E2E_PASSWORD);
  await expect(page.getByTestId('stepper').locator('[aria-current="step"]')).toHaveText(/นามบัตร/);
  await expect(page.getByTestId('exam-score')).toHaveText('1 / 1');
  await expect(page.getByRole('link', { name: 'ดูผลล่าสุด' })).toHaveAttribute(
    'href',
    /\/th\/exam\/[0-9a-f-]{36}\/result$/,
  );
  await expect(page.getByRole('img', { name: 'เสร็จแล้ว 1 จาก 6 ขั้นตอน' })).toBeVisible();
});

test('the dashboard fits a phone with short step labels', async ({ page }) => {
  const loginId = await seedLearnerWithCompany('บริษัท มือถือ จำกัด', '2026-07-13');
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, loginId, E2E_PASSWORD);
  await expect(page.getByTestId('stepper')).toContainText('ศึกษา');
  await expect(page.getByRole('link', { name: 'ไปที่เอกสารเรียนรู้' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
