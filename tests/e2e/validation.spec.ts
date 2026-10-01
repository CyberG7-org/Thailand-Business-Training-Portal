import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { createManager, loginAs, switchTo } from './helpers';
import { seedLearnerWithCompleteCompany, setProvenance } from './seed';

test('a low-confidence fact waits for a person; confirming it accepts the record and the queue empties', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const company = `บริษัท ความมั่นใจต่ำ ${Date.now()} จำกัด`;
  const learner = await seedLearnerWithCompleteCompany(company);
  // The seeded record is confirmed; make its capital look read with low confidence and unconfirm it.
  const recordId = await setProvenance(learner, { registered_capital: 0.6 });

  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto(`/th/admin/dbd-records/${recordId}?tab=exceptions`);
  await page.getByTestId('recheck-button').click();
  await expect(page.getByTestId('exception-low_confidence-registered_capital')).toBeVisible();
  await expect(page.getByTestId('acceptance-state')).toHaveAttribute('data-blockers', '1');

  await page.goto('/th/admin/exceptions');
  await expect(page.getByTestId(`queue-${recordId}`)).toHaveAttribute(
    'data-kind',
    'low_confidence',
  );

  await page.goto(`/th/admin/dbd-records/${recordId}?tab=exceptions`);
  const row = page.getByTestId('exception-low_confidence-registered_capital');
  await row.locator('input[name="note"]').fill('ตรงกับหนังสือรับรอง');
  await row.getByTestId('exception-confirm').click();
  await expect(page.getByTestId('record-status')).toHaveText('confirmed');
  await expect(page.getByTestId('exceptions-none')).toBeVisible();
  // Checking again also read the address and mapped the category, so the accepted sheet may
  // be a newer version than the seeded one; what matters is that a version is active.
  await expect(page.getByTestId('training-versions')).toHaveAttribute('data-active', /^[1-9]\d*$/);

  await page.goto('/th/admin/exceptions');
  await expect(page.getByTestId(`queue-${recordId}`)).toHaveCount(0);
});

test('a manager sees only their own team in the queue', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const company = `บริษัท ทีมอื่น ${Date.now()} จำกัด`;
  const learner = await seedLearnerWithCompleteCompany(company);
  const recordId = await setProvenance(learner, { registered_capital: 0.6 });
  await page.goto(`/th/admin/dbd-records/${recordId}?tab=exceptions`);
  await page.getByTestId('recheck-button').click();
  await expect(page.getByTestId('exception-low_confidence-registered_capital')).toBeVisible();
  await page.goto('/th/admin/exceptions');
  await expect(page.getByTestId(`queue-${recordId}`)).toBeVisible();

  const code = await createManager(page, 'ผู้จัดการคิวข้อยกเว้น', 'Manager-Password-1!');
  await switchTo(page, code.toLowerCase(), 'Manager-Password-1!');
  await page.goto('/th/admin/exceptions');
  await expect(page.getByTestId(`queue-${recordId}`)).toHaveCount(0);
});
