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
  '/th/admin/dbd-records',
  '/th/admin/content',
  '/th/admin/questions',
  '/th/admin/interviews',
  '/th/admin/appointments',
  '/th/admin/notifications',
  '/th/admin/settings',
  '/th/admin/audit',
  '/th/admin/managers',
];

test('the admin sees every section in the sidebar with the current one marked', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/users');
  const nav = page.getByTestId('staff-nav');
  await expect(nav).toBeVisible();
  for (const label of [
    'ผู้ใช้งาน',
    'ผู้จัดการ',
    'ข้อมูล DBD',
    'คลังคำถาม',
    'นัดหมายธนาคาร',
    'ตั้งค่านโยบาย',
  ]) {
    await expect(nav).toContainText(label);
  }
  await expect(nav.locator('[aria-current="page"]')).toHaveText(/ผู้ใช้งาน/);
  await page.goto('/th/admin/dbd-records');
  await expect(nav.locator('[aria-current="page"]')).toHaveText(/ข้อมูล DBD/);
});

test('a manager sees only the sections they may open', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ผู้จัดการแถบข้าง', MANAGER_PASSWORD);
  await switchTo(page, code.toLowerCase(), MANAGER_PASSWORD);
  const nav = page.getByTestId('staff-nav');
  await expect(nav).toContainText('ผู้ใช้งาน');
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
