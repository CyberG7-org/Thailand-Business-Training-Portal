import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedApprovedBank, seedLearnerWithCompany, seedQuizReadyLearner } from './seed';

/**
 * Quiz and exam questions from the design handoff (03, 04): each card carries "Question n of N"
 * with a bar in the quiz or exam tone, options at least 56px tall, the quiz's feedback box as a
 * status, and the Business Knowledge Quiz's meta chip with the same marking after each answer
 * (D100).
 */
test('quiz cards carry the progress bar, tall options and the feedback box', async ({ page }) => {
  const loginId = await seedLearnerWithCompany('บริษัท แบบทดสอบใหม่ จำกัด', '2026-07-13');
  await loginAs(page, loginId, E2E_PASSWORD);
  await page.goto('/th/quiz');
  await page.getByTestId('start-quiz').click();
  await page.waitForURL(/\/th\/quiz\/[0-9a-f-]{36}$/);

  const total = await page.locator('[data-testid^="question-card-"]').count();
  const first = page.getByTestId('question-card-0');
  await expect(first.getByTestId('question-bar')).toHaveAttribute('data-tone', 'quiz');
  await expect(first).toContainText(`ข้อ 1 จาก ${total}`);
  const option = first.locator('[data-testid^="option-"]').first();
  const box = await option.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(56);

  await option.click();
  await expect(first.getByTestId('feedback')).toHaveAttribute('role', 'status');
  await expect(first.locator('[data-state="correct"] svg')).toHaveCount(1);
});

test('the Business Knowledge Quiz shows the meta chip and marks an answer like the practice round', async ({
  page,
}) => {
  await seedApprovedBank();
  const loginId = await seedQuizReadyLearner(`บริษัท สอบใหม่ ${Date.now()} จำกัด`);
  await loginAs(page, loginId, E2E_PASSWORD);
  await page.goto('/th/exam');
  await page.getByTestId('start-exam').click();
  await page.waitForURL(/\/th\/exam\/[0-9a-f-]{36}$/);

  const meta = page.getByTestId('exam-meta');
  await expect(meta).toContainText('เกณฑ์ผ่าน');
  await expect(meta).toContainText('27 / 30');
  await expect(meta).toContainText('ครั้งที่');

  const first = page.getByTestId('question-card-0');
  const option = first.getByTestId('option-A');
  expect((await option.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(56);
  // Nothing is marked before an answer; one answer marks its own question and no other.
  await expect(page.locator('[data-state="correct"]')).toHaveCount(0);
  await option.click();
  await expect(first.getByTestId('feedback')).toHaveAttribute('role', 'status');
  await expect(first.getByTestId('saved')).toHaveCount(0);
  await expect(page.locator('[data-state="correct"]')).toHaveCount(1);
  await expect(first.locator('[data-state="correct"] svg')).toHaveCount(1);
});

test('the quiz fits a phone with the progress panel in reach', async ({ page }) => {
  const loginId = await seedLearnerWithCompany('บริษัท ทดสอบมือถือ จำกัด', '2026-07-13');
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, loginId, E2E_PASSWORD);
  await page.goto('/th/quiz');
  await page.getByTestId('start-quiz').click();
  await page.waitForURL(/\/th\/quiz\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('attempt-progress')).toBeVisible();
  await expect(page.getByTestId('submit-quiz')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
