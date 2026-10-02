import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import {
  assignLearner,
  createConfirmedRecord,
  createManager,
  fillLoginSuffix,
  loginAs,
  selectCompany,
  selectTeam,
  switchTo,
} from './helpers';

const CRON = { headers: { Authorization: 'Bearer local-cron-secret-for-dev' } };
const MANAGER_PASSWORD = 'Manager-Password-1!';
const LEARNER_PASSWORD = 'Learner-Password-1!';
/** What the fake reader finds in any pack (lib/integrations/extraction/fake.ts). */
const READ_COMPANY = 'บริษัท ตัวอย่างการสกัด จำกัด';

/**
 * D80, D93: one page, two tabs in the order a manager works — the companies with a way to add
 * one, then the learner form; the company's pack and its four details go in one go, the reader
 * fills and indexes the rest, a clean record confirms itself, and "Assign learner" sends it
 * straight to the form. A company then shows its learner and is not given again.
 */
test('a manager creates a DBD in one go; it confirms itself and takes a learner', async ({
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

  await page.getByTestId('create-dbd-files').setInputFiles('tests/fixtures/tiny.pdf');
  await page.getByTestId('create-dbd-contact_email').fill('info@one-shot.co.th');
  await page.getByTestId('create-dbd-contact_phone').fill('02-123-4567');
  await page.getByTestId('create-dbd-nature_of_business').fill('ขายเสื้อผ้าออนไลน์');
  await page.getByTestId('create-dbd-products_services').fill('เสื้อผ้าสตรีนำเข้า');
  await page.getByTestId('create-dbd-submit').click();
  await expect(page.getByTestId('create-dbd-status')).toBeVisible();

  // Listed straight away while the reader works; then confirmed by the reader itself.
  const status = page.locator('[data-testid^="company-status-"]');
  await expect(status).toHaveCount(1);
  await expect(status).toHaveAttribute('data-status', 'reading');
  const run = await request.get('/api/cron/index', CRON);
  expect((await run.json()).extractions).toBeGreaterThanOrEqual(1);
  await page.goto('/th/admin/users?tab=companies');
  await expect(status).toHaveAttribute('data-status', 'confirmed_auto');
  await expect(status).toHaveText('ยืนยันอัตโนมัติแล้ว');

  // The record says who confirmed it — nobody by hand.
  await page.getByTestId('companies').getByRole('link', { name: READ_COMPANY }).click();
  await expect(page.getByTestId('record-status')).toHaveText('confirmed');
  await expect(page.getByTestId('confirmed-automatically')).toBeVisible();
  const recordId = new URL(page.url()).pathname.split('/').pop()!;

  // "Assign learner" on the company opens the learner form with it chosen.
  await page.goto('/th/admin/users');
  const row = page.getByTestId(`company-learner-${recordId}`);
  await expect(row).toHaveText('มอบหมายผู้เรียน');
  await assignLearner(page, recordId);
  await expect(page.locator('select[name="dbdRecordId"]')).toHaveValue(recordId);
  await expect(page.getByTestId('check-company')).toHaveAttribute('data-done', 'true');

  // The learner is created for it at once, with the contact details the manager gives.
  await fillLoginSuffix(page);
  await page.locator('input[name="password"]').fill(LEARNER_PASSWORD);
  await page.locator('input[name="displayName"]').fill('ผู้เรียนครบขั้นตอน');
  await page.locator('input[name="phone"]').fill('089-111-2222');
  await page.locator('input[name="contactEmail"]').fill('learner@one-shot.co.th');
  await page.locator('input[name="website"]').fill('one-shot.co.th');
  await page.locator('input[name="facebookPage"]').fill('oneshotshop');
  await page.getByRole('button', { name: 'สร้างผู้เรียน' }).click();
  const created = page.getByTestId('create-user-status');
  await expect(created).toBeVisible();
  const learner = (await created.textContent())!.match(/T-[A-Z0-9]+-[A-Z0-9]+/)![0].toLowerCase();

  // The company now names its learner and is not offered again: one company, one learner.
  await expect(page.locator('select[name="dbdRecordId"]')).toHaveValue('');
  await expect(
    page.locator(`select[name="dbdRecordId"] option[value="${recordId}"]`),
  ).toHaveAttribute('disabled', '');
  await expect(page.getByTestId('no-free-company')).toBeVisible();
  await page.getByTestId('tab-companies').click();
  await expect(row).toHaveText(learner.toUpperCase());
  await expect(page.getByTestId(`assign-learner-${recordId}`)).toHaveCount(0);

  await page.goto('/th/admin/learners');
  await expect(page.getByTestId(`company-${learner}`)).toHaveText(READ_COMPANY);
  await page.getByRole('link', { name: learner.toUpperCase(), exact: true }).click();
  const contact = page.getByTestId('contact-form');
  await expect(contact.locator('input[name="phone"]')).toHaveValue('0891112222');
  await expect(contact.locator('input[name="contactEmail"]')).toHaveValue('learner@one-shot.co.th');
  await expect(contact.locator('input[name="website"]')).toHaveValue('https://one-shot.co.th');
  await expect(contact.locator('input[name="facebookPage"]')).toHaveValue(
    'https://www.facebook.com/oneshotshop',
  );

  // The manager keeps them up to date from the learner's page.
  await contact.locator('input[name="phone"]').fill('0823334444');
  await contact.getByRole('button', { name: 'บันทึกข้อมูลติดต่อ' }).click();
  await expect(page.getByTestId('contact-saved')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('contact-form').locator('input[name="phone"]')).toHaveValue(
    '0823334444',
  );
});

test('the four details are checked before anything is uploaded', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ผู้จัดการลืมกรอก', MANAGER_PASSWORD);
  await switchTo(page, code.toLowerCase(), MANAGER_PASSWORD);
  await page.goto('/th/admin/users?tab=companies&add=1');

  await page.getByTestId('create-dbd-files').setInputFiles('tests/fixtures/tiny.pdf');
  await page.getByTestId('create-dbd-contact_email').fill('info@forgot.co.th');
  await page.getByTestId('create-dbd-contact_phone').fill('02-123-4567');
  await page.getByTestId('create-dbd-nature_of_business').fill('ขายเสื้อผ้าออนไลน์');
  // Past the browser's own check, the server still refuses an empty detail.
  await page
    .getByTestId('create-dbd-products_services')
    .evaluate((el) => el.removeAttribute('required'));
  await page.getByTestId('create-dbd-submit').click();
  await expect(page.getByTestId('create-dbd-error')).toContainText('สินค้าหรือบริการที่จะขาย');
  // Nothing was created.
  await expect(page.getByTestId('companies')).toContainText('ยังไม่มีบริษัท');
});

test('a learner needs a Thai mobile and an email', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/users?tab=learner');
  await expect(page.locator('input[name="phone"]')).toHaveAttribute('required', '');
  await expect(page.locator('input[name="contactEmail"]')).toHaveAttribute('required', '');
  await expect(page.locator('input[name="website"]')).not.toHaveAttribute('required', '');
  await expect(page.locator('input[name="facebookPage"]')).not.toHaveAttribute('required', '');
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
    issuedOn: '13/07/2569',
  });
  await switchTo(page, E2E_ADMIN.loginId, E2E_PASSWORD);

  // The owner opens the companies and assigns: the form arrives with the company and its team.
  await page.goto('/th/admin/users');
  await assignLearner(page, recordId);
  await expect(page.locator('select[name="dbdRecordId"]')).toHaveValue(recordId);
  await expect(page.getByTestId('login-id-prefix')).toHaveText(`${code}-`);
  await fillLoginSuffix(page);
  await page.locator('input[name="password"]').fill(LEARNER_PASSWORD);
  await page.locator('input[name="displayName"]').fill('ผู้เรียนคนแรก');
  await page.locator('input[name="phone"]').fill('081-234-5678');
  await page.locator('input[name="contactEmail"]').fill('first@example.co.th');
  await page.getByRole('button', { name: 'สร้างผู้เรียน' }).click();
  const created = page.getByTestId('create-user-status');
  await expect(created).toBeVisible();
  const first = (await created.textContent())!.match(/T-[A-Z0-9]+-[A-Z0-9]+/)![0];
  await page.getByTestId('tab-companies').click();
  await expect(page.getByTestId(`company-learner-${recordId}`)).toHaveText(first);

  // Offered as taken; and past the page's own check the server still refuses a second learner.
  await page.goto('/th/admin/users?tab=learner');
  const option = page.locator(`select[name="dbdRecordId"] option[value="${recordId}"]`);
  await expect(option).toHaveText(`${company} — มีผู้เรียนแล้ว`);
  await expect(option).toHaveAttribute('disabled', '');
  await selectTeam(page, code);
  await option.evaluate((el) => el.removeAttribute('disabled'));
  await selectCompany(page, company);
  await fillLoginSuffix(page);
  await page.locator('input[name="password"]').fill(LEARNER_PASSWORD);
  await page.locator('input[name="displayName"]').fill('ผู้เรียนคนที่สอง');
  await page.locator('input[name="phone"]').fill('081-234-5679');
  await page.locator('input[name="contactEmail"]').fill('second@example.co.th');
  // The button sleeps when no other company is free; wake it, as a forged request would.
  const create = page.getByRole('button', { name: 'สร้างผู้เรียน' });
  await create.evaluate((el) => el.removeAttribute('disabled'));
  await create.click();
  await expect(page.getByTestId('create-user-error')).toHaveText(
    'บริษัทนี้มีผู้เรียนแล้ว บริษัทหนึ่งแห่งมีผู้เรียนได้หนึ่งคน',
  );
  await expect(page.getByTestId('create-user-status')).toHaveCount(0);
});
