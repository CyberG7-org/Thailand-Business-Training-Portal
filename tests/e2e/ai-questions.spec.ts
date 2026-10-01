import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';

test('the AI generation screen is hidden: its address leads back to the bank', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/questions/generate');
  await expect(page).toHaveURL(/\/th\/admin\/questions$/);
  await expect(page.getByTestId('generate-link')).toHaveCount(0);
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
