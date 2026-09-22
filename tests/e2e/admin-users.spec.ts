import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { createConfirmedRecord, createLearner, login, loginAs } from './helpers';

test('admin creates a learner for a company; the learner signs in and sees that company', async ({
  page,
}) => {
  const loginId = `e2e-new-${Date.now()}`;
  const company = `บริษัท ผู้เรียนใหม่ ${Date.now()} จำกัด`;
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await createConfirmedRecord(page, {
    companyNameTh: company,
    juristicId: '0105568233704',
    issuedOn: '13/07/2569',
  });
  await createLearner(page, {
    loginId,
    password: 'Learner-Pass-123',
    displayName: 'E2E Learner',
    company,
  });
  // The form has no language or role choice: every learner gets all three languages.
  await expect(page.locator('select[name="preferredLanguage"]')).toHaveCount(0);
  await expect(page.locator('select[name="role"]')).toHaveCount(0);
  await expect(page.getByTestId(`company-${loginId}`)).toHaveText(company);
  await expect(page.getByRole('link', { name: loginId })).toBeVisible();

  await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
  await login(page, loginId, 'Learner-Pass-123');
  await expect(page).toHaveURL(/\/th\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'ยินดีต้อนรับ E2E Learner' })).toBeVisible();
  await expect(page.getByText(company)).toBeVisible();
});

test('a learner cannot be created without a confirmed company', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/users');
  await page.locator('input[name="loginId"]').fill(`e2e-nocompany-${Date.now()}`);
  await page.locator('input[name="password"]').fill('Learner-Pass-123');
  await page.getByRole('button', { name: 'สร้างผู้ใช้' }).click();
  // Native "required" keeps the form on the page; nothing was created.
  await expect(page.getByTestId('create-user-status')).toHaveCount(0);
  await expect(page.locator('select[name="dbdRecordId"]')).toHaveAttribute('required', '');
});

test('admin can disable an account and it can no longer sign in', async ({ page }) => {
  const loginId = `e2e-disable-${Date.now()}`;
  const company = `บริษัท ระงับ ${Date.now()} จำกัด`;
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await createConfirmedRecord(page, {
    companyNameTh: company,
    juristicId: '0105568233704',
    issuedOn: '13/07/2569',
  });
  await createLearner(page, { loginId, password: 'Learner-Pass-123', company });
  await page.getByRole('link', { name: loginId }).click();
  await page.getByRole('button', { name: 'ระงับบัญชี' }).click();
  await expect(page.getByTestId('account-status')).toHaveText('disabled');

  await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
  await login(page, loginId, 'Learner-Pass-123');
  await expect(page.getByTestId('login-error')).toBeVisible();
  await expect(page).toHaveURL(/\/th\/login$/);
});
