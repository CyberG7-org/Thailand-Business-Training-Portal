import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';

test('a 25-page pack is deferred on upload and fills itself from the transcripts once indexed', async ({
  page,
  request,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/dbd-records/new');
  await page.getByTestId('upload-first-file').setInputFiles('tests/fixtures/twenty-five-pages.pdf');
  await page.getByTestId('upload-first-submit').click();
  await page.waitForURL(/\/th\/admin\/dbd-records\/[0-9a-f-]{36}\?extraction=deferred/);
  await expect(page.getByTestId('autofill-banner')).toContainText('เบื้องหลัง');
  await expect(page.locator('input[name="juristic_id"]')).toHaveValue('');
  await expect(page.getByTestId('index-status').first()).toHaveAttribute('data-status', 'queued');

  // Five slices; the cron reads them all in one run and the transcript path fills the record.
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
  await expect(page.locator('input[name="juristic_id"]')).toHaveValue('0105569000123');
  // One 25-page document is one type (a certificate here): its sweep yields the objectives.
  await expect(
    page.getByTestId('business-profile').locator('textarea[name="objectives_text"]'),
  ).toHaveValue(/^1\. ประกอบกิจการค้าปลีก/);
  await expect(page.getByTestId('record-status')).toHaveText('extracted');
});
