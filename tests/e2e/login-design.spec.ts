import { expect, test } from '@playwright/test';
import { E2E_LEARNER } from './fixtures';
import { login } from './helpers';

/**
 * The sign-in screen from the design handoff (Login.dc.html): the navy panel with the photo,
 * the five steps, the form card with a hint and a show/hide password control, and an error
 * that is announced and marks the fields.
 */
test('the login page shows the steps, the hint and a working show/hide password', async ({
  page,
}) => {
  await page.goto('/th/login');
  await expect(page.getByTestId('login-stages').getByRole('listitem')).toHaveCount(6);
  await expect(page.getByText('ใช้รหัสผู้ใช้และรหัสผ่านที่ได้รับจากผู้ดูแลระบบ')).toBeVisible();
  await expect(page.locator('img[src*="photo-skyline"]')).toHaveCount(1);

  const password = page.locator('input[name="password"]');
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'แสดงรหัสผ่าน' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'ซ่อนรหัสผ่าน' }).click();
  await expect(password).toHaveAttribute('type', 'password');
});

test('a wrong password is announced and marks both fields, since the message is generic', async ({
  page,
}) => {
  await login(page, E2E_LEARNER.loginId, 'wrong-password');
  const alert = page.getByTestId('login-error');
  await expect(alert).toHaveAttribute('role', 'alert');
  await expect(alert).toContainText('รหัสผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  await expect(page.locator('input[name="loginId"]')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('input[name="password"]')).toHaveAttribute('aria-invalid', 'true');
});

test('on a phone the band carries the language control and the steps list steps aside', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/th/login');
  await expect(page.getByTestId('language-toggle')).toBeVisible();
  await expect(page.getByTestId('login-stages')).toBeHidden();
  await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
