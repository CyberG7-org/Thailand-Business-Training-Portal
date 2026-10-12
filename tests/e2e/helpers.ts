import { expect, type Locator, type Page } from '@playwright/test';
import { seedCompanyRecord } from './seed';

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

/**
 * Opens a tab of a company's record page (details, interview, documents, exceptions). A click
 * before the page has hydrated does nothing, so it clicks until the tab says it is selected.
 */
export async function openRecordTab(
  page: Page,
  tab: 'details' | 'interview' | 'documents' | 'exceptions',
) {
  const button = page.getByTestId(`record-tab-${tab}`);
  await expect(async () => {
    await button.click();
    await expect(button).toHaveAttribute('aria-selected', 'true', { timeout: 1_000 });
  }).toPass();
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
 * not a substring: TG04 must not pick TG05.
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
    await expect(page.getByTestId('login-id-prefix')).toHaveText(code, { timeout: 1_000 });
  }).toPass();
}

/**
 * Creates a manager on the Managers page and returns their code as displayed, e.g. "TA12": the
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
  // The create waits for the Managers page to render again, which lists every team with its
  // counts: seconds on a local database that many runs have filled.
  await expect(created).toBeVisible({ timeout: 15_000 });
  const code = (await created.textContent())?.match(/T[A-Z][0-9]{2}/)?.[0];
  if (!code) throw new Error('Created manager did not show a login ID');
  return code;
}

/**
 * Chooses the company a new learner studies, by its name. The select is controlled, so a choice
 * made before the page has hydrated snaps back: choose until "Before you create" ticks it.
 */
export async function selectCompany(page: Page, company: string) {
  const option = page.locator('select[name="dbdRecordId"] option', { hasText: company });
  // A taken or unconfirmed company is listed but not sent with the form (D93).
  await expect(option).not.toHaveAttribute('disabled', '');
  const value = (await option.getAttribute('value'))!;
  await expect(async () => {
    await page.locator('select[name="dbdRecordId"]').selectOption(value);
    await expect(page.getByTestId('check-company')).toHaveAttribute('data-done', 'true', {
      timeout: 1_000,
    });
  }).toPass();
}

/**
 * Presses "Assign learner" on a company (D93) and waits for the learner form. A press before the
 * page has hydrated does nothing, so it presses again only while the companies tab still shows.
 */
export async function assignLearner(page: Page, recordId: string) {
  const learnerTab = page.getByTestId('tab-learner');
  await expect(async () => {
    if ((await learnerTab.getAttribute('aria-selected')) !== 'true') {
      await page.getByTestId(`assign-learner-${recordId}`).click({ timeout: 2_000 });
    }
    await expect(learnerTab).toHaveAttribute('aria-selected', 'true', { timeout: 3_000 });
  }).toPass();
}

/**
 * Creates a learner on the Users page and returns their stored code, e.g. "ta12da42": the team's
 * code plus the suggestion unless `suffix` is given (D69). `team` is required when the
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
  await page.goto('/th/admin/users?tab=learner');
  if (fields.team) await selectTeam(page, fields.team);
  await fillLoginSuffix(page, fields.suffix);
  await page.locator('input[name="password"]').fill(fields.password);
  await selectCompany(page, fields.company);
  // The learner's name is now read-only and comes from the company's first director.
  await expect(page.locator('input[name="displayName"]')).toHaveValue(/\S/);
  // So are a phone and an email (D80).
  await page.locator('input[name="phone"]').fill(fields.phone ?? '081-234-5678');
  await page.locator('input[name="contactEmail"]').fill(fields.email ?? 'learner@example.co.th');
  if (fields.website) await page.locator('input[name="website"]').fill(fields.website);
  if (fields.facebookPage) {
    await page.locator('input[name="facebookPage"]').fill(fields.facebookPage);
  }
  // The button wakes once the "Before you create" list is complete.
  await page.getByRole('button', { name: 'สร้างผู้เรียน' }).click();
  const status = page.getByTestId('create-user-status');
  await expect(status).toBeVisible();
  const code = (await status.textContent())?.match(/T[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}/)?.[0];
  if (!code) throw new Error('Created learner did not show a login ID');
  return code.toLowerCase();
}

export async function createConfirmedRecord(
  page: Page,
  fields: { companyNameTh: string; juristicId: string; issuedOn: string; team?: string },
): Promise<string> {
  const id = await seedCompanyRecord(fields);
  await page.goto(`/th/admin/dbd-records/${id}`);
  await expect(page.getByTestId('record-status')).toHaveText('confirmed');
  return id;
}
