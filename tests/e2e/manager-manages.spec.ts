import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { createConfirmedRecord, createLearner, createManager, loginAs, switchTo } from './helpers';

const MANAGER_PASSWORD = 'Manager-Password-1!';
const LEARNER_PASSWORD = 'Learn123';

/** Spec §4: a manager may suspend and reset the password of their own team's learners. */
test('a manager can open one of their learners and suspend them', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ผู้จัดการดูแล', MANAGER_PASSWORD);

  await switchTo(page, code.toLowerCase(), MANAGER_PASSWORD);
  const company = `บริษัท ดูแลทีม ${Date.now()} จำกัด`;
  await createConfirmedRecord(page, {
    companyNameTh: company,
    juristicId: '0105568233780',
    team: code,
    issuedOn: '13/07/2569',
  });
  // A manager's own team is implied, so their prefix and a free code show straight away (D69).
  await page.goto('/th/admin/users?tab=learner');
  await expect(page.locator('select[name="managerId"]')).toHaveCount(0);
  await expect(page.getByTestId('login-id-prefix')).toHaveText(code);
  await expect(page.getByTestId('login-suffix')).toHaveValue(/^[A-Z]{2}[0-9]{2}$/);
  const learner = await createLearner(page, { password: LEARNER_PASSWORD, company });
  expect(learner).toMatch(new RegExp(`^${code.toLowerCase()}[a-z]{2}[0-9]{2}$`));

  await page.goto('/th/admin/learners');
  await page.getByRole('link', { name: learner.toUpperCase(), exact: true }).click();
  await expect(page).toHaveURL(/\/th\/admin\/users\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(learner.toUpperCase());

  await page.getByRole('button', { name: 'ระงับบัญชี' }).click();
  await expect(page.getByTestId('account-status')).toHaveText('disabled');
});

test('a manager cannot open a learner of another team', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const teamA = await createManager(page, 'ทีมเอ', MANAGER_PASSWORD);
  const teamB = await createManager(page, 'ทีมบี', MANAGER_PASSWORD);

  await switchTo(page, teamA.toLowerCase(), MANAGER_PASSWORD);
  const company = `บริษัท เอ ${Date.now()} จำกัด`;
  await createConfirmedRecord(page, {
    companyNameTh: company,
    juristicId: '0105568233712',
    team: teamA,
    issuedOn: '13/07/2569',
  });
  await createLearner(page, { password: LEARNER_PASSWORD, company });
  await page.goto('/th/admin/learners');
  const href = await page
    .getByRole('link', { name: /^T[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$/ })
    .getAttribute('href');

  await switchTo(page, teamB.toLowerCase(), MANAGER_PASSWORD);
  await page.goto(href!);
  // RLS hides the row, so the page is not found: no controls, nothing to act on.
  await expect(page.getByTestId('account-status')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ระงับบัญชี' })).toHaveCount(0);
});

test('a manager is sent back from the question bank and does not see it in the sidebar (D76)', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ผู้จัดการไม่เขียนข้อสอบ', MANAGER_PASSWORD);
  await switchTo(page, code.toLowerCase(), MANAGER_PASSWORD);
  for (const path of ['/th/admin/questions', '/th/admin/questions/new']) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/th\/admin$/);
  }
  await expect(page.getByTestId('staff-nav')).not.toContainText('คลังคำถาม');
  await expect(page.getByTestId('admin-nav')).not.toContainText('คลังคำถาม');
});
