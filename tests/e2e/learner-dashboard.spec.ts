import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_LEARNER, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompany } from './seed';

test('a learner sees their company and the bank stage locked behind the exam, with the date', async ({
  page,
}) => {
  const loginId = await seedLearnerWithCompany('บริษัท แดชบอร์ด จำกัด', '2099-01-01');
  await loginAs(page, loginId, E2E_PASSWORD);
  await expect(page.getByTestId('company-name')).toHaveText('บริษัท แดชบอร์ด จำกัด');
  // Default policy: exam pass required before the bank stage (decision D9).
  await expect(page.getByTestId('stage-bank-status')).toHaveText('ล็อก');
  await expect(page.getByTestId('stage-bank')).toContainText('ต้องสอบผ่านก่อน');
  await expect(page.getByTestId('stage-quiz-status')).toHaveText('พร้อมใช้งาน');
  await expect(page.getByTestId('stage-study-status')).toHaveText('พร้อมใช้งาน');
});

test('a learner whose certificate has no issue date still sees the pending reason on the company card', async ({
  page,
}) => {
  const loginId = await seedLearnerWithCompany('บริษัท ไม่มีวันที่ จำกัด', null);
  await loginAs(page, loginId, E2E_PASSWORD);
  await expect(page.getByTestId('company-name')).toHaveText('บริษัท ไม่มีวันที่ จำกัด');
  await expect(page.getByTestId('stage-bank-status')).toHaveText('ล็อก');
});

test('a learner with no assignment sees the no-company message and every stage locked', async ({
  page,
}) => {
  await loginAs(page, E2E_LEARNER.loginId, E2E_PASSWORD);
  await expect(page.getByTestId('no-company')).toBeVisible();
  for (const stage of ['study', 'quiz', 'exam', 'nameCard', 'bank']) {
    await expect(page.getByTestId(`stage-${stage}-status`)).toHaveText('ล็อก');
  }
});

test('admin sees each learner’s derived progression', async ({ page }) => {
  const assigned = await seedLearnerWithCompany('บริษัท ความคืบหน้า จำกัด', '2026-07-13');
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/users');
  await expect(page.getByTestId(`progression-${assigned}`)).toHaveText('เตรียมบัญชีแล้ว');
  await expect(page.getByTestId(`progression-${E2E_LEARNER.loginId}`)).toHaveText('ยังไม่มอบหมาย');
});
