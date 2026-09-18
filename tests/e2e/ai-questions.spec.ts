import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { createConfirmedRecord, loginAs } from './helpers';

test('admin generates DBD-grounded draft questions with AI (fake), reviews the list and approves one', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  // The reference certificate the batch is modelled on (its values never reach the questions).
  const recordId = await createConfirmedRecord(page, {
    companyNameTh: 'บริษัท ต้นแบบเจน จำกัด',
    juristicId: '0105569000888',
    issuedOn: '13/07/2569',
  });
  await page.goto('/th/admin/questions');
  await page.getByTestId('generate-link').click();
  await expect(page).toHaveURL(/\/th\/admin\/questions\/generate$/);
  await page.getByTestId('reference-record').selectOption(recordId);
  await expect(page.getByTestId('reference-record').locator('option:checked')).toContainText(
    '0105569000888',
  );

  // Extra material + the seeded study cards; 4 questions, 3 personalised + 1 about the document.
  const picker = page.getByTestId('study-card-picker');
  if (await picker.isVisible()) await picker.locator('input[type="checkbox"]').first().check();
  await page.locator('textarea[name="pasted_text"]').fill('E2E material\nกรมพัฒนาธุรกิจการค้า');
  await page.locator('input[name="count"]').fill('4');
  await page.getByTestId('template-count').fill('3');
  await page.getByTestId('generate-submit').click();

  await page.waitForURL(/\/th\/admin\/questions\?batch=[0-9a-f-]{36}$/);
  await expect(page.getByTestId('batch-summary')).toContainText('4');
  const rows = page.locator('tr[data-testid^="question-ai-"]');
  await expect(rows).toHaveCount(4);
  await expect(rows.first().getByTestId('row-status')).toHaveText('draft');
  await expect(rows.first()).toContainText('en, th, zh');
  await expect(rows.first()).toContainText('dbd_template');
  await expect(rows.nth(2)).toContainText('dbd_template');
  await expect(rows.nth(3)).toContainText('generic');
  await expect(page.getByTestId('batch-summary')).toBeVisible();
  // No literal reference value leaked into any preview.
  await expect(page.locator('tbody')).not.toContainText('ต้นแบบเจน');
  await expect(page.locator('tbody')).not.toContainText('0105569000888');

  // Inline approve keeps the batch filter and flips the status.
  await rows.first().getByTestId('approve-row').click();
  await page.waitForURL(/\/th\/admin\/questions\?batch=[0-9a-f-]{36}$/);
  await expect(rows.first().getByTestId('row-status')).toHaveText('approved');
  await expect(rows.first().getByTestId('approve-row')).toHaveCount(0);

  // The generated question opens in the normal editor with all three languages filled.
  await rows.nth(1).getByRole('link').click();
  await page.waitForURL(/\/th\/admin\/questions\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('qloc-zh').locator('textarea[name="prompt"]')).not.toHaveValue('');
  await expect(page.getByTestId('fill-missing')).toHaveCount(0);
});

test('admin writes a Thai-only question and fills the other languages with AI (fake)', async ({
  page,
}) => {
  const key = `e2e-fill-${Date.now()}`;
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/questions/new');
  await page.locator('input[name="questionKey"]').fill(key);
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await page.waitForURL(/\/th\/admin\/questions\/[0-9a-f-]{36}$/);

  const th = page.getByTestId('qloc-th');
  await th
    .locator('textarea[name="prompt"]')
    .fill('เลขทะเบียนนิติบุคคลของบริษัทคือ {juristic_id} ใช่หรือไม่');
  await th.locator('input[name="option_A"]').fill('ใช่');
  await th.locator('input[name="option_B"]').fill('ไม่ใช่');
  await th.locator('select[name="correctKey"]').selectOption('A');
  await th.getByRole('button', { name: 'บันทึกภาษานี้' }).click();
  await expect(th.getByRole('status')).toBeVisible();

  await page.getByTestId('fill-missing').click();
  await expect(page.getByTestId('fill-done')).toContainText('2');
  await expect(page.getByTestId('qloc-en').locator('textarea[name="prompt"]')).toHaveValue(
    /\{juristic_id\}/,
  );
  await expect(page.getByTestId('qloc-zh').locator('input[name="option_A"]')).toHaveValue(/ใช่/);

  // Now approvable: three languages exist.
  await page.locator('select[name="status"]').selectOption('approved');
  await page.getByTestId('set-status').click();
  await expect(page.getByTestId('question-status')).toHaveText('approved');
});
