import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { fillBusinessAnswers, loginAs } from './helpers';
import { ensureStarterCards, seedLearnerForRecord } from './seed';

test('learners see passages from their own documents', async ({ page, request }) => {
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
  await expect(page.getByTestId('record-status')).toHaveText('confirmed');

  // 2. Starter cards exist (idempotent; D81 — no staff screen for them).
  await ensureStarterCards();

  await page.getByRole('button', { name: 'ออกจากระบบ' }).click();

  // 3. A learner assigned to that record sees passages from it on the identity card.
  const learner = await seedLearnerForRecord(recordId);
  await loginAs(page, learner, E2E_PASSWORD);
  await page.goto('/th/study/bank-interview-1-identity');
  const evidence = page.getByTestId('study-evidence');
  await expect(evidence).toBeVisible();
  await expect(evidence).toContainText('หน้า 1');
  await expect(evidence).toContainText('บริษัท');
  // Below the card, not beside it (the owner, 2026-10-02).
  const card = (await page.getByTestId('study-body').boundingBox())!;
  expect((await evidence.boundingBox())!.y).toBeGreaterThan(card.y + card.height);
  // The tips card has no concept group: no panel, no error.
  await page.goto('/th/study/bank-interview-5-tips');
  await expect(page.getByTestId('study-body')).toBeVisible();
  await expect(page.getByTestId('study-evidence')).toHaveCount(0);
});
