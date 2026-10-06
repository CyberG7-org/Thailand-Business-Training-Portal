import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { createManager, loginAs, openRecordTab, switchTo } from './helpers';

const CRON = { headers: { Authorization: 'Bearer local-cron-secret-for-dev' } };
const MANAGER_PASSWORD = 'Manager-Password-1!';
const pdf = readFileSync('tests/fixtures/three-pages.pdf');

/** A company zip as a manager would make it: the pack, invoices and agreements in folders, a link file. */
function companyZip(name: string): { name: string; mimeType: string; buffer: Buffer } {
  const bytes = zipSync({
    [`${name}/${name} dbd.pdf`]: new Uint8Array(pdf),
    [`${name}/invoice/invoice 1.pdf`]: new Uint8Array(pdf),
    [`${name}/invoice/invoice 2.pdf`]: new Uint8Array(pdf),
    [`${name}/invoice/invoice 3.pdf`]: new Uint8Array(pdf),
    [`${name}/agreement/agreement (1).pdf`]: new Uint8Array(pdf),
    [`${name}/links.txt`]: strToU8(
      'Facebook https://www.facebook.com/chayasritrade/ and the shop at www.chayasri.co.th',
    ),
    [`__MACOSX/${name}/._dbd.pdf`]: strToU8('junk'),
  });
  return { name: `${name}.zip`, mimeType: 'application/zip', buffer: Buffer.from(bytes) };
}

test('a manager uploads one zip: the browser sorts it, the reads fill the record, the invoices give the figures', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  // A manager of their own, so the companies list holds this company alone.
  const code = await createManager(page, 'ผู้จัดการแพ็กบริษัท', MANAGER_PASSWORD);
  await switchTo(page, code.toLowerCase(), MANAGER_PASSWORD);
  await page.goto('/th/admin/users?tab=companies');
  await page.getByRole('button', { name: 'เพิ่มบริษัทที่ไม่มีในรายการ' }).click();

  // What the zip holds, before anything is sent.
  const zipName = `pack-${Date.now()}`;
  await page.getByTestId('create-dbd-files').setInputFiles(companyZip(zipName));
  const preview = page.getByTestId('pack-preview');
  await expect(preview).toHaveAttribute('data-pack', '1');
  await expect(preview).toHaveAttribute('data-invoices', '3');
  await expect(preview).toHaveAttribute('data-agreements', '1');
  await expect(preview.getByTestId('pack-preview-facebook')).toContainText(
    'facebook.com/chayasritrade',
  );
  await expect(preview.getByTestId('pack-preview-website')).toContainText('chayasri.co.th');
  // No boxes to type into: the four details of D80 are gone.
  await expect(page.locator('[data-testid^="create-dbd-contact"]')).toHaveCount(0);
  await page.getByTestId('create-dbd-submit').click();
  await expect(page.getByTestId('create-dbd-status')).toBeVisible();

  // The cron reads the pack and the invoices; the record confirms itself (D80, D101).
  const first = await request.get('/api/cron/index', CRON);
  const summary = await first.json();
  expect(summary.extractions + summary.invoices).toBeGreaterThanOrEqual(1);
  // A second run drains whichever job the first one did not get to.
  await request.get('/api/cron/index', CRON);
  await page.goto('/th/admin/users?tab=companies');
  const status = page.locator('[data-testid^="company-status-"]').first();
  await expect(status).toHaveAttribute('data-status', 'confirmed_auto');

  // The record: the documents by group, the addresses, the figures.
  await page.getByTestId('companies').getByRole('link').first().click();
  await page.waitForURL(/\/th\/admin\/dbd-records\/[0-9a-f-]{36}/);
  await openRecordTab(page, 'documents');
  const documents = page.getByTestId('documents-card');
  await expect(documents.getByTestId('documents-invoice').locator('li')).toHaveCount(3);
  await expect(documents.getByTestId('documents-agreement').locator('li')).toHaveCount(1);
  await expect(documents.getByTestId('documents-pack').locator('li')).toHaveCount(1);
  await expect(page.getByTestId('record-links').locator('input[name="facebook_page"]')).toHaveValue(
    'https://www.facebook.com/chayasritrade',
  );
  await expect(page.getByTestId('record-links').locator('input[name="website"]')).toHaveValue(
    'https://www.chayasri.co.th',
  );

  await openRecordTab(page, 'interview');
  const figures = page.getByTestId('invoice-figures');
  // Three fake invoices on three days: 82,900 in all → 829,000 a month, 30 transactions.
  await expect(figures).toContainText('829,000');
  await expect(figures).toContainText('30');
  await expect(figures).toContainText('27,633');
  // Nothing to type: the asked amounts are gone, the fixed answers are there.
  await expect(page.locator('textarea[name="interview_monthly_revenue"]')).toHaveCount(0);
  await expect(page.getByTestId('fixed-answers')).toContainText('TikTok');
});
