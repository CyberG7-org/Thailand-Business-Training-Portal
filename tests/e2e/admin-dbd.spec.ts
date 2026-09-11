import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { createConfirmedRecord, loginAs } from './helpers';

test('admin creates a record with a BE date, sees it stored as CE, and confirms it', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await createConfirmedRecord(page, {
    companyNameTh: 'บริษัท อีทูอี จำกัด',
    juristicId: '0105568233704',
    issuedOn: '13/07/2569',
  });
  await expect(page.locator('input[name="issued_on"]')).toHaveValue('2026-07-13');
});

test('confirmation is blocked while the juristic id is missing', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/dbd-records/new');
  await page.locator('input[name="company_name_th"]').fill('บริษัท ไม่ครบ จำกัด');
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await page.waitForURL(/\/th\/admin\/dbd-records\/[0-9a-f-]{36}$/);
  await page.getByRole('button', { name: 'ยืนยันข้อมูล' }).click();
  await expect(page.getByTestId('confirm-error')).toContainText('juristic_id');
  await expect(page.getByTestId('record-status')).toHaveText('none');
});
