import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { createConfirmedRecord, createManager, loginAs, switchTo } from './helpers';
import { disableProfileOnly } from './seed';

const MANAGER_PASSWORD = 'Manager-Password-1!';

test('a manager lands in the admin area and sees only their own doors', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ผู้จัดการสิทธิ์', MANAGER_PASSWORD);
  await switchTo(page, code.toLowerCase(), MANAGER_PASSWORD);

  await expect(page).toHaveURL(/\/th\/admin$/);
  const nav = page.getByTestId('admin-nav');
  await expect(nav).toContainText('ข้อมูล DBD');
  await expect(nav).not.toContainText('ตั้งค่านโยบาย');
  await expect(nav).not.toContainText('บันทึกการใช้งาน');
  await expect(nav).not.toContainText('ผู้จัดการ');
});

test('typing an admin-only URL does not get a manager in', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ผู้จัดการลองพิมพ์', MANAGER_PASSWORD);
  await switchTo(page, code.toLowerCase(), MANAGER_PASSWORD);

  for (const path of ['settings', 'audit', 'notifications', 'managers']) {
    await page.goto(`/th/admin/${path}`);
    await expect(page, path).toHaveURL(/\/th\/admin$/);
  }
});

test('a record a manager uploads belongs to their team', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ผู้จัดการอัปโหลด', MANAGER_PASSWORD);
  const adminCompany = `บริษัท ของแอดมินเท่านั้น ${Date.now()} จำกัด`;
  await createConfirmedRecord(page, {
    companyNameTh: adminCompany,
    juristicId: '0105568233704',
    issuedOn: '13/07/2569',
  });

  await switchTo(page, code.toLowerCase(), MANAGER_PASSWORD);
  const ownCompany = `บริษัท ของทีม ${Date.now()} จำกัด`;
  await createConfirmedRecord(page, {
    companyNameTh: ownCompany,
    juristicId: '0105568233710',
    issuedOn: '13/07/2569',
  });

  // Their own record is still theirs after saving; the admin's is not visible at all.
  await page.goto('/th/admin/dbd-records');
  await expect(page.locator('tbody')).toContainText(ownCompany);
  await expect(page.locator('tbody')).not.toContainText(adminCompany);
});

test('a suspended manager loses the admin area on the next request', async ({ page, browser }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ผู้จัดการถูกระงับ', MANAGER_PASSWORD);

  const managerContext = await browser.newContext();
  const managerPage = await managerContext.newPage();
  await loginAs(managerPage, code.toLowerCase(), MANAGER_PASSWORD);
  await expect(managerPage).toHaveURL(/\/th\/admin$/);

  await page.goto('/th/admin/managers');
  await page.getByTestId(`manager-${code.toLowerCase()}`).getByTestId('toggle-status').click();
  await expect(page.getByTestId(`manager-${code.toLowerCase()}`)).toContainText('disabled');

  await managerPage.goto('/th/admin/dbd-records');
  await expect(managerPage).toHaveURL(/\/th\/login/);
  await managerContext.close();
});

/**
 * Suspending bans the auth user too, which the request-boundary guard catches on its own. This
 * disables only the profile row, so the JWT stays valid and nothing but the page guard — which
 * reads that row rather than the token — can turn the manager away.
 */
test('the page guard reads the profile row, not the token', async ({ page, browser }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ผู้จัดการโปรไฟล์', MANAGER_PASSWORD);

  const managerContext = await browser.newContext();
  const managerPage = await managerContext.newPage();
  await loginAs(managerPage, code.toLowerCase(), MANAGER_PASSWORD);
  await expect(managerPage).toHaveURL(/\/th\/admin$/);

  await disableProfileOnly(code.toLowerCase());

  await managerPage.goto('/th/admin/dbd-records');
  await expect(managerPage).toHaveURL(/\/th\/login/);
  await managerContext.close();
});
