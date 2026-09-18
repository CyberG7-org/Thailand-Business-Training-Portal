import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompany } from './seed';

test('starter cards, interview answers and the learner role combine into a personalised study card', async ({
  page,
}) => {
  const learner = await seedLearnerWithCompany('บริษัท สัมภาษณ์ธนาคาร จำกัด', '2025-01-01', {
    head_office_address: '12/34 ถนนทดสอบ',
    province: 'กรุงเทพมหานคร',
    registered_capital: 1000000,
    directors: [{ name_th: 'นางสาวผู้เรียน ทดสอบ', name_en: null }],
    structured_data: {
      business: {
        objectives: [{ no: 1, text: 'ประกอบกิจการค้าปลีก' }],
        business_categories: ['ค้าปลีก'],
        share_structure: {
          total_shares: 10000,
          par_value: 100,
          paid_up_capital: null,
          share_type: null,
        },
        shareholders: [
          { name: 'นางสาวผู้เรียน ทดสอบ', nationality: 'ไทย', shares: 9998, percent: null },
          { name: 'นายอื่น ทดสอบ', nationality: 'ไทย', shares: 2, percent: null },
        ],
        promoters: [],
      },
    },
  });

  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);

  // Starter cards load once; a second click adds nothing.
  await page.goto('/th/admin/content');
  await page.getByTestId('load-starter-cards').click();
  await expect(page.getByTestId('starter-loaded')).toBeVisible();
  await expect(page.locator('tbody')).toContainText('bank-interview-1-identity');
  await page.getByTestId('load-starter-cards').click();
  await expect(page.getByTestId('starter-loaded')).toContainText('0');

  // Company-level interview answers on the record.
  await page.goto('/th/admin/dbd-records');
  await page.getByRole('link', { name: 'บริษัท สัมภาษณ์ธนาคาร จำกัด' }).first().click();
  await page.waitForURL(/\/th\/admin\/dbd-records\/[0-9a-f-]{36}$/);
  const answers = page.getByTestId('interview-answers');
  await answers
    .locator('input[name="interview_account_purpose"]')
    .fill('รับชำระค่าสินค้าจากลูกค้า');
  await answers.locator('input[name="interview_monthly_volume"]').fill('ประมาณ 300,000 บาท');
  await answers.locator('input[name="interview_operations_status"]').fill('เริ่มดำเนินการแล้ว');
  await page.getByTestId('save-interview').click();
  await expect(page.getByTestId('interview-saved')).toBeVisible();

  // The learner's own role on the assignment.
  await page.goto('/th/admin/users');
  await page.getByRole('link', { name: learner }).click();
  await page.waitForURL(/\/th\/admin\/users\/[0-9a-f-]{36}$/);
  const role = page.getByTestId('role-form');
  await role.getByTestId('role-holder').fill('นางสาวผู้เรียน ทดสอบ');
  await role.locator('input[name="position"]').fill('กรรมการผู้จัดการ');
  await role.locator('textarea[name="responsibilities"]').fill('ดูแลลูกค้าและอนุมัติการชำระเงิน');
  await role.getByRole('button', { name: 'บันทึกบทบาท' }).click();
  await expect(page.getByTestId('role-saved')).toBeVisible();
  await page.getByRole('button', { name: 'ออกจากระบบ' }).click();

  // The learner reads the ownership card with their own numbers filled in.
  await loginAs(page, learner, E2E_PASSWORD);
  await page.goto('/th/study/bank-interview-2-ownership');
  const body = page.getByTestId('study-body');
  await expect(body).toContainText('1,000,000 บาท');
  await expect(body).toContainText('10,000 หุ้น');
  await expect(body).toContainText('9,998 หุ้น (99.98%)');
  await expect(body).toContainText('2 คน');
  await page.goto('/th/study/bank-interview-3-business');
  await expect(page.getByTestId('study-body')).toContainText('รับชำระค่าสินค้าจากลูกค้า');
  await expect(page.getByTestId('study-body')).toContainText('ค้าปลีก');
  await page.goto('/th/study/bank-interview-4-role');
  await expect(page.getByTestId('study-body')).toContainText('กรรมการผู้จัดการ');
  // A fact nobody entered renders as a dash, never as a raw placeholder.
  await expect(page.getByTestId('study-body')).not.toContainText('{');
});
