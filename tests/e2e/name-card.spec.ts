import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompany } from './seed';

const ADDRESS = { head_office_address: '99/9 หมู่ 1 ตำบลตัวอย่าง อำเภอตัวอย่าง จังหวัดตัวอย่าง' };

/**
 * The name card is made for the learner from what staff entered (D96): the name from the
 * documents, the phone from Create learner, the company from its record. The learner only sees
 * it and downloads it; the step is done before they open it.
 */
test("a learner's card is ready without typing: the step is done and the page shows the card", async ({
  page,
}) => {
  const learner = await seedLearnerWithCompany(
    'บริษัท นามบัตรอีทูอี จำกัด',
    '2026-07-13',
    ADDRESS,
    {
      phone: '0812345678',
    },
  );
  await loginAs(page, learner, E2E_PASSWORD);
  await expect(page.getByTestId('stage-nameCard-status')).toHaveText('เสร็จสิ้น');
  await page.getByTestId('stage-nameCard').getByRole('link', { name: 'เปิด' }).click();
  await expect(page).toHaveURL(/\/th\/name-card$/);

  const preview = page.getByTestId('card-preview');
  await expect(preview).toBeVisible();
  await expect(preview.getByTestId('card-meta')).toContainText('081-234-5678');
  // The layout's version is for the portal, not for the learner (D99).
  await expect(preview.getByTestId('card-meta')).not.toContainText('two-sided');
  await expect(page.getByTestId('download-card')).toHaveAttribute('href', /name-cards/);
  // Nothing to fill in and nothing to send: see it, download it.
  await expect(page.getByRole('main').getByRole('textbox')).toHaveCount(0);
  await expect(page.getByTestId('send-card')).toHaveCount(0);
});

test('a card waits for the record and the phone, and says what is missing', async ({ page }) => {
  const noAddress = await seedLearnerWithCompany(
    'บริษัท ไม่มีที่อยู่ จำกัด',
    '2026-07-13',
    {},
    {
      phone: '0812345678',
    },
  );
  await loginAs(page, noAddress, E2E_PASSWORD);
  await page.goto('/th/name-card');
  await expect(page.getByTestId('card-blocked')).toContainText('head_office_address');
  await expect(page.getByTestId('card-preview')).toHaveCount(0);

  await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
  const noPhone = await seedLearnerWithCompany('บริษัท ไม่มีเบอร์ จำกัด', '2026-07-13', ADDRESS);
  await loginAs(page, noPhone, E2E_PASSWORD);
  await expect(page.getByTestId('stage-nameCard-status')).toHaveText('พร้อมใช้งาน');
  await page.goto('/th/name-card');
  await expect(page.getByTestId('card-blocked')).toContainText('ยังไม่มีเบอร์มือถือของคุณ');
});
