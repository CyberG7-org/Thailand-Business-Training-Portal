import type { Page } from '@playwright/test';

/** Submits the login form without waiting — use when the outcome is a failed login. */
export async function login(page: Page, loginId: string, password: string) {
  await page.goto('/th/login');
  await page.locator('input[name="loginId"]').fill(loginId);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
}

/** Logs in and waits until the post-login redirect has completed (session cookies are set). */
export async function loginAs(page: Page, loginId: string, password: string) {
  await login(page, loginId, password);
  await page.waitForURL((url) => !/\/login$/.test(url.pathname));
}
