import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs, openRecordTab, switchTo } from './helpers';
import {
  recordIdForLearner,
  seedInProgressAttempt,
  seedLearnerWithCompleteCompany,
  submitAttempt,
} from './seed';

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
  // Complete company with one director: the role has its name and confirmed itself, so
  // everything resolves with nobody pressing anything (D95).
  await expect(page.getByTestId('role-confirm')).toHaveCount(0);
  await expect(page.getByTestId('role-confirmation')).toHaveAttribute('data-confirmed', 'true');

  // The name is the company's only director, filled in with nobody typing (D95).
  await expect(page.getByTestId('role-holder')).toHaveValue('นางสาวกุลธิดา พลเยี่ยม');
  await expect(page.getByTestId('coverage-mcq')).toHaveAttribute('data-ready', '30');
  await expect(page.getByTestId('coverage-interview')).toHaveAttribute('data-ready', '11');

  // A fact changes on the record: version 2, and the learner stays on 1.
  await page.goto(`/th/admin/dbd-records/${await recordIdForLearner(learner)}`);
  await expect(page.getByTestId('training-versions')).toHaveAttribute('data-active', '1');
  await expect(page.getByTestId('version-complete')).toBeVisible();
  await openRecordTab(page, 'interview');
  await page.locator('select[name="categoryKey"]').selectOption('fashion_accessories');
  await page.getByTestId('category-set').click();
  await expect(page.getByTestId('category-panel')).toHaveAttribute('data-status', 'mapped');
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
