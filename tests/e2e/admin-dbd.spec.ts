import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { createConfirmedRecord, loginAs } from './helpers';

test('admin creates a record with a BE date, sees it as printed, and confirms it', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await createConfirmedRecord(page, {
    companyNameTh: 'บริษัท อีทูอี จำกัด',
    juristicId: '0105568233704',
    issuedOn: '13/07/2569',
  });
  await expect(page.locator('input[name="issued_on"]')).toHaveValue('13 กรกฎาคม 2569');
});

test('DBD creation requires a ZIP pack and offers no manual entry', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/dbd-records/new');
  await expect(page.getByTestId('upload-first-file')).toHaveAttribute('accept', /\.zip/);
  await expect(page.getByTestId('manual-form-toggle')).toHaveCount(0);
  await expect(page.locator('input[name="company_name_th"]')).toHaveCount(0);
});

test('a learner studies what their own company sells', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await createConfirmedRecord(page, {
    companyNameTh: 'บริษัท ขายของ จำกัด',
    juristicId: '0105568233721',
    issuedOn: '13/07/2569',
  });
  await expect(page.getByTestId('record-status')).toHaveText('confirmed');
});
