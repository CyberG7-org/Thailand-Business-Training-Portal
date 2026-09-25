import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { createConfirmedRecord, createLearner, createManager, loginAs, switchTo } from './helpers';

const MANAGER_PASSWORD = 'Manager-Password-1!';
const LEARNER_PASSWORD = 'Learner-Password-1!';

test('owner creates a manager, the manager creates a learner, the learner studies', async ({
  page,
}) => {
  // 1. The owner creates a manager.
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'คุณผู้จัดการ', MANAGER_PASSWORD);
  expect(code).toMatch(/^T\d{2,}$/);

  // 2. The manager signs in, and the company they upload is their own.
  await switchTo(page, code.toLowerCase(), MANAGER_PASSWORD);
  await expect(page).toHaveURL(/\/th\/admin$/);
  const company = `บริษัท สามระดับ ${Date.now()} จำกัด`;
  await createConfirmedRecord(page, {
    companyNameTh: company,
    juristicId: '0105568233707',
    issuedOn: '13/07/2569',
  });

  // 3. The manager creates a learner: the code follows their own, and no team is asked for.
  await page.goto('/th/admin/users');
  await expect(page.locator('select[name="managerId"]')).toHaveCount(0);
  const learner = await createLearner(page, {
    password: LEARNER_PASSWORD,
    displayName: 'ผู้เรียนสามระดับ',
    company,
  });
  expect(learner).toBe(`${code.toLowerCase()}-01`);

  // 4. The learner signs in and sees their own company.
  await switchTo(page, learner, LEARNER_PASSWORD);
  await expect(page).toHaveURL(/\/th\/dashboard$/);
  await expect(page.getByTestId('company-name')).toHaveText(company);
});
