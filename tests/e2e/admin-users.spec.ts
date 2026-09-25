import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { createConfirmedRecord, createLearner, createManager, loginAs, switchTo } from './helpers';

const MANAGER_PASSWORD = 'Manager-Password-1!';
const LEARNER_PASSWORD = 'Learner-Pass-123';

test('a learner is created inside a team, with an allocated code', async ({ page }) => {
  const company = `บริษัท ผู้เรียนใหม่ ${Date.now()} จำกัด`;
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'หัวหน้าทีม', MANAGER_PASSWORD);
  await createConfirmedRecord(page, {
    companyNameTh: company,
    juristicId: '0105568233704',
    issuedOn: '13/07/2569',
  });
  const learner = await createLearner(page, {
    password: LEARNER_PASSWORD,
    displayName: 'E2E Learner',
    company,
    team: code,
  });
  expect(learner).toBe(`${code.toLowerCase()}-01`);

  // The form has no language or role choice, and no typed login id: the code is allocated.
  await expect(page.locator('select[name="preferredLanguage"]')).toHaveCount(0);
  await expect(page.locator('select[name="role"]')).toHaveCount(0);
  await expect(page.locator('input[name="loginId"]')).toHaveCount(0);
  await expect(page.getByTestId(`company-${learner}`)).toHaveText(company);
  await expect(page.getByTestId(`team-${learner}`)).toHaveText(code);

  await switchTo(page, learner, LEARNER_PASSWORD);
  await expect(page).toHaveURL(/\/th\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'ยินดีต้อนรับ E2E Learner' })).toBeVisible();
  await expect(page.getByText(company)).toBeVisible();
});

test('the admin must say which team', async ({ page }) => {
  const company = `บริษัท ไม่มีทีม ${Date.now()} จำกัด`;
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await createManager(page, 'ทีมที่มีอยู่', MANAGER_PASSWORD);
  await createConfirmedRecord(page, {
    companyNameTh: company,
    juristicId: '0105568233704',
    issuedOn: '13/07/2569',
  });

  await page.goto('/th/admin/users');
  await page.locator('input[name="password"]').fill(LEARNER_PASSWORD);
  const option = page.locator('select[name="dbdRecordId"] option', { hasText: company });
  await page
    .locator('select[name="dbdRecordId"]')
    .selectOption((await option.getAttribute('value'))!);
  // The team select is required, so the browser keeps the form here and nothing is created.
  await page.getByRole('button', { name: 'สร้างผู้ใช้' }).click();
  await expect(page.getByTestId('create-user-status')).toHaveCount(0);
  await expect(page.locator('select[name="managerId"]')).toHaveAttribute('required', '');
});

test('a learner cannot be created without a confirmed company', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/users');
  await page.locator('input[name="password"]').fill(LEARNER_PASSWORD);
  await page.getByRole('button', { name: 'สร้างผู้ใช้' }).click();
  await expect(page.getByTestId('create-user-status')).toHaveCount(0);
  await expect(page.locator('select[name="dbdRecordId"]')).toHaveAttribute('required', '');
});

test('a manager sees only their own learners, no team picker, and no other team company', async ({
  page,
}) => {
  const adminCompany = `บริษัท ของแอดมิน ${Date.now()} จำกัด`;
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ทีมเดียว', MANAGER_PASSWORD);
  await createConfirmedRecord(page, {
    companyNameTh: adminCompany,
    juristicId: '0105568233704',
    issuedOn: '13/07/2569',
  });

  await switchTo(page, code.toLowerCase(), MANAGER_PASSWORD);
  await page.goto('/th/admin/users');
  await expect(page.locator('select[name="managerId"]')).toHaveCount(0);
  // Only the header row: this team has no learners yet.
  await expect(page.getByRole('row')).toHaveCount(1);
  // The picker is RLS-narrowed: a record they cannot read is not an option they can pick.
  await expect(page.locator('select[name="dbdRecordId"]')).not.toContainText(adminCompany);
});

test('admin can disable an account and it can no longer sign in', async ({ page }) => {
  const company = `บริษัท ระงับ ${Date.now()} จำกัด`;
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'หัวหน้าระงับ', MANAGER_PASSWORD);
  await createConfirmedRecord(page, {
    companyNameTh: company,
    juristicId: '0105568233704',
    issuedOn: '13/07/2569',
  });
  const learner = await createLearner(page, {
    password: LEARNER_PASSWORD,
    company,
    team: code,
  });
  await page.getByRole('link', { name: learner.toUpperCase() }).click();
  await page.getByRole('button', { name: 'ระงับบัญชี' }).click();
  await expect(page.getByTestId('account-status')).toHaveText('disabled');

  await page.context().clearCookies();
  await page.goto('/th/login');
  await page.locator('input[name="loginId"]').fill(learner);
  await page.locator('input[name="password"]').fill(LEARNER_PASSWORD);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});

test('the admin cannot pair a team with another team company', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const teamA = await createManager(page, 'ทีมเจ้าของ', MANAGER_PASSWORD);
  const teamB = await createManager(page, 'ทีมอื่น', MANAGER_PASSWORD);

  // A company that belongs to team A.
  await switchTo(page, teamA.toLowerCase(), MANAGER_PASSWORD);
  const company = `บริษัท ของทีมเอ ${Date.now()} จำกัด`;
  await createConfirmedRecord(page, {
    companyNameTh: company,
    juristicId: '0105568233714',
    issuedOn: '13/07/2569',
  });

  // The admin picks team B: team A's company must not be on offer for them.
  await switchTo(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/users');
  const teamOption = page.locator('select[name="managerId"] option', { hasText: teamB });
  await page
    .locator('select[name="managerId"]')
    .selectOption((await teamOption.getAttribute('value'))!);
  await expect(page.locator('select[name="dbdRecordId"]')).not.toContainText(company);
});

test('the admin keeps a way to their own account', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/users');
  await expect(page.getByRole('link', { name: E2E_ADMIN.loginId.toUpperCase() })).toBeVisible();
});

test('the admin can rename the holder of a team', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ผู้ดูแลคนเก่า', MANAGER_PASSWORD);
  const row = page.getByTestId(`manager-${code.toLowerCase()}`);
  await expect(row).toContainText('ผู้ดูแลคนเก่า');

  await row.locator('input[name="displayName"]').fill('ผู้ดูแลคนใหม่');
  await row.getByTestId('rename-manager').click();
  await expect(page.getByTestId(`manager-${code.toLowerCase()}`)).toContainText('ผู้ดูแลคนใหม่');
});
