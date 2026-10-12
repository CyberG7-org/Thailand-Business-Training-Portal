import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { createManager, loginAs, openRecordTab, switchTo } from './helpers';
import { seedCompanyRecord, seedLearnerWithCompany } from './seed';

const ROI_ET = 'เลขที่ 87 หมู่ที่ 9 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด';

test('a learner page resolves a legacy record’s printed address for its readiness', async ({
  page,
}) => {
  const learner = await seedLearnerWithCompany('บริษัท ที่อยู่เดิม จำกัด', '2025-01-01', {
    head_office_address: ROI_ET,
  });
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/learners');
  await page.getByRole('link', { name: learner }).click();
  await page.waitForURL(/\/th\/admin\/users\/[0-9a-f-]{36}$/);

  const coverage = page.getByTestId('assignment-coverage');
  await expect(coverage).toHaveAttribute('data-scope', 'assignment');
  await expect(coverage.getByTestId('coverage-mcq')).toHaveAttribute('data-total', '30');
  await expect(coverage.locator('[data-fact="address"]')).toHaveCount(0);
});

test('the selected business category supplies the three bank-interview estimates', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const id = await seedCompanyRecord({
    companyNameTh: `บริษัท หมวดธุรกิจ ${Date.now()} จำกัด`,
    juristicId: '0105568233763',
    issuedOn: '13/07/2569',
  });
  await page.goto(`/th/admin/dbd-records/${id}`);
  await openRecordTab(page, 'interview');
  await expect(page.getByTestId('category-panel')).toHaveAttribute('data-status', 'unmapped');
  await page.locator('select[name="categoryKey"]').selectOption('food_products');
  await page.getByTestId('category-set').click();
  await expect(page.getByTestId('category-panel')).toHaveAttribute('data-status', 'mapped');
  await expect(page.getByTestId('figure-monthlyRevenue')).toContainText('2,100,000');
  await expect(page.getByTestId('figure-averagePerTransaction')).toContainText('500');
  await expect(page.getByTestId('figure-transactionsPerMonth')).toContainText('3,900');
  await expect(page.getByTestId('invoice-figures')).toHaveCount(0);
  await expect(page.getByTestId('save-interview')).toHaveCount(0);
});

test('only the Owner edits business categories', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const key = `e2e_${Date.now()}`;
  await page.goto('/th/admin/business-categories');
  const form = page.getByTestId('category-new');
  await form.locator('input[name="key"]').fill(key);
  await form.locator('input[name="label_th"]').fill('หมวดทดสอบ');
  await form.locator('input[name="label_en"]').fill('Test category');
  await form.locator('input[name="label_zh"]').fill('测试类别');
  await page.getByTestId('category-add').click();
  await expect(page.getByTestId(`category-${key}`)).toBeVisible();

  const code = await createManager(page, 'ผู้จัดการหมวดธุรกิจ', 'Manager-Password-1!');
  await switchTo(page, code.toLowerCase(), 'Manager-Password-1!');
  await page.goto('/th/admin/business-categories');
  await expect(page).toHaveURL(/\/th\/admin$/);
  await expect(page.getByTestId('staff-nav')).not.toContainText('หมวดธุรกิจ');
});
