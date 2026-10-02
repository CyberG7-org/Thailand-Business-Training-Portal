import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompany } from './seed';

const ADDRESS = { head_office_address: '99/9 หมู่ 1 ตำบลตัวอย่าง อำเภอตัวอย่าง จังหวัดตัวอย่าง' };

/**
 * The name card screen (handoff, 06; D96): the preview card with the real PDF on a stage and the
 * download in its footer, and the blocked state as a notice in its place.
 */
test('the name card page shows the card on its stage with the download', async ({ page }) => {
  const learner = await seedLearnerWithCompany(
    'บริษัท นามบัตรดีไซน์ จำกัด',
    '2026-07-13',
    ADDRESS,
    {
      phone: '0812345678',
    },
  );
  await loginAs(page, learner, E2E_PASSWORD);
  await page.goto('/th/name-card');

  const preview = page.getByTestId('card-preview');
  await expect(preview).toBeVisible();
  await expect(preview.getByRole('heading', { name: 'ตัวอย่าง' })).toBeVisible();
  await expect(preview.getByTestId('card-stage').locator('iframe')).toHaveCount(1);
  await expect(preview.getByTestId('download-card')).toHaveAttribute('href', /name-cards/);
  await expect(page.getByTestId('card-blocked')).toHaveCount(0);
});

test('a blocked learner sees the reason as a notice and no card', async ({ page }) => {
  const learner = await seedLearnerWithCompany('บริษัท นามบัตรติดขัด จำกัด', '2026-07-13');
  await loginAs(page, learner, E2E_PASSWORD);
  await page.goto('/th/name-card');
  await expect(page.getByTestId('card-blocked')).toHaveAttribute('data-tone', 'warn');
  await expect(page.getByTestId('card-preview')).toHaveCount(0);
});

test('the name card page fits a phone', async ({ page }) => {
  const learner = await seedLearnerWithCompany(
    'บริษัท นามบัตรมือถือ จำกัด',
    '2026-07-13',
    ADDRESS,
    {
      phone: '0812345678',
    },
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, learner, E2E_PASSWORD);
  await page.goto('/th/name-card');
  await expect(page.getByTestId('download-card')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
