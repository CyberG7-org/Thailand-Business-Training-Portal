import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';

test('admin generates a batch of draft questions with AI (fake), reviews the list and approves one', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/questions');
  await page.getByTestId('generate-link').click();
  await expect(page).toHaveURL(/\/th\/admin\/questions\/generate$/);

  // Pasted material + the seeded study cards; 4 questions, 2 of them company-specific.
  const picker = page.getByTestId('study-card-picker');
  if (await picker.isVisible()) await picker.locator('input[type="checkbox"]').first().check();
  await page.locator('textarea[name="pasted_text"]').fill('E2E material\nกรมพัฒนาธุรกิจการค้า');
  await page.locator('input[name="count"]').fill('4');
  await page.locator('input[name="templateCount"]').fill('2');
  await page.getByTestId('generate-submit').click();

  await page.waitForURL(/\/th\/admin\/questions\?batch=[0-9a-f-]{36}$/);
  await expect(page.getByTestId('batch-summary')).toContainText('4');
  const rows = page.locator('tr[data-testid^="question-ai-"]');
  await expect(rows).toHaveCount(4);
  await expect(rows.first().getByTestId('row-status')).toHaveText('draft');
  await expect(rows.first()).toContainText('en, th, zh');
  await expect(rows.first()).toContainText('dbd_template');

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
