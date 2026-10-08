import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedDetailedInterviewResult, seedLearnerWithCompleteCompany } from './seed';

test('the staff readiness result summarizes the outcome and lists all answer cards', async ({
  page,
}, testInfo) => {
  const company = `บริษัท ผลสัมภาษณ์ ${Date.now()} จำกัด`;
  const learner = await seedLearnerWithCompleteCompany(company);
  const sessionId = await seedDetailedInterviewResult(learner);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto(`/en/admin/interviews/${sessionId}`);

  await expect(page.getByRole('heading', { level: 1, name: 'Interview summary' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Overall result' })).toHaveText('75%');
  await expect(page.getByTestId('admin-verdict')).toHaveAttribute('data-verdict', 'ready');
  await expect(page.getByTestId('admin-assessments')).toContainText(company);
  await expect(page.getByTestId('admin-assessments')).toContainText(learner.toUpperCase());

  await expect(page.getByTestId('interview-result-question')).toHaveCount(4);
  await expect(page.getByTestId('admin-transcript').locator('li')).toHaveCount(8);
  await expect(page.getByText('Expected answer: 500,000 บาทต่อเดือน')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next questions' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Previous questions' })).toHaveCount(0);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await page.screenshot({
    path: testInfo.outputPath('interview-result-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('interview-result-question')).toHaveCount(4);
  await page.screenshot({
    path: testInfo.outputPath('interview-result-mobile.png'),
    fullPage: true,
  });
});
