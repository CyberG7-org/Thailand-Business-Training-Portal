import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import {
  createConfirmedRecord,
  createLearner,
  createManager,
  loginAs,
  openManualRecordForm,
} from './helpers';

test('a learner created for a confirmed record is assigned to it, with the +45-day date in Thai', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const team = await createManager(page, 'หัวหน้ามอบหมาย', 'Manager-Password-1!');
  const company = `บริษัท มอบหมาย ${Date.now()} จำกัด`;
  await createConfirmedRecord(page, {
    companyNameTh: company,
    juristicId: '0105568233704',
    issuedOn: '13/07/2569',
  });

  const loginId = await createLearner(page, { password: 'Learner-Pass-123', company, team });
  await page.getByRole('link', { name: loginId.toUpperCase() }).click();
  await expect(page.getByTestId('assigned-company')).toHaveText(company);
  await expect(page.getByTestId('available-from')).toContainText('27 สิงหาคม 2569');

  // An unconfirmed record is listed in the picker but cannot be chosen.
  const pending = `บริษัท ยังไม่ยืนยัน ${Date.now()} จำกัด`;
  await openManualRecordForm(page);
  await page.locator('input[name="company_name_th"]').fill(pending);
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await page.waitForURL(/\/th\/admin\/dbd-records\/[0-9a-f-]{36}$/);
  await page.goto('/th/admin/users');
  const option = page.locator('select[name="dbdRecordId"] option', { hasText: pending });
  await expect(option).toBeAttached();
  await expect(option).toHaveAttribute('disabled', '');
});
