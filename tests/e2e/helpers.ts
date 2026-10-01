import { expect, type Locator, type Page } from '@playwright/test';

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

/**
 * Keeps the free code the form suggested (D69), or types `suffix` over it, and waits until the
 * field says the code is available.
 */
export async function fillLoginSuffix(scope: Page | Locator, suffix?: string) {
  const input = scope.getByTestId('login-suffix');
  // The suggestion lands first; typing before it would be overwritten when it arrives.
  await expect(input).not.toHaveValue('');
  if (suffix) await input.fill(suffix);
  await expect(scope.getByTestId('login-id-status')).toHaveAttribute('data-state', 'available');
}

/**
 * Picks the admin's team for a new learner by its code. Matched as the option's leading code,
 * not a substring: T-G4 must not pick T-G45.
 */
export async function selectTeam(page: Page, code: string) {
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const option = page
    .locator('select[name="managerId"] option')
    .filter({ hasText: new RegExp(`^${escaped}( —|$)`) });
  const value = (await option.getAttribute('value'))!;
  // A choice made before the page has hydrated never reaches React (the controlled select snaps
  // back), so choose until the login field shows the team's prefix.
  await expect(async () => {
    await page.locator('select[name="managerId"]').selectOption(value);
    await expect(page.getByTestId('login-id-prefix')).toHaveText(`${code}-`, { timeout: 1_000 });
  }).toPass();
}

/**
 * Creates a manager on the Managers page and returns their code as displayed, e.g. "T-A12": the
 * suggestion unless `suffix` is given.
 */
export async function createManager(
  page: Page,
  displayName: string,
  password: string,
  suffix?: string,
) {
  await page.goto('/th/admin/managers');
  // Every row carries a rename field of the same name, so scope to the create form.
  const form = page.locator('form:has([data-testid="create-manager"])');
  await fillLoginSuffix(form, suffix);
  await form.locator('input[name="displayName"]').fill(displayName);
  await form.locator('input[name="password"]').fill(password);
  await page.getByTestId('create-manager').click();
  const created = page.getByTestId('created-manager');
  await expect(created).toBeVisible();
  return (await created.textContent())!.match(/T-[A-Z0-9]+/)![0];
}

/**
 * Creates a learner on the Users page and returns their stored code, e.g. "t-a12-da42": the team's
 * code, a hyphen and the suggestion unless `suffix` is given (D69). `team` is required when the
 * caller is the admin.
 */
export async function createLearner(
  page: Page,
  fields: {
    password: string;
    displayName?: string;
    company: string;
    team?: string;
    suffix?: string;
    phone?: string;
    email?: string;
    website?: string;
    facebookPage?: string;
  },
): Promise<string> {
  await page.goto('/th/admin/users');
  if (fields.team) await selectTeam(page, fields.team);
  await fillLoginSuffix(page, fields.suffix);
  await page.locator('input[name="password"]').fill(fields.password);
  // The name is required (D66); a spec that does not care gets a placeholder.
  await page.locator('input[name="displayName"]').fill(fields.displayName ?? 'ผู้เรียนทดสอบ');
  // So are a phone and an email (D80).
  await page.locator('input[name="phone"]').fill(fields.phone ?? '081-234-5678');
  await page.locator('input[name="contactEmail"]').fill(fields.email ?? 'learner@example.co.th');
  if (fields.website) await page.locator('input[name="website"]').fill(fields.website);
  if (fields.facebookPage) {
    await page.locator('input[name="facebookPage"]').fill(fields.facebookPage);
  }
  const option = page.locator('select[name="dbdRecordId"] option', { hasText: fields.company });
  await page
    .locator('select[name="dbdRecordId"]')
    .selectOption((await option.getAttribute('value'))!);
  await page.getByRole('button', { name: 'สร้างผู้ใช้' }).click();
  const status = page.getByTestId('create-user-status');
  await expect(status).toBeVisible();
  return (await status.textContent())!.match(/T-[A-Z0-9]+-[A-Z0-9]+/)![0].toLowerCase();
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
