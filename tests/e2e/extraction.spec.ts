import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';

// The dev server runs without ANTHROPIC_API_KEY, so the fake extractor answers.
test('admin extracts a certificate, reviews suggestions, saves and confirms', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/dbd-records/new');
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await page.waitForURL(/\/th\/admin\/dbd-records\/[0-9a-f-]{36}$/);

  await expect(page.getByTestId('extract-button')).toBeDisabled();
  await page.locator('input[name="document"]').setInputFiles('tests/fixtures/tiny.pdf');
  await page.getByRole('button', { name: 'อัปโหลด PDF' }).click();
  await expect(page.getByRole('status')).toContainText('อัปโหลดแล้ว');

  await page.getByTestId('extract-button').click();
  await expect(page.getByTestId('extract-status')).toBeVisible();

  // Suggestions pre-fill empty fields; low confidence is flagged; BE date is shown as CE.
  await expect(page.locator('input[name="juristic_id"]')).toHaveValue('0105569000123');
  await expect(page.locator('input[name="issued_on"]')).toHaveValue('2026-07-13');
  await expect(page.getByTestId('suggestion-issued_on')).toContainText('13/07/2569');
  await expect(page.getByTestId('suggestion-head_office_address')).toContainText('ความมั่นใจต่ำ');
  await expect(page.getByTestId('record-status')).toHaveText('extracted');

  // Nothing is stored until Save: the heading still shows the untitled placeholder.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('(ยังไม่มีชื่อบริษัท)');

  await page.getByRole('button', { name: 'บันทึก' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('บริษัท ตัวอย่างการสกัด จำกัด');
  await page.getByRole('button', { name: 'ยืนยันข้อมูล' }).click();
  await expect(page.getByTestId('record-status')).toHaveText('confirmed');
});
