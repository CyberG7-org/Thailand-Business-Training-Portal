import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { createConfirmedRecord, createLearner, createManager, loginAs, switchTo } from './helpers';

const MANAGER_PASSWORD = 'Manager-Password-1!';

/**
 * The reassignment picker on a learner's page offers only companies the learner's own team may
 * study: their team's and the admin's untied ones. Another team's company must not be an option,
 * or one admin slip lets that team's manager reach a client that is not theirs.
 */
test('the admin cannot reassign a learner to another team company', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const teamA = await createManager(page, 'ทีมเอมอบหมาย', MANAGER_PASSWORD);
  const teamB = await createManager(page, 'ทีมบีมอบหมาย', MANAGER_PASSWORD);

  await switchTo(page, teamB.toLowerCase(), MANAGER_PASSWORD);
  const companyB = `บริษัท ของทีมบี ${Date.now()} จำกัด`;
  await createConfirmedRecord(page, {
    companyNameTh: companyB,
    juristicId: '0105568233717',
    issuedOn: '13/07/2569',
  });

  await switchTo(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const companyX = `บริษัท กลาง ${Date.now()} จำกัด`;
  await createConfirmedRecord(page, {
    companyNameTh: companyX,
    juristicId: '0105568233718',
    issuedOn: '13/07/2569',
  });
  const learner = await createLearner(page, {
    password: 'Learner-Password-1!',
    company: companyX,
    team: teamA,
  });

  await page.goto('/th/admin/users');
  await page.getByRole('link', { name: learner.toUpperCase() }).click();
  await expect(page.getByTestId('assigned-company')).toContainText(companyX);
  await page.getByRole('button', { name: 'ยกเลิกการมอบหมาย' }).click();

  const picker = page.locator('select[name="dbdRecordId"]');
  await expect(picker).toBeVisible();
  await expect(picker).toContainText(companyX);
  await expect(picker).not.toContainText(companyB);
});
