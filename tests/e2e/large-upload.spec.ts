import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';

/** The three-page fixture with a 2 MB attachment: bigger than a server action may carry. */
async function twoMegabytePdf(): Promise<Buffer> {
  const doc = await PDFDocument.load(readFileSync('tests/fixtures/three-pages.pdf'));
  const noise = new Uint8Array(randomBytes(2 * 1024 * 1024)); // incompressible
  await doc.attach(noise, 'noise.bin', { mimeType: 'application/octet-stream' });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

test('a scanned pack of several megabytes uploads from the browser and is registered', async ({
  page,
}) => {
  const buffer = await twoMegabytePdf();
  expect(buffer.byteLength).toBeGreaterThan(1.5 * 1024 * 1024);
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/dbd-records/new');
  await page
    .getByTestId('upload-first-file')
    .setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer });
  await page.getByTestId('upload-first-submit').click();
  await page.waitForURL(/\/th\/admin\/dbd-records\/[0-9a-f-]{36}\?extraction=/);
  const item = page.getByTestId('document-list').locator('li').first();
  await expect(item).toContainText('scan.pdf');
  await expect(item).toContainText(/2\.\d MB/);
  await expect(page.getByTestId('index-status').first()).toHaveAttribute('data-status', 'queued');

  // A second file on the record page takes the same road.
  await page.locator('input[name="document"]').setInputFiles({
    name: 'scan-2.pdf',
    mimeType: 'application/pdf',
    buffer,
  });
  await page
    .getByRole('button', { name: /อัปโหลด/ })
    .first()
    .click();
  await expect(page.getByTestId('extract-status')).toBeVisible();
  await expect(page.getByTestId('document-list').locator('li')).toHaveCount(2);
});
