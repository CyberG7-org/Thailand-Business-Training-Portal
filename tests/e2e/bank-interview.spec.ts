import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs, openRecordTab, switchTo } from './helpers';
import { ensureStarterCards, seedLearnerWithCompany } from './seed';

test('starter cards, interview answers and the learner role combine into a personalised study card', async ({
  page,
}) => {
  // No version yet: the manager fills the answers in before the learner's first visit, and the
  // study cards read the live row until the sheet is clean enough for a version (P17c).
  const learner = await seedLearnerWithCompany(
    'บริษัท สัมภาษณ์ธนาคาร จำกัด',
    '2025-01-01',
    {
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
    },
    { version: false },
  );

  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);

  // The starter cards are in place, as `pnpm content:starter` puts them (D81).
  await ensureStarterCards();

  // Company-level interview answers on the record, opened from the companies list (D80).
  await page.goto('/th/admin/users?tab=companies');
  await page.getByRole('link', { name: 'บริษัท สัมภาษณ์ธนาคาร จำกัด' }).first().click();
  await page.waitForURL(/\/th\/admin\/dbd-records\/[0-9a-f-]{36}$/);
  await openRecordTab(page, 'interview');
  const answers = page.getByTestId('interview-answers');
  // The earlier answers sit behind a closed disclosure (P17a, spec §5.4); open it to fill them.
  await answers.getByTestId('legacy-answers').locator('summary').click();
  await answers.locator('input[name="interview_monthly_volume"]').fill('ประมาณ 300,000 บาท');
  await answers.locator('input[name="interview_operations_status"]').fill('เริ่มดำเนินการแล้ว');
  await page.getByTestId('save-interview').click();
  await expect(page.getByTestId('interview-saved')).toBeVisible();

  // The learner's own role on the assignment.
  await page.goto('/th/admin/learners');
  await page.getByRole('link', { name: learner }).click();
  await page.waitForURL(/\/th\/admin\/users\/[0-9a-f-]{36}$/);
  // Nobody types it (D95): the company's only director is the learner, and the three other
  // answers are the same for every learner.
  const role = page.getByTestId('role-form');
  await expect(role.getByTestId('role-holder')).toHaveValue('นางสาวผู้เรียน ทดสอบ');
  await expect(role.getByTestId('role-holder')).toHaveAttribute('data-automatic', 'true');
  await expect(role.getByTestId('role-position')).toHaveText('กรรมการ');
  await expect(role.locator('input[name="position"]')).toHaveCount(0);
  // Picking the other shareholder and back is still possible, from the documents only.
  await role.getByTestId('role-holder').selectOption('นายอื่น ทดสอบ');
  await role.getByRole('button', { name: 'บันทึกบทบาท' }).click();
  await expect(page.getByTestId('role-saved')).toBeVisible();
  await role.getByTestId('role-holder').selectOption('นางสาวผู้เรียน ทดสอบ');
  await role.getByRole('button', { name: 'บันทึกบทบาท' }).click();
  // The first save already showed "saved" and turned "automatic" off, so neither says the second
  // one landed: read it back from the server before moving on.
  await expect(async () => {
    await page.reload();
    await expect(role.getByTestId('role-holder')).toHaveValue('นางสาวผู้เรียน ทดสอบ', {
      timeout: 2_000,
    });
  }).toPass();
  await expect(role.getByTestId('role-holder')).toHaveAttribute('data-automatic', 'false');

  // The learner reads the ownership card with their own numbers filled in. `switchTo` clears
  // the session rather than racing a sign-out click, since the login page sends a signed-in
  // visitor away.
  await switchTo(page, learner, E2E_PASSWORD);
  await page.goto('/th/study');
  await expect(page.locator('[data-testid^="study-item-bank-interview-"]')).toHaveCount(5);
  await expect(page.locator('[data-testid^="study-item-sample-"]')).toHaveCount(0);
  await page.goto('/th/study/bank-interview-2-ownership');
  const body = page.getByTestId('study-body');
  await expect(body).toContainText('1,000,000 บาท');
  await expect(body).toContainText('10,000 หุ้น');
  await expect(body).toContainText('9,998 หุ้น (99.98%)');
  await expect(body).toContainText('2 คน');
  await expect(body).toContainText('นางสาวผู้เรียน ทดสอบ');
  await expect(body).toContainText('กรรมการ');
  await expect(body).toContainText('ดูแลการดำเนินงานของบริษัท');
  await page.goto('/th/study/bank-interview-3-business');
  await expect(page.getByTestId('study-body')).toContainText('ค้าปลีก');
  await page.goto('/th/study/bank-interview-4-role');
  // Why the company needs the account is the same answer for every company (D91).
  await expect(page.getByTestId('study-body')).toContainText(
    'เพื่อใช้ทำธุรกรรมทางการเงินของบริษัท',
  );
  // A fact nobody entered renders as a dash, never as a raw placeholder.
  await expect(page.getByTestId('study-body')).not.toContainText('{');
});
