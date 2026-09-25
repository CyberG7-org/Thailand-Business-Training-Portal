import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompany, setPolicy } from './seed';

test('admin changes a policy; the learner dashboard follows and the audit log records the actor', async ({
  page,
}) => {
  const learner = await seedLearnerWithCompany('บริษัท นโยบายอีทูอี จำกัด', '2025-01-01');
  try {
    await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
    await page.goto('/th/admin/settings');
    const field = page.getByTestId('setting-require_exam_pass_for_bank_call');
    await field.locator('select[name="value"]').selectOption('false');
    await field.getByRole('button', { name: 'บันทึก' }).click();
    await expect(field.getByTestId('setting-saved')).toBeVisible();

    // Validation happens server-side: out-of-range values are refused.
    const mark = page.getByTestId('setting-exam_passing_mark_percent');
    await mark.locator('input[name="value"]').fill('150');
    await mark.locator('input[name="value"]').evaluate((el) => el.removeAttribute('max'));
    await mark.getByRole('button', { name: 'บันทึก' }).click();
    await expect(mark.getByTestId('setting-error')).toBeVisible();

    await page.goto('/th/admin/audit?entity=policy_config&id=require_exam_pass_for_bank_call');
    const row = page.locator('tr', { hasText: 'policy_config.update' }).first();
    // Codes are stored lower-case and shown upper-case (spec §3.3).
    await expect(row).toContainText(E2E_ADMIN.loginId.toUpperCase());
    await row.locator('summary').click();
    await expect(row.getByTestId('audit-diff').filter({ hasText: 'value' })).toContainText('false');
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();

    await loginAs(page, learner, E2E_PASSWORD);
    await expect(page.getByTestId('stage-bank-status')).toHaveText('พร้อมใช้งาน');
  } finally {
    await setPolicy('require_exam_pass_for_bank_call', true);
  }
});
