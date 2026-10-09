import { expect, test } from '@playwright/test';
import { companyZip } from './company-zip';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import {
  assignLearner,
  createConfirmedRecord,
  createManager,
  fillLoginSuffix,
  loginAs,
  switchTo,
} from './helpers';

const CRON = { headers: { Authorization: 'Bearer local-cron-secret-for-dev' } };
const MANAGER_PASSWORD = 'Manager-Password-1!';
const LEARNER_PASSWORD = 'Learn123';

/**
 * D80, D93: one page, two tabs in the order a manager works — the companies with a way to add
 * one, then the learner form. A ZIP with a page URL is accepted for reading; a page that cannot
 * be read must not cause the company to be confirmed automatically.
 */
test('a manager uploads a DBD ZIP and an unreadable business page needs review', async ({
  page,
  request,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ผู้จัดการสร้างครบ', MANAGER_PASSWORD);
  await switchTo(page, code.toLowerCase(), MANAGER_PASSWORD);

  await page.goto('/th/admin/users');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('สร้างผู้เรียนและ DBD');
  // The companies come first, counted; the learner form is the second tab; no learners list.
  const tabs = page.getByRole('tab');
  await expect(tabs.first()).toHaveAttribute('data-testid', 'tab-companies');
  await expect(page.getByTestId('tab-companies')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('tab-companies')).toContainText('0');
  await expect(page.getByTestId('companies')).toContainText('ยังไม่มีบริษัท');
  await expect(page.locator('[data-testid^="progression-"]')).toHaveCount(0);
  // "Not listed?" on the learner form opens the companies tab at its upload form.
  await page.getByTestId('tab-learner').click();
  await expect(page.locator('input[name="displayName"]')).toBeVisible();
  await page.getByRole('button', { name: 'เพิ่มในแท็บบริษัท (DBD)' }).click();
  await expect(page.getByTestId('tab-companies')).toHaveAttribute('aria-selected', 'true');

  await page.getByTestId('create-dbd-files').setInputFiles(companyZip());
  // No details to type (D101): what the company does is read from the pack.
  await expect(page.locator('[data-testid^="create-dbd-contact"]')).toHaveCount(0);
  await page.getByTestId('create-dbd-submit').click();
  await expect(page.getByTestId('create-dbd-status')).toBeVisible();

  // Listed straight away while the reader works; the placeholder page has no business evidence.
  const status = page.locator('[data-testid^="company-status-"]');
  await expect(status).toHaveCount(1);
  await expect(status).toHaveAttribute('data-status', 'reading');
  const run = await request.get('/api/cron/index', CRON);
  expect((await run.json()).extractions).toBeGreaterThanOrEqual(1);
  await page.goto('/th/admin/users?tab=companies');
  await expect(status).toHaveAttribute('data-status', 'attention');
  await page.getByTestId('companies').getByRole('link').first().click();
  await expect(page.getByTestId('record-status')).not.toHaveText('confirmed');
});

test('a learner needs a Thai mobile and an email', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/users?tab=learner');
  await expect(page.locator('input[name="phone"]')).toHaveAttribute('required', '');
  await expect(page.locator('input[name="contactEmail"]')).toHaveAttribute('required', '');
  // The website and the Facebook page come from the company zip now (D101).
  await expect(page.locator('input[name="website"]')).toHaveCount(0);
  await expect(page.locator('input[name="facebookPage"]')).toHaveCount(0);
});

test("the owner's Assign learner chooses the company's team too; a company takes one learner", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const company = `บริษัท หนึ่งต่อหนึ่ง ${Date.now()} จำกัด`;
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ทีมหนึ่งต่อหนึ่ง', MANAGER_PASSWORD);
  await switchTo(page, code.toLowerCase(), MANAGER_PASSWORD);
  const recordId = await createConfirmedRecord(page, {
    companyNameTh: company,
    juristicId: '0105568233704',
    team: code,
    issuedOn: '13/07/2569',
  });
  await switchTo(page, E2E_ADMIN.loginId, E2E_PASSWORD);

  // The owner opens the companies and assigns: the form arrives with the company and its team.
  await page.goto('/th/admin/users');
  await assignLearner(page, recordId);
  await expect(page.locator('select[name="dbdRecordId"]')).toHaveValue(recordId);
  await expect(page.getByTestId('login-id-prefix')).toHaveText(code);
  await fillLoginSuffix(page);
  await page.locator('input[name="password"]').fill(LEARNER_PASSWORD);
  await expect(page.locator('input[name="displayName"]')).toHaveValue('E2E Learner');
  await page.locator('input[name="phone"]').fill('081-234-5678');
  await page.locator('input[name="contactEmail"]').fill('first@example.co.th');
  await page.getByRole('button', { name: 'สร้างผู้เรียน' }).click();
  const created = page.getByTestId('create-user-status');
  await expect(created).toBeVisible();
  const first = (await created.textContent())!.match(/T[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}/)![0];
  await page.getByTestId('tab-companies').click();
  await expect(page.getByTestId(`company-learner-${recordId}`)).toHaveText(first);

  // Assigned companies are removed from the picker entirely.
  await page.goto('/th/admin/users?tab=learner');
  const option = page.locator(`select[name="dbdRecordId"] option[value="${recordId}"]`);
  await expect(option).toHaveCount(0);
});
