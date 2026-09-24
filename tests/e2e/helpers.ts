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

/** Creates and confirms a DBD record through the admin UI; returns its id. Caller must be logged in as admin. */
/** The upload-first page keeps the manual form collapsed; open it before filling fields. */
export async function openManualRecordForm(page: Page) {
  await page.goto('/th/admin/dbd-records/new');
  await page.getByTestId('manual-form-toggle').click();
  await expect(page.locator('input[name="company_name_th"]')).toBeVisible();
}

/** Creates a learner on the Users page; `company` must be a confirmed record's Thai name. */
export async function createLearner(
  page: Page,
  fields: { loginId: string; password: string; displayName?: string; company: string },
): Promise<void> {
  await page.goto('/th/admin/users');
  await page.locator('input[name="loginId"]').fill(fields.loginId);
  await page.locator('input[name="password"]').fill(fields.password);
  if (fields.displayName) await page.locator('input[name="displayName"]').fill(fields.displayName);
  const option = page.locator('select[name="dbdRecordId"] option', { hasText: fields.company });
  await page
    .locator('select[name="dbdRecordId"]')
    .selectOption((await option.getAttribute('value'))!);
  await page.getByRole('button', { name: 'สร้างผู้ใช้' }).click();
  await expect(page.getByTestId('create-user-status')).toContainText(fields.loginId);
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
  await page.locator('input[name="interview_contact_email"]').fill('info@e2e.co.th');
  await page.locator('input[name="interview_contact_phone"]').fill('02-000-0000');
  await page.locator('textarea[name="interview_nature_of_business"]').fill('ขายเสื้อผ้าออนไลน์');
  await page.locator('textarea[name="interview_products_services"]').fill('เสื้อผ้าสตรีนำเข้า');
  await page.getByTestId('save-interview').click();
  await expect(page.getByTestId('interview-saved')).toBeVisible();
}
