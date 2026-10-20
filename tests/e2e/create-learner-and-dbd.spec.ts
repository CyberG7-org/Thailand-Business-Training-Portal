import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import {
  assignLearner,
  createConfirmedRecord,
  createManager,
  fillLoginSuffix,
  loginAs,
  switchTo,
} from './helpers';

const MANAGER_PASSWORD = 'Manage1!';
const LEARNER_PASSWORD = 'Learn123';

test('Submanager sees team company names as text and cannot open their editors', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const domain = process.env.APP_INTERNAL_EMAIL_DOMAIN ?? 'learner.portal.internal';
  const code = `e2esub${Date.now()}`;
  const ids: string[] = [];
  let recordId: string | undefined;
  let ownRecordId: string | undefined;
  try {
    const { data: m, error: me } = await db.auth.admin.createUser({
      email: `${code}@${domain}`,
      password: MANAGER_PASSWORD,
      email_confirm: true,
      user_metadata: { login_id: code },
      app_metadata: { role: 'manager' },
    });
    if (me) throw me;
    ids.push(m.user!.id);
    const { data: s, error: se } = await db.auth.admin.createUser({
      email: `${code}s01@${domain}`,
      password: MANAGER_PASSWORD,
      email_confirm: true,
      user_metadata: { login_id: `${code}s01` },
      app_metadata: { role: 'submanager', manager_id: m.user!.id },
    });
    if (se) throw se;
    ids.push(s.user!.id);
    const { data: r, error: re } = await db
      .from('dbd_records')
      .insert({
        team_id: m.user!.id,
        created_by: m.user!.id,
        company_name_en: 'Manager uploaded company',
        company_name_th: 'Manager company',
        juristic_id: '0105568233704',
        directors: [{ name_th: 'E2E Director' }],
        extraction_status: 'confirmed',
        confirmed_by: m.user!.id,
        confirmed_at: new Date().toISOString(),
        structured_data: {
          interview: {
            contact_email: 'test@example.com',
            contact_phone: '0812345678',
            nature_of_business: 'Test',
            products_services: 'Test',
          },
        },
      })
      .select('id')
      .single();
    if (re) throw re;
    recordId = r.id;
    await loginAs(page, `${code}s01`, MANAGER_PASSWORD);
    await page.goto('/en/admin/users');
    await expect(page.getByText('Manager uploaded company', { exact: true })).toBeVisible();
    await expect(page.locator(`a[href*="dbd-records/${recordId}"]`)).toHaveCount(0);
    await expect(page.getByTestId(`delete-company-${recordId}`)).toHaveCount(0);
    await page.getByTestId(`assign-learner-${recordId}`).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'This DBD has not been created by you.' }),
    ).toHaveText('This DBD has not been created by you.');
    await expect(page.getByTestId('tab-companies')).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('tab-learner').click();
    await expect(page.locator('select[name="dbdRecordId"]')).toHaveValue('');
    await page.getByTestId('tab-companies').click();
    await page.getByTestId('add-company').click();
    await expect(page.getByRole('radio', { name: 'PDF poster' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'ZIP file' })).toBeVisible();
    await page.goto(`/en/admin/dbd-records/${recordId}`);
    await expect(page).toHaveURL(/\/en\/admin\/users$/);
    // A separate record retains the Submanager as creator after Manager confirmation.
    const { data: source } = await db
      .from('dbd_records')
      .select(
        'team_id, company_name_en, company_name_th, juristic_id, directors, extraction_status, confirmed_by, confirmed_at, structured_data',
      )
      .eq('id', recordId)
      .single();
    const { data: own, error: ownError } = await db
      .from('dbd_records')
      .insert({
        ...source!,
        created_by: s.user!.id,
        company_name_en: 'Submanager uploaded company',
      })
      .select('id')
      .single();
    if (ownError) throw ownError;
    ownRecordId = own.id;
    await page.reload();
    await page.getByTestId(`assign-learner-${ownRecordId}`).click();
    await expect(page.getByTestId('tab-learner')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('select[name="dbdRecordId"]')).toHaveValue(ownRecordId!);
    await expect(page.getByTestId('login-id-prefix')).toHaveText(code.toUpperCase());
    await fillLoginSuffix(page);
    await page.locator('input[name="password"]').fill(LEARNER_PASSWORD);
    await page.getByRole('button', { name: 'Create learner', exact: true }).click();
    await expect(page.getByTestId('create-user-status')).toBeVisible();
    const { data: assignment } = await db
      .from('user_dbd_assignments')
      .select('user_id')
      .eq('dbd_record_id', ownRecordId!)
      .single();
    expect(assignment).toBeTruthy();
    ids.push(assignment!.user_id);
    expect(
      (await db.from('profiles').select('manager_id').eq('id', assignment!.user_id).single()).data
        ?.manager_id,
    ).toBe(m.user!.id);
  } finally {
    if (ownRecordId) await db.from('dbd_records').delete().eq('id', ownRecordId);
    if (recordId) await db.from('dbd_records').delete().eq('id', recordId);
    for (const id of ids.reverse()) await db.auth.admin.deleteUser(id);
  }
});

/**
 * D80, D93: one page, two tabs in the order a manager works — the companies with a way to add
 * one, then the learner form. Image, poster PDF and ZIP intake share the same panel.
 */
test('a manager can choose image, PDF or ZIP company intake', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ผู้จัดการสร้างครบ', MANAGER_PASSWORD);
  await switchTo(page, code.toLowerCase(), MANAGER_PASSWORD);

  await page.goto('/th/admin/users');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('สร้างผู้เรียนและ DBD');
  // The companies come first, counted; the learner form is the second tab; no learners list.
  const tabs = page.getByRole('tab');
  await expect(tabs.first()).toHaveAttribute('data-testid', 'tab-companies');
  await expect(page.getByTestId('tab-companies')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('tab-companies')).toContainText('0');
  await expect(page.getByTestId('companies')).toContainText('ยังไม่มีบริษัท');
  await expect(page.getByTestId('create-company-panel')).toBeVisible();
  await expect(page.getByTestId('add-company')).toHaveText(/สร้าง DBD ใหม่/);
  expect(
    await page.getByTestId('create-company-panel').evaluate((panel) => {
      const list = panel.parentElement?.querySelector('#companies-heading');
      return Boolean(
        list && panel.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }),
  ).toBe(true);
  await expect(page.locator('[data-testid^="progression-"]')).toHaveCount(0);
  // "Not listed?" on the learner form opens the companies tab at its upload form.
  await page.getByTestId('tab-learner').click();
  await expect(page.locator('input[name="displayName"]')).toBeVisible();
  await page.getByRole('button', { name: 'เพิ่มในแท็บบริษัท (DBD)' }).click();
  await expect(page.getByTestId('tab-companies')).toHaveAttribute('aria-selected', 'true');

  await expect(page.getByTestId('create-dbd-files')).toHaveAttribute(
    'accept',
    'image/jpeg,image/png,image/webp',
  );
  await expect(page.getByText('Choose an image to upload')).toBeVisible();
  await expect(page.getByTestId('create-dbd')).toContainText('Upload company information image');
  await page.getByRole('radio', { name: 'PDF poster' }).check();
  await expect(page.getByTestId('create-dbd-pdf-files')).toHaveAttribute(
    'accept',
    '.pdf,application/pdf',
  );
  await expect(page.getByText('Choose a PDF poster to upload')).toBeVisible();
  await expect(page.getByTestId('create-dbd')).toContainText('Upload company information PDF');
  await expect(page.getByTestId('upload-pdf')).not.toContainText('GEMINI_API_KEY');
  await page.getByRole('radio', { name: 'ZIP file' }).check();
  await expect(page.getByTestId('create-dbd-zip-files')).toHaveAttribute(
    'accept',
    '.zip,application/zip,application/x-zip-compressed',
  );
  await expect(page.getByText('Choose a ZIP file to upload')).toBeVisible();
  await expect(page.getByTestId('create-dbd')).toContainText(
    'The links will be prefilled in Company details',
  );
});

test('a learner can be created without phone and email', async ({ page }) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/users?tab=learner');
  await expect(page.locator('input[name="phone"]')).not.toHaveAttribute('required', '');
  await expect(page.locator('input[name="contactEmail"]')).not.toHaveAttribute('required', '');
  // The website and the Facebook page come from the company zip now (D101).
  await expect(page.locator('input[name="website"]')).toHaveCount(0);
  await expect(page.locator('input[name="facebookPage"]')).toHaveCount(0);
});

test("the owner's Assign learner chooses the company's team too; a company takes one learner", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const company = `บริษัท หนึ่งต่อหนึ่ง ${Date.now()} จำกัด`;
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  const code = await createManager(page, 'ทีมหนึ่งต่อหนึ่ง', MANAGER_PASSWORD);
  await switchTo(page, code.toLowerCase(), MANAGER_PASSWORD);
  const recordId = await createConfirmedRecord(page, {
    companyNameTh: company,
    juristicId: '0105568233704',
    team: code,
    issuedOn: '13/07/2569',
  });
  await switchTo(page, E2E_ADMIN.loginId, E2E_PASSWORD);

  // The owner opens the companies and assigns: the form arrives with the company and its team.
  await page.goto('/th/admin/users');
  await assignLearner(page, recordId);
  await expect(page.locator('select[name="dbdRecordId"]')).toHaveValue(recordId);
  await expect(page.getByTestId('login-id-prefix')).toHaveText(code);
  await fillLoginSuffix(page);
  await page.locator('input[name="password"]').fill(LEARNER_PASSWORD);
  await expect(page.locator('input[name="displayName"]')).toHaveValue('E2E Learner');
  await page.locator('input[name="phone"]').fill('081-234-5678');
  await page.locator('input[name="contactEmail"]').fill('first@example.co.th');
  const first =
    `${(await page.getByTestId('login-id-prefix').textContent())?.trim() ?? ''}${await page.getByTestId('login-suffix').inputValue()}`.toUpperCase();
  await page.getByRole('button', { name: 'สร้างผู้เรียน' }).click();
  const created = page.getByTestId('create-user-status');
  await expect(created).toBeVisible();
  await expect(created).toContainText(first);
  await page.getByTestId('tab-companies').click();
  await expect(page.getByTestId(`company-learner-${recordId}`)).toHaveText(first);

  // Assigned companies are removed from the picker entirely.
  await page.goto('/th/admin/users?tab=learner');
  const option = page.locator(`select[name="dbdRecordId"] option[value="${recordId}"]`);
  await expect(option).toHaveCount(0);
});
