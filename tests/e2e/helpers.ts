import { expect, type Page } from '@playwright/test';

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

/**
 * Signs the current user out, then in as someone else. `loginAs` alone cannot switch: the login
 * page redirects an already-authenticated visitor away, so its form is never there to fill.
 */
export async function switchTo(page: Page, loginId: string, password: string) {
  // Clearing cookies rather than clicking sign-out: the redirect to /login resolves before the
  // cleared session cookie has landed, so the next sign-in can still be seen as the old user.
  await page.context().clearCookies();
  await loginAs(page, loginId, password);
}

/** Creates and confirms a DBD record through the admin UI; returns its id. Caller must be logged in as admin. */
/** The upload-first page keeps the manual form collapsed; open it before filling fields. */
export async function openManualRecordForm(page: Page) {
  await page.goto('/th/admin/dbd-records/new');
  await page.getByTestId('manual-form-toggle').click();
  await expect(page.locator('input[name="company_name_th"]')).toBeVisible();
}

/** Creates a manager on the Managers page and returns their allocated code, e.g. "T01". */
export async function createManager(page: Page, displayName: string, password: string) {
  await page.goto('/th/admin/managers');
  // Every row carries a rename field of the same name, so scope to the create form.
  const form = page.locator('form:has([data-testid="create-manager"])');
  await form.locator('input[name="displayName"]').fill(displayName);
  await form.locator('input[name="password"]').fill(password);
  await page.getByTestId('create-manager').click();
  const created = page.getByTestId('created-manager');
  await expect(created).toBeVisible();
  return (await created.textContent())!.match(/T\d+/)![0];
}

/**
 * Creates a learner on the Users page and returns their allocated code, e.g. "t01-01". The code
 * is allocated, never typed (spec §3.3); `team` is required when the caller is the admin.
 */
export async function createLearner(
  page: Page,
  fields: { password: string; displayName?: string; company: string; team?: string },
): Promise<string> {
  await page.goto('/th/admin/users');
  if (fields.team) {
    const teamOption = page.locator('select[name="managerId"] option', { hasText: fields.team });
    await page
      .locator('select[name="managerId"]')
      .selectOption((await teamOption.getAttribute('value'))!);
  }
  await page.locator('input[name="password"]').fill(fields.password);
  if (fields.displayName) await page.locator('input[name="displayName"]').fill(fields.displayName);
  const option = page.locator('select[name="dbdRecordId"] option', { hasText: fields.company });
  await page
    .locator('select[name="dbdRecordId"]')
    .selectOption((await option.getAttribute('value'))!);
  await page.getByRole('button', { name: 'สร้างผู้ใช้' }).click();
  const status = page.getByTestId('create-user-status');
  await expect(status).toBeVisible();
  return (await status.textContent())!.match(/T\d+-\d+/)![0].toLowerCase();
}

export async function createConfirmedRecord(
  page: Page,
  fields: { companyNameTh: string; juristicId: string; issuedOn: string },
): Promise<string> {
  await openManualRecordForm(page);
  await page.locator('input[name="company_name_th"]').fill(fields.companyNameTh);
  await page.locator('input[name="juristic_id"]').fill(fields.juristicId);
  await page.locator('input[name="issued_on"]').fill(fields.issuedOn);
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await page.waitForURL(/\/th\/admin\/dbd-records\/[0-9a-f-]{36}$/);
  await fillBusinessAnswers(page);
  await page.getByRole('button', { name: 'ยืนยันข้อมูล' }).click();
  await expect(page.getByTestId('record-status')).toHaveText('confirmed');
  return page.url().split('/').pop()!;
}

/**
 * The four answers the DBD pack cannot supply. A record cannot be confirmed without them, so
 * every fixture that confirms one writes them first.
 */
export async function fillBusinessAnswers(page: Page): Promise<void> {
  const form = page.locator('form:has(input[name="juristic_id"])');
  await form.locator('input[name="interview_contact_email"]').fill('info@e2e.co.th');
  await form.locator('input[name="interview_contact_phone"]').fill('02-000-0000');
  await form.locator('textarea[name="interview_nature_of_business"]').fill('ขายเสื้อผ้าออนไลน์');
  await form.locator('textarea[name="interview_products_services"]').fill('เสื้อผ้าสตรีนำเข้า');
  await form.getByRole('button', { name: 'บันทึก' }).click();
  await expect(form.getByRole('status')).toContainText('บันทึกแล้ว');
}
