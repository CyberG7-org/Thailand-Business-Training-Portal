import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import {
  createConfirmedRecord,
  createLearner,
  createManager,
  fillLoginSuffix,
  loginAs,
  selectTeam,
  switchTo,
} from './helpers';

const MANAGER_PASSWORD = 'Manager-Password-1!';
const LEARNER_PASSWORD = 'Learner-Pass-123';

test('a learner is created inside a team, under a code typed after the team prefix', async ({
  page,
}) => {
  const company = `บริษัท ผู้เรียนใหม่ ${Date.now()} จำกัด`;
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'หัวหน้าทีม', MANAGER_PASSWORD);
  expect(code).toMatch(/^T-[A-Z0-9]{2,6}$/);
  await createConfirmedRecord(page, {
    companyNameTh: company,
    juristicId: '0105568233704',
    issuedOn: '13/07/2569',
  });

  // Until a team is chosen there is no prefix to type after (D69).
  await page.goto('/th/admin/users');
  await expect(page.getByTestId('login-suffix')).toBeDisabled();
  await selectTeam(page, code);
  await expect(page.getByTestId('login-id-prefix')).toHaveText(`${code}-`);
  // A free code is filled in: one letter and one digit, like G4.
  await expect(page.getByTestId('login-suffix')).toHaveValue(/^[A-Z][0-9]{2}$/);
  await expect(page.getByTestId('login-id-status')).toHaveAttribute('data-state', 'available');
  await expect(page.locator('input[name="displayName"]')).toHaveAttribute('required', '');

  const learner = await createLearner(page, {
    password: LEARNER_PASSWORD,
    displayName: 'E2E Learner',
    company,
    team: code,
    suffix: 'A12',
  });
  expect(learner).toBe(`${code.toLowerCase()}-a12`);

  // The form has no language or role choice, and the prefix is not typed.
  await expect(page.locator('select[name="preferredLanguage"]')).toHaveCount(0);
  await expect(page.locator('select[name="role"]')).toHaveCount(0);
  await expect(page.locator('input[name="loginId"]')).toHaveCount(0);
  // Learners are listed on their own page (D80).
  await page.goto('/th/admin/learners');
  await expect(page.getByTestId(`company-${learner}`)).toHaveText(company);

  await switchTo(page, learner, LEARNER_PASSWORD);
  await expect(page).toHaveURL(/\/th\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'ยินดีต้อนรับ E2E Learner' })).toBeVisible();
  await expect(page.getByTestId('company-name')).toHaveText(company);
});

test('a taken code is flagged as it is typed and refused at create', async ({ page }) => {
  const company = `บริษัท รหัสซ้ำ ${Date.now()} จำกัด`;
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ทีมรหัสซ้ำ', MANAGER_PASSWORD);
  await createConfirmedRecord(page, {
    companyNameTh: company,
    juristicId: '0105568233704',
    issuedOn: '13/07/2569',
  });
  await createLearner(page, { password: LEARNER_PASSWORD, company, team: code, suffix: 'Q07' });

  await page.goto('/th/admin/users');
  await selectTeam(page, code);
  await fillLoginSuffix(page);
  // Not case-sensitive: q07 is the Q07 already held.
  await page.getByTestId('login-suffix').fill('q07');
  await expect(page.getByTestId('login-id-status')).toHaveAttribute('data-state', 'taken');
  await expect(page.getByTestId('login-id-status')).toHaveText(
    'รหัสนี้มีผู้ใช้แล้ว กรุณาเลือกรหัสอื่น',
  );
  await page.getByTestId('login-suffix').fill('Q-7');
  await expect(page.getByTestId('login-id-status')).toHaveAttribute('data-state', 'invalid');
  // A learner's code is one letter and two digits (D83): the old two-character shape is refused.
  await page.getByTestId('login-suffix').fill('Q7');
  await expect(page.getByTestId('login-id-status')).toHaveText(
    'ใช้ตัวอักษรภาษาอังกฤษ 1 ตัวตามด้วยตัวเลข 2 ตัว เช่น D42',
  );

  // Sent anyway, the server refuses it in the same words and creates nobody.
  await page.getByTestId('login-suffix').fill('Q07');
  await page.locator('input[name="password"]').fill(LEARNER_PASSWORD);
  await page.locator('input[name="displayName"]').fill('ผู้เรียนซ้ำ');
  await page.locator('input[name="phone"]').fill('0812345678');
  await page.locator('input[name="contactEmail"]').fill('dup@example.co.th');
  const option = page.locator('select[name="dbdRecordId"] option', { hasText: company });
  await page
    .locator('select[name="dbdRecordId"]')
    .selectOption((await option.getAttribute('value'))!);
  await page.getByRole('button', { name: 'สร้างผู้ใช้' }).click();
  await expect(page.getByTestId('create-user-error')).toHaveText(
    'รหัสนี้มีผู้ใช้แล้ว กรุณาเลือกรหัสอื่น',
  );
  await page.goto('/th/admin/learners');
  await expect(page.getByRole('link', { name: `${code}-Q07`, exact: true })).toHaveCount(1);
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

test('a learner is not created without a name', async ({ page }) => {
  const company = `บริษัท ไร้ชื่อ ${Date.now()} จำกัด`;
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ทีมไร้ชื่อ', MANAGER_PASSWORD);
  await createConfirmedRecord(page, {
    companyNameTh: company,
    juristicId: '0105568233704',
    issuedOn: '13/07/2569',
  });

  await page.goto('/th/admin/users');
  await selectTeam(page, code);
  await fillLoginSuffix(page);
  await page.locator('input[name="password"]').fill(LEARNER_PASSWORD);
  const option = page.locator('select[name="dbdRecordId"] option', { hasText: company });
  await page
    .locator('select[name="dbdRecordId"]')
    .selectOption((await option.getAttribute('value'))!);
  // The name is required, so the browser keeps the form here and nobody is created.
  await page.getByRole('button', { name: 'สร้างผู้ใช้' }).click();
  await expect(page.getByTestId('create-user-status')).toHaveCount(0);
  await expect(page.getByTestId('login-suffix')).not.toHaveValue('');
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
  // The picker is RLS-narrowed: a record they cannot read is not an option they can pick.
  await expect(page.locator('select[name="dbdRecordId"]')).not.toContainText(adminCompany);
  // Nor is it on their companies list, which is empty.
  await expect(page.getByTestId('companies')).not.toContainText(adminCompany);
  // Their Learner Record is empty: this team has no learners yet.
  await page.goto('/th/admin/learners');
  await expect(page.getByTestId('learner-record')).toHaveCount(0);
  await expect(page.getByText('ยังไม่มีผู้เรียน')).toBeVisible();
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
  await page.goto('/th/admin/learners');
  await page.getByRole('link', { name: learner.toUpperCase(), exact: true }).click();
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
    juristicId: '0105568233755',
    issuedOn: '13/07/2569',
  });

  // The admin picks team B: team A's company must not be on offer for them.
  await switchTo(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/users');
  await selectTeam(page, teamB);
  await expect(page.locator('select[name="dbdRecordId"]')).not.toContainText(company);
});

test('the Learner Record lists learners only, never a staff account', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/learners');
  await expect(page.getByTestId('learner-record')).toBeVisible();
  await expect(page.getByTestId(`learner-${E2E_ADMIN.loginId}`)).toHaveCount(0);
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
