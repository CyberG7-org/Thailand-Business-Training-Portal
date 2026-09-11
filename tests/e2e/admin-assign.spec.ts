import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { createConfirmedRecord, loginAs } from './helpers';

test('admin assigns a confirmed record and sees the +45-day date in Thai', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const company = `บริษัท มอบหมาย ${Date.now()} จำกัด`;
  await createConfirmedRecord(page, {
    companyNameTh: company,
    juristicId: '0105568233704',
    issuedOn: '13/07/2569',
  });

  const loginId = `e2e-assign-${Date.now()}`;
  await page.goto('/th/admin/users');
  await page.locator('input[name="loginId"]').fill(loginId);
  await page.locator('input[name="password"]').fill('Learner-Pass-123');
  await page.getByRole('button', { name: 'สร้างผู้ใช้' }).click();
  await page.getByRole('link', { name: loginId }).click();

  const optionValue = await page
    .locator('select[name="dbdRecordId"] option', { hasText: company })
    .getAttribute('value');
  await page.locator('select[name="dbdRecordId"]').selectOption(optionValue!);
  await page.getByRole('button', { name: 'มอบหมาย' }).click();
  await expect(page.getByTestId('assigned-company')).toHaveText(company);
  await expect(page.getByTestId('available-from')).toContainText('27 สิงหาคม 2569');
});
