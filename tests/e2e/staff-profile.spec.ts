import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { login, loginAs } from './helpers';
import { seedManager } from './seed';

test('the owner profile menu offers password change and sign out', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.getByTestId('staff-profile-trigger').click();
  await expect(page.getByRole('menuitem', { name: 'เปลี่ยนรหัสผ่าน' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'เปลี่ยนรหัสผ่าน' }).click();
  await expect(page).toHaveURL(/\/th\/admin\/profile$/);
  await page.getByTestId('staff-profile-trigger').click();
  await page.getByRole('menuitem', { name: 'ออกจากระบบ' }).click();
  await expect(page).toHaveURL(/\/th\/login$/);
});

test('a manager must know their current password to change it', async ({ page }) => {
  const manager = await seedManager('Password test manager');
  const nextPassword = 'Next123!';
  await loginAs(page, manager.loginId, E2E_PASSWORD);
  await page.getByTestId('staff-profile-trigger').click();
  await page.getByRole('menuitem', { name: 'เปลี่ยนรหัสผ่าน' }).click();

  const form = page.getByTestId('change-password-form');
  await form.locator('[name="currentPassword"]').fill('wrong-password');
  await form.locator('[name="newPassword"]').fill(nextPassword);
  await form.locator('[name="confirmPassword"]').fill(nextPassword);
  await form.getByRole('button', { name: 'บันทึกรหัสผ่านใหม่' }).click();
  await expect(form.getByRole('alert')).toHaveText('รหัสผ่านปัจจุบันไม่ถูกต้อง');

  await form.locator('[name="currentPassword"]').fill(E2E_PASSWORD);
  await form.getByRole('button', { name: 'บันทึกรหัสผ่านใหม่' }).click();
  await expect(form.getByRole('status')).toHaveText('เปลี่ยนรหัสผ่านแล้ว');
  await page.context().clearCookies();

  await login(page, manager.loginId, E2E_PASSWORD);
  await expect(page.getByTestId('login-error')).toBeVisible();
  await loginAs(page, manager.loginId, nextPassword);
  await expect(page).toHaveURL(/\/th\/admin$/);
});
