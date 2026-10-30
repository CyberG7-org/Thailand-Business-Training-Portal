import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { createManager, loginAs, switchTo } from './helpers';

const MANAGER_PASSWORD = 'Manage1!';

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
  // The header carries the app's name alone; the chip beside it names the owner.
  const header = page.getByTestId('shell-header');
  await expect(
    header.getByRole('link', { name: 'พอร์ทัลฝึกอบรมธุรกิจ', exact: true }),
  ).toBeVisible();
  await expect(header).not.toContainText('·');
  await expect(header).toContainText('เจ้าของ');
  await expect(header).not.toContainText('ผู้ดูแลระบบ');
  const nav = page.getByTestId('staff-nav');
  await expect(nav).toBeVisible();
  // The team's sections lead with Managers: a team is started before anything goes in it.
  await expect(nav.getByRole('link').first()).toHaveText('ผู้จัดการ');
  await expect(nav.getByRole('link').nth(1)).toHaveText('สร้างผู้เรียนและ DBD');
  await expect(nav.getByRole('link').nth(2)).toHaveText('สร้างผู้ช่วยผู้จัดการ');
  await expect(nav.getByRole('link').nth(3)).toHaveText('บันทึกผู้เรียน');
  for (const label of [
    'สร้างผู้เรียนและ DBD',
    'สร้างผู้ช่วยผู้จัดการ',
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
  await expect(nav).not.toContainText('สัมภาษณ์');
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
  const header = page.getByTestId('shell-header');
  await expect(
    header.getByRole('link', { name: 'พอร์ทัลฝึกอบรมธุรกิจ', exact: true }),
  ).toBeVisible();
  await expect(header).not.toContainText('·');
  await expect(header).toContainText('ผู้จัดการ');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ผู้จัดการ');
  const nav = page.getByTestId('staff-nav');
  await expect(
    nav.getByRole('link', { name: 'สร้างผู้ช่วยผู้จัดการ', exact: true }),
  ).toHaveAttribute('href', '/th/admin/submanagers');
  await expect(nav.getByRole('link')).toHaveText([
    'สร้างผู้เรียนและ DBD',
    'สร้างผู้ช่วยผู้จัดการ',
    'บันทึกผู้เรียน',
    'นัดหมายธนาคาร',
    'ข้อผิดพลาด',
  ]);
  await expect(page.getByTestId('admin-nav').getByRole('link')).toHaveText([
    'สร้างผู้เรียนและ DBD',
    'สร้างผู้ช่วยผู้จัดการ',
    'บันทึกผู้เรียน',
    'นัดหมายธนาคาร',
    'ข้อผิดพลาด',
  ]);
  await expect(nav).not.toContainText('ตั้งค่านโยบาย');
  await expect(nav.getByRole('link', { name: 'ผู้จัดการ', exact: true })).toHaveCount(0);
  await expect(nav).not.toContainText('การแจ้งเตือน');
});

test('the staff header follows the two-row mobile layout and keeps one accessible menu open', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/th/admin');

  const header = page.getByTestId('shell-header');
  const title = header.getByRole('link', { name: 'พอร์ทัลฝึกอบรมธุรกิจ', exact: true });
  const language = page.getByTestId('language-menu-button');
  const profile = page.getByTestId('staff-profile-trigger');
  await expect(header.getByText('BT', { exact: true })).toHaveCount(0);

  const [titleBox, languageBox, profileBox] = await Promise.all([
    title.boundingBox(),
    language.boundingBox(),
    profile.boundingBox(),
  ]);
  expect(languageBox?.width).toBe(140);
  expect(languageBox?.height).toBe(44);
  expect(profileBox?.width).toBe(140);
  expect(profileBox?.height).toBe(44);
  expect(languageBox!.x).toBeGreaterThan(titleBox!.x);
  expect(profileBox!.x).toBe(languageBox!.x);
  expect(profileBox!.y).toBeGreaterThan(languageBox!.y);

  await language.click();
  const listbox = page.getByRole('listbox', { name: 'ภาษา' });
  await expect(listbox).toBeVisible();
  expect((await listbox.boundingBox())?.width).toBe(140);
  await expect(listbox.getByRole('option')).toHaveText([
    'ไทย',
    'English',
    '简体中文',
    'தமிழ்',
    'Malay',
  ]);

  await page.keyboard.press('Escape');
  await expect(language).toBeFocused();
  await profile.click();
  const profileMenu = page.getByRole('menu', { name: 'โปรไฟล์' });
  await expect(profileMenu).toBeVisible();
  expect((await profileMenu.boundingBox())?.width).toBe(140);

  await language.focus();
  await page.keyboard.press('Enter');
  await expect(profileMenu).toBeHidden();
  await expect(listbox).toBeVisible();
  await page.keyboard.press('Escape');
  await profile.click();
  await page.keyboard.press('Escape');
  await expect(profileMenu).toBeHidden();
  await expect(profile).toBeFocused();

  await page.setViewportSize({ width: 1280, height: 900 });
  const [desktopLanguage, desktopProfile] = await Promise.all([
    language.boundingBox(),
    profile.boundingBox(),
  ]);
  expect(Math.abs(desktopLanguage!.y - desktopProfile!.y)).toBeLessThanOrEqual(1);
  expect(desktopProfile!.x).toBeGreaterThan(desktopLanguage!.x);
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
  await page.goto('/th/admin/users?tab=learner');
  expect(await background('select[name="dbdRecordId"]')).toBe('rgb(255, 255, 255)');
  await page.goto('/th/admin/managers');
  await expect(page.getByTestId('login-suffix')).not.toHaveValue('');
  expect(await background('[data-testid="login-suffix"]')).toBe('rgb(255, 255, 255)');
  await expect(page.getByTestId('login-id-prefix')).toHaveCount(0);
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

test('the appointment calendar is visible but inactive until a learner is chosen', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ผู้จัดการปฏิทินแล็ปท็อป', MANAGER_PASSWORD);
  await switchTo(page, code.toLowerCase(), MANAGER_PASSWORD);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/th/admin/appointments');
  await expect(page.getByTestId('appointment-learner')).toBeVisible();
  await expect(page.getByTestId('appointment-month')).toBeVisible();
  await expect(page.getByTestId('month-prev')).toBeDisabled();
  await expect(page.getByTestId('month-next')).toBeDisabled();
  await expect(page.locator('[data-testid^="appointment-date-"]:enabled')).toHaveCount(0);
});
