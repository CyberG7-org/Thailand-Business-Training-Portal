import { expect, test } from '@playwright/test';
import { companyZip } from './company-zip';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs, openRecordTab } from './helpers';
import { seedCompanyRecord } from './seed';

const CRON = { headers: { Authorization: 'Bearer local-cron-secret-for-dev' } };

// The dev server runs without ANTHROPIC_API_KEY, so the fake extractor answers.
test('uploading a ZIP extracts certificate facts without inventing business nature', async ({
  page,
  request,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/dbd-records/new');
  await page.getByTestId('upload-first-file').setInputFiles(companyZip());
  await page.getByTestId('upload-first-submit').click();
  await page.waitForURL(/\/th\/admin\/dbd-records\/[0-9a-f-]{36}\?extraction=queued/);

  // The reading is a job the cron runs (D46): the page says so until the fields arrive.
  await expect(page.getByTestId('reading-status')).toContainText('เบื้องหลัง');
  await expect(page.locator('input[name="juristic_id"]')).toHaveValue('');
  const run = await request.get('/api/cron/index', CRON);
  expect((await run.json()).extractions).toBeGreaterThanOrEqual(1);
  await page.reload();
  await expect(page.getByTestId('reading-status')).toHaveCount(0);

  // The certificate facts arrive; a placeholder Facebook URL is not business evidence.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('บริษัท ตัวอย่างการสกัด จำกัด');
  await expect(page.locator('input[name="juristic_id"]')).toHaveValue('0105569000134');
  await expect(page.locator('input[name="issued_on"]')).toHaveValue('13 กรกฎาคม 2569');
  await expect(page.getByTestId('record-status')).not.toHaveText('confirmed');

  // Level 2 arrived in the business profile and Level 3 classified the document.
  await expect(page.locator('input[name="province"]')).toHaveValue('ร้อยเอ็ด');
  await expect(page.locator('textarea[name="objectives_text"]')).toHaveCount(0);
  await expect(page.getByTestId('document-list').getByTestId('document-type')).toHaveText(
    'หนังสือรับรอง',
  );
});

test('uploading on an existing record fills only the empty fields', async ({ page, request }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const id = await seedCompanyRecord({
    companyNameTh: 'บริษัท ชื่อที่พิมพ์เอง จำกัด',
    confirmed: false,
  });
  await page.goto(`/th/admin/dbd-records/${id}`);

  await openRecordTab(page, 'documents');
  await expect(page.getByTestId('extract-button')).toBeDisabled();
  await page.locator('input[name="document"]').setInputFiles(companyZip());
  await page.getByRole('button', { name: 'อัปโหลดและกรอกอัตโนมัติ' }).click();
  await expect(page.getByTestId('extract-status')).toContainText('เบื้องหลัง');
  await request.get('/api/cron/index', CRON);
  await page.reload();
  await expect(page.locator('input[name="company_name_th"]')).toHaveValue(
    'บริษัท ชื่อที่พิมพ์เอง จำกัด',
  );
  await expect(page.locator('input[name="juristic_id"]')).toHaveValue('0105569000134');
  await expect(page.getByTestId('record-status')).toHaveText('confirmed');
});
