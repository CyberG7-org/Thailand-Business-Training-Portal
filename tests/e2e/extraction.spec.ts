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

  // Level 2 arrived in the business profile, Level 3 classified the document and kept provenance.
  await expect(page.locator('input[name="province"]')).toHaveValue('ตัวอย่าง');
  const business = page.getByTestId('business-profile');
  await expect(business.locator('textarea[name="objectives_text"]')).toHaveValue(
    /^1\. ประกอบกิจการค้าปลีก/,
  );
  await expect(business.locator('textarea[name="shareholders_text"]')).toHaveValue(
    /นางสาวตัวอย่าง ทดสอบ \| ไทย \| 19998/,
  );
  await expect(business.locator('input[name="total_shares"]')).toHaveValue('20000');
  await expect(page.getByTestId('provenance-shareholders')).toContainText('90%');
  await expect(page.getByTestId('document-list').getByTestId('document-type')).toHaveText(
    'หนังสือรับรอง',
  );
  await expect(page.getByTestId('suggestion-juristic_id')).toContainText('หน้า 1');

  // Level 2 is editable like everything else.
  await business.locator('textarea[name="promoters_text"]').fill('นายแก้ไข ทดสอบ | ไทย');
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'บันทึกแล้ว' })).toBeVisible();
  await expect(business.locator('textarea[name="promoters_text"]')).toHaveValue(
    'นายแก้ไข ทดสอบ | ไทย',
  );

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
