import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import {
  createConfirmedRecord,
  fillBusinessAnswers,
  loginAs,
  openManualRecordForm,
} from './helpers';

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

test('the record lists everything still to fill in, and holds Confirm until it is done', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await openManualRecordForm(page);
  await page.locator('input[name="company_name_th"]').fill('บริษัท ไม่ครบ จำกัด');
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await page.waitForURL(/\/th\/admin\/dbd-records\/[0-9a-f-]{36}$/);

  // The certificate fact and all four business answers are named, in Thai, before any click.
  const blocked = page.getByTestId('confirm-blocked');
  await expect(blocked).toContainText('เลขทะเบียนนิติบุคคล');
  await expect(blocked).toContainText('อีเมลของบริษัท');
  await expect(blocked).toContainText('สินค้าหรือบริการที่จะขาย');
  await expect(page.getByRole('button', { name: 'ยืนยันข้อมูล' })).toBeDisabled();

  // Writing the answers is not enough on its own: the juristic id is still missing.
  await fillBusinessAnswers(page);
  await expect(blocked).toContainText('เลขทะเบียนนิติบุคคล');
  await expect(blocked).not.toContainText('อีเมลของบริษัท');
  await expect(page.getByRole('button', { name: 'ยืนยันข้อมูล' })).toBeDisabled();

  await page.locator('input[name="juristic_id"]').fill('0105568233704');
  // Two forms on this page save: scope to the one holding the certificate facts.
  await page
    .locator('form:has(input[name="juristic_id"])')
    .getByRole('button', { name: 'บันทึก' })
    .click();
  await expect(page.getByTestId('confirm-blocked')).toHaveCount(0);
  await page.getByRole('button', { name: 'ยืนยันข้อมูล' }).click();
  await expect(page.getByTestId('record-status')).toHaveText('confirmed');
});

test('a learner studies what their own company sells', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await createConfirmedRecord(page, {
    companyNameTh: 'บริษัท ขายของ จำกัด',
    juristicId: '0105568233705',
    issuedOn: '13/07/2569',
  });
  await expect(page.locator('textarea[name="interview_nature_of_business"]')).toHaveValue(
    'ขายเสื้อผ้าออนไลน์',
  );
});
