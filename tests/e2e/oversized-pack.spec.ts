import { expect, test } from '@playwright/test';
import { companyZip } from './company-zip';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';

test('a 25-page pack is deferred on upload and fills itself from the transcripts once indexed', async ({
  page,
  request,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/dbd-records/new');
  await page
    .getByTestId('upload-first-file')
    .setInputFiles(companyZip('tests/fixtures/twenty-five-pages.pdf'));
  await page.getByTestId('upload-first-submit').click();
  await page.waitForURL(/\/th\/admin\/dbd-records\/[0-9a-f-]{36}\?extraction=queued/);
  await expect(page.getByTestId('reading-status')).toContainText('เบื้องหลัง');
  await expect(page.locator('input[name="juristic_id"]')).toHaveValue('');
  await expect(page.getByTestId('index-status').first()).toHaveAttribute('data-status', 'queued');

  // Five slices; the cron reads them all in one run, then the direct-read job finds the pack
  // too big and defers to the transcript job the last slice queued, which fills the record.
  const run = await request.get('/api/cron/index', {
    headers: { Authorization: 'Bearer local-cron-secret-for-dev' },
  });
  expect(run.status()).toBe(200);
  expect((await run.json()).completed).toBeGreaterThanOrEqual(1);

  await page.reload();
  await expect(page.getByTestId('index-status').first()).toHaveAttribute('data-status', 'ready');
  await expect(page.getByTestId('document-list').getByTestId('document-type')).toHaveText(
    'หนังสือรับรอง',
  );
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('บริษัท ตัวอย่างการสกัด จำกัด');
  await expect(page.locator('input[name="juristic_id"]')).toHaveValue('0105569000134');
  // The removed objectives panel stays absent, and an unreadable placeholder page does not
  // silently confirm the company.
  await expect(page.locator('textarea[name="objectives_text"]')).toHaveCount(0);
  await expect(page.getByTestId('record-status')).not.toHaveText('confirmed');
});
