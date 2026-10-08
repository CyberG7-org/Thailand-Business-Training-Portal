import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { returnStartersToDraft, seedApprovedBank, seedLearnerWithCompleteCompany } from './seed';

/** The bank, with the starter drafts in it; then one of them, through its concept. */
async function openStarterVariant(page: Page, concept: string, key: string) {
  await page.goto('/th/admin/questions');
  const starter = page.getByTestId('load-starter');
  if (await starter.isVisible()) {
    await starter.click();
    await expect(starter).toHaveCount(0);
  }
  await page.getByTestId(`concept-${concept}`).getByRole('link').click();
  await page.waitForURL(new RegExp(`/th/admin/questions/concepts/${concept}$`));
  await page.getByTestId(`variant-${key}`).getByRole('link').click();
  await page.waitForURL(/\/th\/admin\/questions\/variants\/[0-9a-f-]{36}$/);
}

test('the Owner loads the starter drafts, previews a variant in three languages and approves it', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await openStarterVariant(page, 'registered_capital', 'mcq-v2-registered-capital-1');

  // The fictional sample company: the same numbers in each language's own form.
  await expect(page.getByTestId('preflight')).toHaveAttribute('data-ok', 'true');
  const th = page.getByTestId('preview-th');
  await expect(th.locator('li[data-correct="true"]')).toHaveText('A. 2,000,000 บาท');
  await expect(th.locator('li')).toHaveText([
    'A. 2,000,000 บาท',
    'B. 1,000,000 บาท',
    'C. 4,000,000 บาท',
    'D. 20,000,000 บาท',
  ]);
  await expect(page.getByTestId('preview-en')).toContainText('2,000,000 THB');
  await expect(page.getByTestId('preview-zh')).toContainText('2,000,000 泰铢');

  // Approved on the Thai text; changing that text returns it to draft; approved again.
  const status = page.getByTestId('variant-status');
  if ((await status.getAttribute('data-status')) !== 'approved') {
    await page.getByTestId('variant-approve').click();
  }
  await expect(status).toHaveAttribute('data-status', 'approved');
  await page
    .locator('textarea[name="th_prompt"]')
    .fill(`ทุนจดทะเบียนของบริษัทคือเท่าใด (${Date.now()})`);
  await page.getByTestId('variant-save').click();
  await expect(page.getByTestId('variant-saved')).toBeVisible();
  await expect(status).toHaveAttribute('data-status', 'draft');
  await page.getByTestId('variant-approve').click();
  await expect(status).toHaveAttribute('data-status', 'approved');

  await page.goto('/th/admin/questions');
  await expect(page.getByTestId('concept-registered_capital')).toHaveAttribute(
    'data-covered',
    'true',
  );
});

test('the Owner approves every checked draft at once, and all 30 concepts are ready', async ({
  page,
}) => {
  await seedApprovedBank();
  // All three v2 wordings of one concept return to draft, so that concept is temporarily not
  // covered. Bulk approval restores all 30 concepts.
  await returnStartersToDraft([
    'mcq-v2-learner-shareholding-1',
    'mcq-v2-learner-shareholding-2',
    'mcq-v2-learner-shareholding-3',
  ]);
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/questions');
  await expect(page.getByTestId('concept-learner_shareholding')).toHaveAttribute(
    'data-covered',
    'false',
  );
  await expect(page.getByTestId('bank-ready')).toHaveAttribute('data-ready', '29');

  // One button, behind a confirm step that names the count.
  const approve = page.getByTestId('approve-drafts');
  await expect(approve).toContainText('3');
  await approve.click();
  await page.getByTestId('approve-drafts-confirm').click();
  await expect(page.getByTestId('drafts-approved')).toContainText('3');
  await expect(page.getByTestId('bank-ready')).toHaveAttribute('data-ready', '30');
  await expect(page.getByTestId('concept-learner_shareholding')).toHaveAttribute(
    'data-covered',
    'true',
  );
  await expect(page.getByTestId('approve-drafts')).toHaveCount(0);
});

test('drawn places are different from each other and the same in every language', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await openStarterVariant(page, 'registered_location', 'mcq-v2-registered-location-1');
  const th = page.getByTestId('preview-th');
  await expect(th.locator('li[data-correct="true"]')).toHaveText('A. ร้อยเอ็ด');
  await expect(page.getByTestId('preview-en').locator('li[data-correct="true"]')).toHaveText(
    'A. Roi Et',
  );
  await expect(page.getByTestId('preview-zh').locator('li[data-correct="true"]')).toHaveText(
    'A. ร้อยเอ็ด (Roi Et)',
  );
  const drawn = await th.locator('li').allTextContents();
  expect(new Set(drawn.map((text) => text.slice(3))).size).toBe(4);
  // The Chinese view shows the very places the Thai view drew.
  const zh = await page.getByTestId('preview-zh').locator('li').allTextContents();
  for (const [index, text] of drawn.entries()) {
    expect(zh[index]).toContain(text.slice(3));
  }
  await page.getByTestId('preview-redraw').click();
  await expect(page).toHaveURL(/draw=1$/);
  await expect(th.locator('li[data-correct="true"]')).toHaveText('A. ร้อยเอ็ด');
});

test('a new variant is refused until its options match their recipes, and nothing typed is lost', async ({
  page,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/questions/variants/new?concept=director_count');
  await page.locator('textarea[name="th_prompt"]').fill('บริษัทมีกรรมการทั้งหมดกี่คน');
  await page.locator('input[name="th_option_A"]').fill('{director_count}');
  await page.locator('input[name="th_option_B"]').fill('{director_count|count(+1)}');
  await page.locator('input[name="th_option_C"]').fill('{director_count|count(+2)}');
  await page.locator('input[name="th_option_D"]').fill('{director_count|count(+3)}');
  await page.getByTestId('variant-save').click();

  // B, C and D were left as "fixed text": the editor says what each really is.
  const issues = page.getByTestId('variant-issues');
  await expect(issues.locator('li[data-code="recipe_mismatch"]')).toHaveCount(3);
  await expect(page.locator('input[name="th_option_B"]')).toHaveValue('{director_count|count(+1)}');
  for (const key of ['B', 'C', 'D']) {
    await page.locator(`select[name="recipe_${key}"]`).selectOption('COUNT_VARIATION');
  }
  await page.getByTestId('variant-save').click();
  await page.waitForURL(/\/th\/admin\/questions\/variants\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('variant-status')).toHaveAttribute('data-status', 'draft');
  await expect(page.getByTestId('preview-th').locator('li')).toHaveText([
    'A. 2',
    'B. 3',
    'C. 4',
    'D. 5',
  ]);

  // A placeholder the grammar does not know is named, and the stored variant is untouched.
  await page.locator('input[name="th_option_D"]').fill('{directors_total}');
  await page.getByTestId('variant-save').click();
  await expect(page.getByTestId('variant-issues').locator('li[data-code="grammar"]')).toContainText(
    '{directors_total}',
  );
  await page.reload();
  await expect(page.locator('input[name="th_option_D"]')).toHaveValue('{director_count|count(+3)}');

  // Leave the bank as it was: the experiment is retired.
  await page.getByTestId('variant-retire').click();
  await expect(page.getByTestId('variant-status')).toHaveAttribute('data-status', 'retired');
});

test('checking a company lists what the bank can ask it', async ({ page }) => {
  await seedApprovedBank();
  const company = `บริษัท ตรวจคลัง ${Date.now()} จำกัด`;
  await seedLearnerWithCompleteCompany(company);
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/questions');
  await page.getByTestId('bank-check').click();
  await page.waitForURL(/\/th\/admin\/questions\/check$/);
  await page.getByTestId('check-company').selectOption({ label: company });
  await page.getByTestId('check-run').click();

  await expect(page.locator('tr[data-testid^="check-"]')).toHaveCount(30);
  // Approved by the first test: this company's own capital, from its training version.
  const capital = page.getByTestId('check-registered_capital');
  await expect(capital).toHaveAttribute('data-state', 'usable');
  await expect(capital).toContainText('2,000,000 บาท');
  // The company has no business category: a question that offers other lines of business as
  // wrong answers cannot be asked of it.
  await expect(page.getByTestId('check-company_name')).toHaveAttribute('data-state', 'usable');
  await expect(page.getByTestId('check-actual_business')).toHaveAttribute('data-state', 'blocked');
  await expect(page.getByTestId('check-summary')).toBeVisible();
});

test('the earlier questions keep their own list', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/questions');
  await page.getByTestId('bank-legacy').click();
  await expect(page).toHaveURL(/\/th\/admin\/questions\/legacy$/);
  await expect(page.locator('tr[data-testid^="question-sample-"]').first()).toBeVisible();
  await expect(page.locator('tr[data-testid^="question-mcq-"]')).toHaveCount(0);
});
