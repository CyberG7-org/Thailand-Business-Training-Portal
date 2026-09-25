import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { createConfirmedRecord, createLearner, createManager, loginAs, switchTo } from './helpers';

const MANAGER_PASSWORD = 'Manager-Password-1!';
const LEARNER_PASSWORD = 'Learner-Password-1!';

/** Spec §4: a manager may suspend and reset the password of their own team's learners. */
test('a manager can open one of their learners and suspend them', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ผู้จัดการดูแล', MANAGER_PASSWORD);

  await switchTo(page, code.toLowerCase(), MANAGER_PASSWORD);
  const company = `บริษัท ดูแลทีม ${Date.now()} จำกัด`;
  await createConfirmedRecord(page, {
    companyNameTh: company,
    juristicId: '0105568233711',
    issuedOn: '13/07/2569',
  });
  const learner = await createLearner(page, { password: LEARNER_PASSWORD, company });

  await page.goto('/th/admin/users');
  await page.getByRole('link', { name: learner.toUpperCase() }).click();
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
    issuedOn: '13/07/2569',
  });
  await createLearner(page, { password: LEARNER_PASSWORD, company });
  await page.goto('/th/admin/users');
  const href = await page.getByRole('link', { name: /T\d+-\d+/ }).getAttribute('href');

  await switchTo(page, teamB.toLowerCase(), MANAGER_PASSWORD);
  await page.goto(href!);
  // RLS hides the row, so the page is not found: no controls, nothing to act on.
  await expect(page.getByTestId('account-status')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ระงับบัญชี' })).toHaveCount(0);
});

test('a manager can open the AI generation screen and use it', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ผู้จัดการสร้างข้อสอบ', MANAGER_PASSWORD);

  await switchTo(page, code.toLowerCase(), MANAGER_PASSWORD);
  const company = `บริษัท ออกข้อสอบ ${Date.now()} จำกัด`;
  await createConfirmedRecord(page, {
    companyNameTh: company,
    juristicId: '0105568233713',
    issuedOn: '13/07/2569',
  });

  await page.goto('/th/admin/questions/generate');
  await expect(page).toHaveURL(/\/th\/admin\/questions\/generate$/);
  const record = page.locator('select[name="reference_record_id"] option', { hasText: company });
  await page
    .locator('select[name="reference_record_id"]')
    .selectOption((await record.getAttribute('value'))!);
  await page.getByTestId('generate-submit').click();
  // The action must accept a manager: being bounced to /admin is the failure this pins.
  await expect(page).not.toHaveURL(/\/th\/admin$/);
});
