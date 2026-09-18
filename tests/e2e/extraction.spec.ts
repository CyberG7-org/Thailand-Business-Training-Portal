import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs, openManualRecordForm } from './helpers';

// The dev server runs without ANTHROPIC_API_KEY, so the fake extractor answers.
test('uploading a certificate creates the record and fills its fields automatically; admin reviews and confirms', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/dbd-records/new');
  await page.getByTestId('upload-first-file').setInputFiles('tests/fixtures/tiny.pdf');
  await page.getByTestId('upload-first-submit').click();
  await page.waitForURL(/\/th\/admin\/dbd-records\/[0-9a-f-]{36}\?extraction=filled/);

  // The record already carries the values read from the document, with their provenance.
  await expect(page.getByTestId('autofill-banner')).toContainText('ช่อง');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('บริษัท ตัวอย่างการสกัด จำกัด');
  await expect(page.locator('input[name="juristic_id"]')).toHaveValue('0105569000123');
  await expect(page.locator('input[name="issued_on"]')).toHaveValue('2026-07-13');
  await expect(page.getByTestId('suggestion-issued_on')).toContainText('13/07/2569');
  await expect(page.getByTestId('suggestion-head_office_address')).toContainText('ความมั่นใจต่ำ');
  await expect(page.getByTestId('record-status')).toHaveText('extracted');

  // Confirm works straight away — no separate Save needed.
  await page.getByRole('button', { name: 'ยืนยันข้อมูล' }).click();
  await expect(page.getByTestId('record-status')).toHaveText('confirmed');
  await expect(page.locator('input[name="juristic_id"]')).toHaveAttribute('readonly', '');
});

test('uploading on an existing record fills only the empty fields', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await openManualRecordForm(page);
  await page.locator('input[name="company_name_th"]').fill('บริษัท ชื่อที่พิมพ์เอง จำกัด');
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await page.waitForURL(/\/th\/admin\/dbd-records\/[0-9a-f-]{36}$/);

  await expect(page.getByTestId('extract-button')).toBeDisabled();
  await page.locator('input[name="document"]').setInputFiles('tests/fixtures/tiny.pdf');
  await page.getByRole('button', { name: 'อัปโหลดและกรอกอัตโนมัติ' }).click();
  await expect(page.getByTestId('extract-status')).toContainText('ช่อง');
  await expect(page.locator('input[name="company_name_th"]')).toHaveValue(
    'บริษัท ชื่อที่พิมพ์เอง จำกัด',
  );
  await expect(page.locator('input[name="juristic_id"]')).toHaveValue('0105569000123');
  await expect(page.getByTestId('extract-button')).toBeEnabled();
});
