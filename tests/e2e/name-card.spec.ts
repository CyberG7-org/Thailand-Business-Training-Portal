import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompany, setPolicy } from './seed';

test('learner creates a Thai name card from the company record, previews the PDF and queues it to Telegram', async ({
  page,
}) => {
  await setPolicy('telegram_admin_chat_ids', ['e2e-chat']);
  const learner = await seedLearnerWithCompany('บริษัท นามบัตรอีทูอี จำกัด', '2026-07-13', {
    head_office_address: '99/9 หมู่ 1 ตำบลตัวอย่าง อำเภอตัวอย่าง จังหวัดตัวอย่าง',
  });
  await loginAs(page, learner, E2E_PASSWORD);
  await expect(page.getByTestId('stage-nameCard-status')).toHaveText('พร้อมใช้งาน');
  await page.getByTestId('stage-nameCard').getByRole('link', { name: 'เปิด' }).click();
  await expect(page).toHaveURL(/\/th\/name-card$/);

  // Invalid phone is rejected before anything is rendered.
  await page.locator('input[name="phone"]').fill('12345');
  await page.getByTestId('generate-card').click();
  await expect(page.getByTestId('name-card-error')).toContainText('เบอร์มือถือ');

  await page.locator('input[name="phone"]').fill('+66 81 234 5678');
  await page.getByTestId('generate-card').click();
  await expect(page.getByTestId('card-preview')).toBeVisible();
  await expect(page.getByTestId('download-card')).toHaveAttribute('href', /name-cards/);
  await expect(page.getByText('081-234-5678').first()).toBeVisible();

  await page.getByTestId('send-card').click();
  await expect(page.getByTestId('card-sent')).toContainText('1');

  await page.goto('/th/dashboard');
  await expect(page.getByTestId('stage-nameCard-status')).toHaveText('เสร็จสิ้น');
});

test('a learner whose record lacks the address cannot generate a card', async ({ page }) => {
  const learner = await seedLearnerWithCompany('บริษัท ไม่มีที่อยู่ จำกัด', '2026-07-13');
  await loginAs(page, learner, E2E_PASSWORD);
  await page.goto('/th/name-card');
  await expect(page.getByTestId('card-blocked')).toContainText('head_office_address');
  await expect(page.getByTestId('generate-card')).toHaveCount(0);
});
