import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { createLearner, createManager, loginAs, switchTo } from './helpers';

const CRON = { headers: { Authorization: 'Bearer local-cron-secret-for-dev' } };
const MANAGER_PASSWORD = 'Manager-Password-1!';
const LEARNER_PASSWORD = 'Learner-Password-1!';
/** What the fake reader finds in any pack (lib/integrations/extraction/fake.ts). */
const READ_COMPANY = 'บริษัท ตัวอย่างการสกัด จำกัด';

/**
 * D80: one page, two tabs — the learner form, and the companies with a way to add one; the
 * company's pack and its four details go in one go, the reader fills and indexes the rest, and a
 * clean record confirms itself — so "Use for learner" can send it straight to the form.
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
  // The learner form is the first tab; the companies are the second, counted; no learners list.
  await expect(page.getByTestId('tab-learner')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('input[name="displayName"]')).toBeVisible();
  await expect(page.getByTestId('tab-companies')).toContainText('0');
  await expect(page.locator('[data-testid^="progression-"]')).toHaveCount(0);
  // "Not listed?" opens the companies tab at its upload form.
  await page.getByRole('button', { name: 'เพิ่มในแท็บบริษัท (DBD)' }).click();
  await expect(page.getByTestId('tab-companies')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('companies')).toContainText('ยังไม่มีบริษัท');

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

  // The learner is created for it at once, with the contact details the manager gives.
  const learner = await createLearner(page, {
    password: LEARNER_PASSWORD,
    displayName: 'ผู้เรียนครบขั้นตอน',
    company: READ_COMPANY,
    phone: '089-111-2222',
    email: 'learner@one-shot.co.th',
    website: 'one-shot.co.th',
    facebookPage: 'oneshotshop',
  });
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
  await page.goto('/th/admin/users');
  await expect(page.locator('input[name="phone"]')).toHaveAttribute('required', '');
  await expect(page.locator('input[name="contactEmail"]')).toHaveAttribute('required', '');
  await expect(page.locator('input[name="website"]')).not.toHaveAttribute('required', '');
  await expect(page.locator('input[name="facebookPage"]')).not.toHaveAttribute('required', '');
});
