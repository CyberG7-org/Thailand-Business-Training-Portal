import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { createConfirmedRecord, createLearner, createManager, loginAs, switchTo } from './helpers';

const MANAGER_PASSWORD = 'Manage1!';
const LEARNER_PASSWORD = 'Learn123';

test('a Manager creates, suspends, resets and archives their Submanager', async ({ page }) => {
  test.setTimeout(120_000);
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const manager = await createManager(page, 'Submanager parent', MANAGER_PASSWORD);
  await switchTo(page, manager.toLowerCase(), MANAGER_PASSWORD);
  await page.goto('/en/admin/submanagers');
  await expect(page.getByRole('heading', { name: 'Submanagers', exact: true })).toBeVisible();
  const create = page.locator('form').filter({ has: page.locator('input[name="suffix"]') });
  await create.locator('input[name="suffix"]').fill('A7');
  await create.locator('input[name="password"]').fill('Sub123!');
  await create.getByRole('button', { name: 'Create Submanager' }).click();
  const login = `${manager.toLowerCase()}sa7`;
  const row = page.getByTestId(`submanager-${login}`);
  await expect(row).toBeVisible();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const formBox = await create.boundingBox();
    const listBox = await page.locator('.staff-table-wrap').boundingBox();
    expect(formBox).not.toBeNull();
    expect(listBox).not.toBeNull();
    expect(Math.abs(formBox!.x - listBox!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(formBox!.width - listBox!.width)).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 1280, height: 844 });
  await row.getByRole('button', { name: 'Suspend', exact: true }).click();
  await expect(row.getByTestId('account-status')).toHaveText('disabled');
  await row.getByRole('button', { name: 'Re-enable', exact: true }).click();
  await expect(row.getByTestId('account-status')).toHaveText('active');
  // The status form already says Saved, so wait on the password form's own result before
  // navigating away (leaving early aborts the reset).
  const passwordForm = row.locator('form').filter({ has: page.locator('input[name="password"]') });
  await passwordForm.locator('input[name="password"]').fill('New123!');
  await passwordForm.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(passwordForm.getByRole('status')).toContainText('Saved');
  // Existing profile flow remains available; sidebar exposes exactly the two agreed items.
  await switchTo(page, login, 'New123!');
  await expect(page.getByTestId('staff-nav').getByRole('link')).toHaveCount(2);
  await page.goto('/en/admin/profile');
  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
  await switchTo(page, manager.toLowerCase(), MANAGER_PASSWORD);
  await page.goto('/en/admin/submanagers');
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByTestId(`submanager-${login}`)
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await expect(page.getByTestId(`submanager-${login}`)).toHaveCount(0);
  await create.locator('input[name="suffix"]').fill('a7');
  await create.locator('input[name="password"]').fill('Sub123!');
  await create.getByRole('button', { name: 'Create Submanager' }).click();
  await expect(create.getByRole('alert')).toContainText('already taken');
});

test('the Owner creates and manages any team’s Submanagers', async ({ page }) => {
  test.setTimeout(120_000);
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const manager = await createManager(page, 'Owner view parent', MANAGER_PASSWORD);
  // The Owner's home has the door too.
  await page.goto('/en/admin');
  await page.getByTestId('admin-nav').getByRole('link', { name: 'Create Submanager' }).click();
  await expect(page).toHaveURL(/\/en\/admin\/submanagers$/);
  await expect(
    page.getByTestId('staff-nav').getByRole('link', { name: 'Create Submanager', exact: true }),
  ).toHaveAttribute('aria-current', 'page');

  // The Owner picks the team; the login ID follows that Manager's ID.
  const create = page.locator('form').filter({ has: page.locator('input[name="suffix"]') });
  await create
    .locator('select[name="managerId"]')
    .selectOption({ label: `${manager} — Owner view parent` });
  await expect(create.getByTestId('submanager-prefix')).toHaveText(`${manager}S`);
  await create.locator('input[name="suffix"]').fill('B8');
  await create.locator('input[name="password"]').fill('Sub123!');
  await create.getByRole('button', { name: 'Create Submanager' }).click();
  const login = `${manager.toLowerCase()}sb8`;
  const row = page.getByTestId(`submanager-${login}`);
  await expect(row.getByTestId('submanager-manager')).toHaveText(manager.toUpperCase());

  await row.getByRole('button', { name: 'Suspend', exact: true }).click();
  await expect(row.getByTestId('account-status')).toHaveText('disabled');
  await row.getByRole('button', { name: 'Re-enable', exact: true }).click();
  await expect(row.getByTestId('account-status')).toHaveText('active');
  const passwordForm = row.locator('form').filter({ has: page.locator('input[name="password"]') });
  await passwordForm.locator('input[name="password"]').fill('Own123!');
  await passwordForm.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(passwordForm.getByRole('status')).toContainText('Saved');

  // The parent Manager sees the account the Owner made.
  await switchTo(page, manager.toLowerCase(), MANAGER_PASSWORD);
  await page.goto('/en/admin/submanagers');
  await expect(page.getByTestId(`submanager-${login}`)).toBeVisible();
  await switchTo(page, login, 'Own123!');
  await expect(page.getByTestId('staff-nav').getByRole('link')).toHaveCount(2);

  await switchTo(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/en/admin/submanagers');
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByTestId(`submanager-${login}`)
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await expect(page.getByTestId(`submanager-${login}`)).toHaveCount(0);
});

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
  const learner = await createLearner(page, { password: LEARNER_PASSWORD, company });
  await page.goto('/th/admin/learners');
  const href = await page
    .getByRole('link', { name: learner.toUpperCase(), exact: true })
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
