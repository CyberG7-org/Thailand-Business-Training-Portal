import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { fillBusinessAnswers, loginAs } from './helpers';
import { seedLearnerForRecord } from './seed';

test('AI questions cite the reference pack and learners see passages from their own documents', async ({
  page,
  request,
}) => {
  // 1. An indexed, confirmed reference record (upload-first → cron → confirm).
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/dbd-records/new');
  await page.getByTestId('upload-first-file').setInputFiles('tests/fixtures/three-pages.pdf');
  await page.getByTestId('upload-first-submit').click();
  await page.waitForURL(/\/th\/admin\/dbd-records\/([0-9a-f-]{36})/);
  const recordId = page.url().match(/dbd-records\/([0-9a-f-]{36})/)![1];
  const run = await request.get('/api/cron/index', {
    headers: { Authorization: 'Bearer local-cron-secret-for-dev' },
  });
  expect(run.status()).toBe(200);
  await page.reload();
  await expect(page.getByTestId('index-status').first()).toHaveAttribute('data-status', 'ready');
  await fillBusinessAnswers(page);
  await page.getByRole('button', { name: 'ยืนยันข้อมูล' }).click();
  await expect(page.getByTestId('record-status')).toHaveText('confirmed');

  // 2. Starter cards exist (idempotent).
  await page.goto('/th/admin/content');
  await page.getByTestId('load-starter-cards').click();
  await expect(page.getByTestId('starter-loaded')).toBeVisible();

  // 3. A batch modelled on that record cites its pages.
  await page.goto('/th/admin/questions/generate');
  await page.getByTestId('reference-record').selectOption(recordId);
  await page.locator('input[name="count"]').fill('2');
  await page.getByTestId('template-count').fill('1');
  await page.getByTestId('generate-submit').click();
  await page.waitForURL(/\/th\/admin\/questions\?batch=[0-9a-f-]{36}$/);
  const rows = page.locator('tr[data-testid^="question-ai-"]');
  await expect(rows).toHaveCount(2);
  await expect(rows.first().getByTestId('question-sources')).toContainText('หน้า');
  await page.getByRole('button', { name: 'ออกจากระบบ' }).click();

  // 4. A learner assigned to that record sees passages from it on the identity card.
  const learner = await seedLearnerForRecord(recordId);
  await loginAs(page, learner, E2E_PASSWORD);
  await page.goto('/th/study/bank-interview-1-identity');
  const evidence = page.getByTestId('study-evidence');
  await expect(evidence).toBeVisible();
  await expect(evidence).toContainText('หน้า 1');
  await expect(evidence).toContainText('บริษัท');
  // The tips card has no concept group: no panel, no error.
  await page.goto('/th/study/bank-interview-5-tips');
  await expect(page.getByTestId('study-body')).toBeVisible();
  await expect(page.getByTestId('study-evidence')).toHaveCount(0);
});
