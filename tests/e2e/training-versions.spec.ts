import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs, openRecordTab, switchTo } from './helpers';
import { seedInProgressAttempt, seedLearnerWithCompleteCompany, submitAttempt } from './seed';

test('a learner is pinned to version 1, stays there when the facts change, and is moved on purpose', async ({
  page,
}) => {
  // Three pages, four reloads and a seeded attempt: more than the default budget.
  test.setTimeout(90_000);
  const company = `บริษัท รุ่น ${Date.now()} จำกัด`;
  const learner = await seedLearnerWithCompleteCompany(company);

  // The learner's first look pins version 1 (plan decision 2).
  await loginAs(page, learner, E2E_PASSWORD);
  await expect(page.getByTestId('company-nature')).toContainText('เสื้อผ้า');

  await switchTo(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/learners');
  await page.getByRole('link', { name: learner }).click();
  await page.waitForURL(/\/th\/admin\/users\/[0-9a-f-]{36}$/);
  const userUrl = page.url();
  await expect(page.getByTestId('version-panel')).toHaveAttribute('data-pinned', '1');
  await expect(page.getByTestId('version-newest')).toContainText('ปัจจุบัน');
  // Complete company, but the role is not confirmed: 29/30 and 10/11 (plan decision 4, D91).
  await expect(page.getByTestId('coverage-mcq')).toHaveAttribute('data-ready', '29');
  await expect(page.getByTestId('coverage-interview')).toHaveAttribute('data-ready', '10');

  // Confirm the role of a shareholder: everything resolves.
  await page.getByTestId('role-holder').fill('นางสาวกุลธิดา พลเยี่ยม');
  await page.locator('input[name="position"]').fill('กรรมการ');
  await page.getByTestId('role-form').getByRole('button', { name: 'บันทึก' }).click();
  await expect(page.getByTestId('role-saved')).toBeVisible();
  await page.getByTestId('role-confirm').click();
  await expect(page.getByTestId('version-message')).toContainText('ยืนยันบทบาทแล้ว');
  await page.reload();
  await expect(page.getByTestId('coverage-mcq')).toHaveAttribute('data-ready', '30');
  await expect(page.getByTestId('coverage-interview')).toHaveAttribute('data-ready', '11');

  // A fact changes on the record: version 2, and the learner stays on 1.
  await page.goto('/th/admin/dbd-records');
  await page.getByRole('link', { name: company }).first().click();
  await page.waitForURL(/\/th\/admin\/dbd-records\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('training-versions')).toHaveAttribute('data-active', '1');
  await expect(page.getByTestId('version-complete')).toBeVisible();
  await openRecordTab(page, 'interview');
  const answers = page.getByTestId('interview-answers');
  await answers.locator('[name="interview_monthly_revenue"]').fill('350,000 บาท');
  await page.getByTestId('save-interview').click();
  await expect(page.getByTestId('interview-saved')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('training-versions')).toHaveAttribute('data-active', '2');
  await expect(page.getByTestId('version-behind')).toHaveAttribute('data-count', '1');

  // The move is refused while a quiz is open, then done, audited, and the role survives.
  const attemptId = await seedInProgressAttempt(learner);
  await page.goto(userUrl);
  await expect(page.getByTestId('version-panel')).toHaveAttribute('data-pinned', '1');
  await expect(page.getByTestId('version-newest')).toContainText('รุ่นที่ 2');
  await page.getByTestId('version-move').click();
  await expect(page.getByTestId('version-error')).toContainText('กำลังทำแบบฝึกหัด');
  await submitAttempt(attemptId);
  await page.getByTestId('version-move').click();
  await expect(page.getByTestId('version-message')).toContainText('ย้ายไปรุ่นที่ 2');
  await page.reload();
  await expect(page.getByTestId('version-panel')).toHaveAttribute('data-pinned', '2');
  await expect(page.getByTestId('role-confirmation')).toContainText('ยืนยันบทบาทเมื่อ');
  await expect(page.getByTestId('coverage-mcq')).toHaveAttribute('data-ready', '30');
});
