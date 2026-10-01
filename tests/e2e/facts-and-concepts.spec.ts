import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import {
  createManager,
  fillBusinessAnswers,
  loginAs,
  openManualRecordForm,
  switchTo,
  openRecordTab,
} from './helpers';
import { seedLearnerWithCompany } from './seed';

const ROI_ET = 'เลขที่ 87 หมู่ที่ 9 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด';

test('a learner page resolves a legacy record’s printed address for its readiness', async ({
  page,
}) => {
  // A record saved before P17a: a printed address and nothing derived from it yet.
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
  // The address counts as present here exactly as on the record page.
  await expect(coverage.locator('[data-fact="address"]')).toHaveCount(0);
});

test('a record reads its address, maps its category, and shows what is still missing', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await openManualRecordForm(page);
  await page
    .locator('input[name="company_name_th"]')
    .fill(`บริษัท ข้อเท็จจริง ${Date.now()} จำกัด`);
  await page.locator('input[name="juristic_id"]').fill('0105568233763');
  await page.locator('input[name="head_office_address"]').fill(ROI_ET);
  await page.getByRole('button', { name: 'บันทึก' }).first().click();
  await page.waitForURL(/\/th\/admin\/dbd-records\/[0-9a-f-]{36}$/);

  // The address resolved against the geography tables, postcode taken from the subdistrict.
  await expect(page.getByTestId('address-panel')).toHaveAttribute('data-status', 'resolved');
  await expect(page.getByTestId('address-district')).toHaveText('โพนทอง');
  await expect(page.getByTestId('address-subdistrict')).toHaveText('หนองใหญ่');
  // Moo, road and postcode are read but not listed (D89).
  for (const part of ['moo', 'road', 'postcode']) {
    await expect(page.getByTestId(`address-${part}`)).toHaveCount(0);
  }

  // A record counts its company-level concepts only (D74): 29 and 12, the learner's own named
  // as checked per learner.
  await expect(page.getByTestId('coverage-panel')).toHaveAttribute('data-scope', 'company');
  await expect(page.getByTestId('coverage-mcq')).toHaveAttribute('data-total', '29');
  await expect(page.getByTestId('coverage-interview')).toHaveAttribute('data-total', '12');
  await expect(page.getByTestId('coverage-per-learner')).toContainText('หุ้นที่ผู้เรียนถือ');

  // No business text yet: no category, and the coverage names what is missing.
  await expect(page.getByTestId('category-panel')).toHaveAttribute('data-status', 'unmapped');
  // Listed under the status column's folded "What's missing".
  await expect(
    page.locator('[data-testid="coverage-missing"] [data-fact="nature_of_business"]'),
  ).toBeAttached();

  // The Level 1 business answers map the category through the fake mapper.
  await fillBusinessAnswers(page);
  await page.reload();
  await expect(page.getByTestId('category-panel')).toHaveAttribute('data-status', 'mapped');
  await expect(page.getByTestId('category-current')).toContainText('เสื้อผ้า');

  // A status fact relabels its fields at once, and saving it clears it from "missing".
  await expect(
    page.locator('[data-testid="coverage-missing"] [data-fact="has_existing_customers"]'),
  ).toBeAttached();
  await openRecordTab(page, 'interview');
  await page.getByTestId('status-has_existing_customers').selectOption('no');
  await expect(page.getByTestId('label-customer_examples')).toHaveText(
    'กลุ่มลูกค้าเป้าหมายที่คาดไว้',
  );
  await page.getByTestId('save-interview').click();
  await expect(page.getByTestId('interview-saved')).toBeVisible();
  await page.reload();
  await expect(
    page.locator('[data-testid="coverage-missing"] [data-fact="has_existing_customers"]'),
  ).toHaveCount(0);
  // The category survived the answers save.
  await expect(page.getByTestId('category-panel')).toHaveAttribute('data-status', 'mapped');
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
