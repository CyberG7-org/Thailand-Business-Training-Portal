import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import {
  createConfirmedRecord,
  fillBusinessAnswers,
  loginAs,
  openManualRecordForm,
  openRecordTab,
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

test('the record lists what blocks acceptance, and accepts itself the moment it is done', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await openManualRecordForm(page);
  await page.locator('input[name="company_name_th"]').fill('บริษัท ไม่ครบ จำกัด');
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await page.waitForURL(/\/th\/admin\/dbd-records\/[0-9a-f-]{36}$/);

  // The certificate fact and the four answers are listed as blocking acceptance, in Thai.
  const blocking = page.getByTestId('exceptions-acceptance');
  await expect(blocking).toContainText('เลขทะเบียนนิติบุคคล');
  await expect(blocking).toContainText('อีเมลของบริษัท');
  await expect(blocking).toContainText('สินค้าหรือบริการ');
  await expect(page.getByTestId('record-status')).not.toHaveText('confirmed');

  // The answers alone are not enough: the registration number is still missing.
  await fillBusinessAnswers(page);
  await expect(blocking).toContainText('เลขทะเบียนนิติบุคคล');
  await expect(blocking).not.toContainText('อีเมลของบริษัท');

  // A number with a wrong check digit is an exception of its own, not accepted.
  await page.locator('input[name="juristic_id"]').fill('0105568233705');
  const level1 = page.locator('form:has(input[name="juristic_id"])');
  await level1.getByRole('button', { name: 'บันทึก' }).click();
  await expect(level1.getByRole('status')).toContainText('บันทึกแล้ว');
  await openRecordTab(page, 'exceptions');
  await expect(page.getByTestId('exception-invalid-juristic_id')).toBeVisible();
  await expect(page.getByTestId('record-status')).not.toHaveText('confirmed');

  await openRecordTab(page, 'details');
  await page.locator('input[name="juristic_id"]').fill('0105568233704');
  await level1.getByRole('button', { name: 'บันทึก' }).click();
  await expect(page.getByTestId('record-status')).toHaveText('confirmed');
  await openRecordTab(page, 'exceptions');
  await expect(page.getByTestId('exceptions-acceptance')).toHaveCount(0);
  // The version waits for the rest of the sheet.
  await expect(page.getByTestId('exceptions-version')).toBeVisible();
  await expect(page.getByTestId('training-versions')).toHaveAttribute('data-active', '');
});

test('a learner studies what their own company sells', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await createConfirmedRecord(page, {
    companyNameTh: 'บริษัท ขายของ จำกัด',
    juristicId: '0105568233721',
    issuedOn: '13/07/2569',
  });
  await expect(page.locator('textarea[name="interview_nature_of_business"]')).toHaveValue(
    'ขายเสื้อผ้าออนไลน์',
  );
});
