import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedManager, seedTeamLearner } from './seed';

test('deleting a DBD keeps its learner ready for another company', async ({ page }) => {
  const company = `บริษัท ลบดีบีดี ${Date.now()} จำกัด`;
  const manager = await seedManager('ผู้จัดการลบดีบีดี');
  const learner = await seedTeamLearner(manager.id, company, '2026-01-05');
  await loginAs(page, manager.loginId, E2E_PASSWORD);

  await page.goto('/th/admin/users');
  const companyRow = page.getByRole('row').filter({ hasText: company });
  page.once('dialog', (dialog) => dialog.accept());
  await companyRow.getByRole('button', { name: 'ลบบริษัท' }).click();
  await expect(page.getByRole('row').filter({ hasText: company })).toHaveCount(0);

  await page.goto('/th/admin/learners');
  const ready = page.getByTestId(`company-${learner}`).getByRole('link', {
    name: 'พร้อมมอบหมาย',
  });
  await expect(ready).toBeVisible();
  await ready.click();
  await expect(page).toHaveURL(/\/th\/admin\/users\?add=1/);
  await expect(page.getByTestId('create-dbd-files')).toBeVisible();
});

test('deleting a learner leaves their company ready for another learner', async ({ page }) => {
  const company = `บริษัท ลบผู้เรียน ${Date.now()} จำกัด`;
  const manager = await seedManager('ผู้จัดการลบผู้เรียน');
  const learner = await seedTeamLearner(manager.id, company, '2026-01-05');
  await loginAs(page, manager.loginId, E2E_PASSWORD);

  await page.goto('/th/admin/learners');
  const learnerRow = page.getByTestId(`learner-${learner}`);
  page.once('dialog', (dialog) => dialog.accept());
  await learnerRow.getByRole('button', { name: 'ลบผู้เรียน' }).click();
  await expect(page.getByTestId(`learner-${learner}`)).toHaveCount(0);

  await page.goto('/th/admin/users');
  const companyRow = page.getByRole('row').filter({ hasText: company });
  await expect(companyRow.getByRole('button', { name: 'มอบหมายผู้เรียน' })).toBeVisible();
});
