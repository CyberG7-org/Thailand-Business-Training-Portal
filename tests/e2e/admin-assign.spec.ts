import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { createConfirmedRecord, createLearner, loginAs } from './helpers';

test('a learner created for a confirmed record is assigned to it, with the +45-day date in Thai', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const company = `บริษัท มอบหมาย ${Date.now()} จำกัด`;
  await createConfirmedRecord(page, {
    companyNameTh: company,
    juristicId: '0105568233704',
    issuedOn: '13/07/2569',
  });

  const loginId = `e2e-assign-${Date.now()}`;
  await createLearner(page, { loginId, password: 'Learner-Pass-123', company });
  await page.getByRole('link', { name: loginId }).click();
  await expect(page.getByTestId('assigned-company')).toHaveText(company);
  await expect(page.getByTestId('available-from')).toContainText('27 สิงหาคม 2569');

  // An unconfirmed record is offered nowhere: the picker on the Users page lists it disabled.
  await page.goto('/th/admin/users');
  const options = page.locator('select[name="dbdRecordId"] option[disabled]');
  await expect(options.first()).toBeAttached();
});
