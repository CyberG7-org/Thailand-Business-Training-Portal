import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { createManager, loginAs, switchTo } from './helpers';

const MANAGER_PASSWORD = 'Manager-Password-1!';

/**
 * The staff shell: the navy band with the glass header, a sidebar that names every section the
 * caller may open and marks the current one, and pages on the dot grid in white cards. On a
 * phone the sidebar becomes a scrolling strip and nothing overflows sideways.
 */
const LIST_PAGES = [
  '/th/admin',
  '/th/admin/users',
  '/th/admin/learners',
  '/th/admin/questions',
  '/th/admin/interviews',
  '/th/admin/appointments',
  '/th/admin/notifications',
  '/th/admin/settings',
  '/th/admin/managers',
];

test('the admin sees every section in the sidebar with the current one marked', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/users');
  // The header names the owner as the owner, title and chip alike.
  const header = page.getByTestId('shell-header');
  await expect(header).toContainText('พอร์ทัลฝึกอบรมธุรกิจ · เจ้าของ');
  await expect(header).not.toContainText('ผู้ดูแลระบบ');
  const nav = page.getByTestId('staff-nav');
  await expect(nav).toBeVisible();
  // The team's sections lead with Managers: a team is started before anything goes in it.
  await expect(nav.getByRole('link').first()).toHaveText('ผู้จัดการ');
  await expect(nav.getByRole('link').nth(1)).toHaveText('สร้างผู้เรียนและ DBD');
  await expect(nav.getByRole('link').nth(2)).toHaveText('บันทึกผู้เรียน');
  for (const label of [
    'สร้างผู้เรียนและ DBD',
    'บันทึกผู้เรียน',
    'ผู้จัดการ',
    'คลังคำถาม',
    'นัดหมายธนาคาร',
    'ตั้งค่านโยบาย',
  ]) {
    await expect(nav).toContainText(label);
  }
  // DBD records left the sidebar: their list is on "Create learner & DBD" (D80).
  await expect(nav).not.toContainText('ข้อมูล DBD');
  await expect(nav.locator('[aria-current="page"]')).toHaveText(/สร้างผู้เรียนและ DBD/);
  // The old address forwards there.
  await page.goto('/th/admin/dbd-records');
  await expect(page).toHaveURL(/\/th\/admin\/users/);
  await expect(nav.locator('[aria-current="page"]')).toHaveText(/สร้างผู้เรียนและ DBD/);
  await page.goto('/th/admin/learners');
  await expect(nav.locator('[aria-current="page"]')).toHaveText(/^บันทึกผู้เรียน$/);
  // The home page is headed with the owner's role, not "Administration".
  await page.goto('/th/admin');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('เจ้าของ');
});

test('a manager sees only the sections they may open', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ผู้จัดการแถบข้าง', MANAGER_PASSWORD);
  await switchTo(page, code.toLowerCase(), MANAGER_PASSWORD);
  await expect(page.getByTestId('shell-header')).toContainText('พอร์ทัลฝึกอบรมธุรกิจ · ผู้จัดการ');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ผู้จัดการ');
  const nav = page.getByTestId('staff-nav');
  await expect(nav.getByRole('link').first()).toHaveText('สร้างผู้เรียนและ DBD');
  await expect(nav).toContainText('สร้างผู้เรียนและ DBD');
  await expect(nav).toContainText('บันทึกผู้เรียน');
  await expect(nav).toContainText('ผลสัมภาษณ์ความพร้อม');
  await expect(nav).not.toContainText('ตั้งค่านโยบาย');
  await expect(nav).not.toContainText('ผู้จัดการ');
  await expect(nav).not.toContainText('การแจ้งเตือน');
});

test('every list page fits a phone', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of LIST_PAGES) {
    await page.goto(path);
    await expect(page.getByTestId('staff-nav'), path).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test('a select and the typed code are drawn editable; only the fixed prefix is not', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const background = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.goto('/th/admin/users');
  expect(await background('select[name="dbdRecordId"]')).toBe('rgb(255, 255, 255)');
  await page.goto('/th/admin/managers');
  await expect(page.getByTestId('login-suffix')).not.toHaveValue('');
  expect(await background('[data-testid="login-suffix"]')).toBe('rgb(255, 255, 255)');
  expect(await background('[data-testid="login-id-prefix"]')).not.toBe('rgb(255, 255, 255)');
});

test('small buttons are tappable and readable on a phone', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/th/admin/settings');
  const buttons = page.locator('button.staff-btn-sm');
  expect(await buttons.count()).toBeGreaterThan(0);
  for (const button of await buttons.all()) {
    expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    const size = await button.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(14);
  }
});

test('manager row actions are buttons a thumb can hit', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await createManager(page, 'ผู้จัดการปุ่มแถว', MANAGER_PASSWORD);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/th/admin/managers');
  // Every row carries the same controls; one row proves their size without measuring a long list.
  const buttons = page.locator('tbody tr').first().locator('button');
  expect(await buttons.count()).toBeGreaterThan(0);
  for (const button of await buttons.all()) {
    expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test('the team filter stays on one row on a laptop', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/th/admin/appointments');
  const select = await page.getByTestId('team-filter').boundingBox();
  const button = await page.locator('form:has(#team-filter) button').boundingBox();
  expect(select && button && Math.abs(select.y - button.y)).toBeLessThan(2);
});
