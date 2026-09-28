import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompany, seedPassedExam } from './seed';

/**
 * The exam result from the design handoff (05): a gold band and a medallion when passed, the
 * blue band and a warn tag when not, the next step as the primary action, and the answers
 * reviewed in a solid list under "Your answers".
 */
test('a passed exam gets the gold band, the medallion and the way to the interview', async ({
  page,
}) => {
  const loginId = await seedLearnerWithCompany('บริษัท ผลสอบผ่าน จำกัด', '2026-07-13');
  await seedPassedExam(loginId);
  await loginAs(page, loginId, E2E_PASSWORD);
  await page.goto('/th/exam');
  await page.getByTestId('exam-attempt-1').getByRole('link').click();
  await expect(page).toHaveURL(/\/th\/exam\/[0-9a-f-]{36}\/result$/);

  await expect(page.locator('.band-gold')).toHaveCount(1);
  const badge = page.getByTestId('exam-result');
  await expect(badge).toHaveAttribute('data-result', 'pass');
  await expect(badge).toContainText('สอบผ่าน');
  await expect(badge.getByTestId('medallion')).toBeVisible();
  await expect(page.getByTestId('exam-score')).toHaveText('1 / 1');
  await expect(page.getByTestId('exam-next')).toHaveText(/ไปสัมภาษณ์ความพร้อม/);
  await expect(page.getByTestId('exam-next')).toHaveAttribute('href', '/th/interview');
  await expect(page.getByRole('link', { name: 'หน้าหลัก' })).toHaveAttribute(
    'href',
    '/th/dashboard',
  );
  await expect(page.getByTestId('answers-heading')).toHaveText('คำตอบของคุณ');
});

test('a failed exam keeps the blue band, shows the warn tag and offers a retake', async ({
  page,
}) => {
  const loginId = await seedLearnerWithCompany('บริษัท ผลสอบตก จำกัด', '2026-07-13');
  await seedPassedExam(loginId, 'fail');
  await loginAs(page, loginId, E2E_PASSWORD);
  await page.goto('/th/exam');
  await page.getByTestId('exam-attempt-1').getByRole('link').click();
  await expect(page).toHaveURL(/\/result$/);

  await expect(page.locator('.band-gold')).toHaveCount(0);
  const badge = page.getByTestId('exam-result');
  await expect(badge).toHaveAttribute('data-result', 'fail');
  await expect(badge).toContainText('ยังไม่ผ่าน');
  await expect(badge.getByTestId('medallion')).toHaveCount(0);
  await expect(page.getByTestId('exam-next')).toHaveText(/สอบอีกครั้ง/);
  await expect(page.getByTestId('exam-next')).toHaveAttribute('href', '/th/exam');
});

test('the result fits a phone', async ({ page }) => {
  const loginId = await seedLearnerWithCompany('บริษัท ผลสอบมือถือ จำกัด', '2026-07-13');
  await seedPassedExam(loginId);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, loginId, E2E_PASSWORD);
  await page.goto('/th/exam');
  await page.getByTestId('exam-attempt-1').getByRole('link').click();
  await expect(page.getByTestId('exam-result')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
