import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { auditRowsFor, seedLearnerWithCompany, setPolicy } from './seed';

test('admin changes a policy; the learner dashboard follows and the audit log records the actor', async ({
  page,
}) => {
  const learner = await seedLearnerWithCompany('บริษัท นโยบายอีทูอี จำกัด', '2025-01-01');
  try {
    await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
    await page.goto('/th/admin/settings');
    const field = page.getByTestId('setting-require_exam_pass_for_interview');
    await field.locator('select[name="value"]').selectOption('false');
    await field.getByRole('button', { name: 'บันทึก' }).click();
    await expect(field.getByTestId('setting-saved')).toBeVisible();

    // Validation happens server-side: out-of-range values are refused.
    const mark = page.getByTestId('setting-mcq_pass_score');
    await mark.locator('input[name="value"]').fill('150');
    await mark.locator('input[name="value"]').evaluate((el) => el.removeAttribute('max'));
    await mark.getByRole('button', { name: 'บันทึก' }).click();
    await expect(mark.getByTestId('setting-error')).toBeVisible();

    // The change is recorded with the real actor (D30); there is no audit screen (D81).
    const [row] = await auditRowsFor({
      entityType: 'policy_config',
      entityId: 'require_exam_pass_for_interview',
      action: 'policy_config.update',
    });
    expect(row.actor_login_id).toBe(E2E_ADMIN.loginId);
    expect((row.after as { value: unknown }).value).toBe(false);
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();

    await loginAs(page, learner, E2E_PASSWORD);
    await expect(page.getByTestId('stage-interview-status')).toHaveText('เริ่ม');
  } finally {
    await setPolicy('require_exam_pass_for_interview', true);
  }
});
