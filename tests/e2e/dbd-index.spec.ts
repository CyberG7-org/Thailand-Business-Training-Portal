import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';

test('an uploaded pack is indexed by the cron in slices and the admin can ask it questions with page citations', async ({
  page,
  request,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/dbd-records/new');
  await page.getByTestId('upload-first-file').setInputFiles('tests/fixtures/three-pages.pdf');
  await page.getByTestId('upload-first-submit').click();
  await page.waitForURL(/\/th\/admin\/dbd-records\/[0-9a-f-]{36}/);

  const status = page.getByTestId('index-status').first();
  await expect(status).toHaveAttribute('data-status', 'queued');

  // Asking before the index is ready is refused, not answered from thin air.
  await page.getByTestId('ask-question').fill('ทุนจดทะเบียน');
  await page.getByTestId('ask-submit').click();
  await expect(page.getByRole('alert').filter({ hasText: 'ยังไม่มีดัชนี' })).toBeVisible();

  // The cron rejects unauthenticated calls and reads the whole document with the secret.
  expect((await request.get('/api/cron/index')).status()).toBe(401);
  const run = await request.get('/api/cron/index', {
    headers: { Authorization: 'Bearer local-cron-secret-for-dev' },
  });
  expect(run.status()).toBe(200);
  const summary = await run.json();
  expect(summary.completed).toBeGreaterThanOrEqual(1); // other specs may have queued jobs too

  await page.reload();
  await expect(status).toHaveAttribute('data-status', 'ready');
  await expect(status).toContainText('3');

  await page.getByTestId('ask-question').fill('ทุนจดทะเบียน');
  await page.getByTestId('ask-submit').click();
  await expect(page.getByTestId('ask-answer')).toContainText('2,000,000');
  await expect(page.getByTestId('ask-answer')).toContainText('หน้า 1');
  await expect(page.getByTestId('ask-passages').locator('li').first()).toContainText('หน้า 1');

  // Re-index queues the document again from page 1.
  await page.getByTestId('reindex-button').first().click();
  await expect(page.getByTestId('index-status').first()).toHaveAttribute('data-status', 'queued');
});
