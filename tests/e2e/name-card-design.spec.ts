import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompany } from './seed';

/**
 * The name card screen from the design handoff (06): the form card with a 48px field and its
 * hint, the preview card with the real PDF on a stage and the actions in its footer, and the
 * blocked state as a notice in place of the form.
 */
test('the name card page shows the form card, then the preview card with its actions', async ({
  page,
}) => {
  const learner = await seedLearnerWithCompany('บริษัท นามบัตรดีไซน์ จำกัด', '2026-07-13', {
    head_office_address: '99/9 หมู่ 1 ตำบลตัวอย่าง อำเภอตัวอย่าง จังหวัดตัวอย่าง',
  });
  await loginAs(page, learner, E2E_PASSWORD);
  await page.goto('/th/name-card');

  const phone = page.locator('input[name="phone"]');
  const box = await phone.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
  await expect(page.getByTestId('card-preview')).toHaveCount(0);

  await phone.fill('081-234-5678');
  await page.getByTestId('generate-card').click();
  const preview = page.getByTestId('card-preview');
  await expect(preview).toBeVisible();
  await expect(preview.getByRole('heading', { name: 'ตัวอย่าง' })).toBeVisible();
  await expect(preview.getByTestId('card-stage').locator('iframe')).toHaveCount(1);
  await expect(preview.getByTestId('card-meta')).toContainText('081-234-5678');
  await expect(preview.getByTestId('download-card')).toHaveAttribute('href', /name-cards/);
  await expect(preview.getByTestId('send-card')).toBeVisible();
  await expect(page.getByTestId('generate-card')).toHaveText('สร้างเวอร์ชันใหม่');
});

test('a blocked learner sees the reason as a notice and no form', async ({ page }) => {
  const learner = await seedLearnerWithCompany('บริษัท นามบัตรติดขัด จำกัด', '2026-07-13');
  await loginAs(page, learner, E2E_PASSWORD);
  await page.goto('/th/name-card');
  await expect(page.getByTestId('card-blocked')).toHaveAttribute('data-tone', 'warn');
  await expect(page.locator('input[name="phone"]')).toHaveCount(0);
});

test('the name card page fits a phone', async ({ page }) => {
  const learner = await seedLearnerWithCompany('บริษัท นามบัตรมือถือ จำกัด', '2026-07-13', {
    head_office_address: '99/9 หมู่ 1 ตำบลตัวอย่าง อำเภอตัวอย่าง จังหวัดตัวอย่าง',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, learner, E2E_PASSWORD);
  await page.goto('/th/name-card');
  await expect(page.getByTestId('generate-card')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
