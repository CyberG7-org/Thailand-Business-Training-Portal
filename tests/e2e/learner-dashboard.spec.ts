import { expect, test } from '@playwright/test';
import { E2E_LEARNER, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompany } from './seed';

test('a learner sees their company and the locked bank stage with the Thai date', async ({
  page,
}) => {
  const loginId = await seedLearnerWithCompany('บริษัท แดชบอร์ด จำกัด', '2099-01-01');
  await loginAs(page, loginId, E2E_PASSWORD);
  await expect(page.getByTestId('company-name')).toHaveText('บริษัท แดชบอร์ด จำกัด');
  await expect(page.getByTestId('bank-stage')).toContainText('15 กุมภาพันธ์ 2642');
});

test('a learner whose certificate has no issue date sees the pending message', async ({ page }) => {
  const loginId = await seedLearnerWithCompany('บริษัท ไม่มีวันที่ จำกัด', null);
  await loginAs(page, loginId, E2E_PASSWORD);
  await expect(page.getByTestId('bank-stage')).toContainText('ยังไม่สามารถคำนวณวันที่ได้');
});

test('a learner whose eligibility date has passed sees the stage as available', async ({
  page,
}) => {
  const loginId = await seedLearnerWithCompany('บริษัท พร้อมแล้ว จำกัด', '2020-01-01');
  await loginAs(page, loginId, E2E_PASSWORD);
  await expect(page.getByTestId('bank-stage')).toContainText('เปิดให้ทำได้แล้ว');
});

test('a learner with no assignment sees the no-company message', async ({ page }) => {
  await loginAs(page, E2E_LEARNER.loginId, E2E_PASSWORD);
  await expect(page.getByTestId('no-company')).toBeVisible();
});
