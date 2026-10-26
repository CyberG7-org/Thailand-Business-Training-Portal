import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs, switchTo } from './helpers';
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

  // The learner's own role on the assignment.
  await page.goto('/th/admin/learners');
  await page.getByRole('link', { name: learner }).click();
  await page.waitForURL(/\/th\/admin\/users\/[0-9a-f-]{36}$/);
  // The company has one director, so the learner's role is resolved automatically without
  // exposing the role editor on the account page.
  await expect(page.getByTestId('role-form')).toHaveCount(0);

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
