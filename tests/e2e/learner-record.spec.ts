import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import {
  seedCompanyRecord,
  seedExamWithAnswer,
  seedInterviewWithTurns,
  seedLearnerWithCompany,
} from './seed';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

test('learner account page is compact and asks before deleting the account', async ({ page }) => {
  const learner = await seedLearnerWithCompany(`บริษัท ลบบัญชี ${Date.now()} จำกัด`, '2026-06-09');
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/en/admin/learners');
  await page.getByRole('link', { name: learner.toUpperCase(), exact: true }).click();
  await expect(page).toHaveURL(/\/en\/admin\/users\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('contact-form')).toHaveCount(0);
  await expect(page.getByTestId('role-form')).toHaveCount(0);
  await expect(page.getByTestId('version-panel')).toHaveCount(0);

  const cards = [
    page.getByTestId('password-card'),
    page.getByTestId('assignment-card'),
    page.getByTestId('assignment-coverage'),
    page.getByTestId('account-actions-card'),
  ];
  for (const card of cards) await expect(card).toBeVisible();
  await expect(
    page.getByTestId('account-actions-card').getByTestId('delete-learner-account'),
  ).toBeVisible();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const boxes = await Promise.all(cards.map((card) => card.boundingBox()));
    for (let index = 1; index < boxes.length; index += 1) {
      expect(boxes[index]!.y).toBeGreaterThan(boxes[index - 1]!.y);
      expect(Math.abs(boxes[index]!.x - boxes[0]!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(boxes[index]!.width - boxes[0]!.width)).toBeLessThanOrEqual(1);
    }
  }

  const deleteButton = page.getByTestId('delete-learner-account');
  await expect(deleteButton).toHaveText('Delete account');
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('account and training history will be permanently removed');
    await dialog.dismiss();
  });
  await deleteButton.click();
  await expect(deleteButton).toBeVisible();

  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await deleteButton.click();
  await expect(page).toHaveURL('/en/admin/learners');
  await expect(page.getByTestId(`learner-${learner}`)).toHaveCount(0);
});

test('Submanager sees static whole-team summaries and cannot open guessed detail doors', async ({
  page,
}) => {
  test.setTimeout(120_000);
  config({ path: '.env.local' });
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const code = `summary${Date.now()}`;
  const domain = process.env.APP_INTERNAL_EMAIL_DOMAIN ?? 'learner.portal.internal';
  const ids: string[] = [];
  const create = async (login: string, role: string, managerId?: string) => {
    const { data, error } = await db.auth.admin.createUser({
      email: `${login}@${domain}`,
      password: 'Test123!',
      email_confirm: true,
      user_metadata: { login_id: login },
      app_metadata: { role, ...(managerId ? { manager_id: managerId } : {}) },
    });
    if (error) throw error;
    ids.push(data.user!.id);
    if (role === 'learner' && managerId) {
      const { error } = await db
        .from('profiles')
        .update({ manager_id: managerId })
        .eq('id', data.user!.id);
      if (error) throw error;
    }
    return data.user!.id;
  };
  const manager = await create(code, 'manager');
  await create(`${code}s01`, 'submanager', manager);
  const learner = await create(`${code}l1`, 'learner', manager);
  await create(`${code}l2`, 'learner', manager);
  const other = await create(`${code}other`, 'manager');
  await create(`${code}hidden`, 'learner', other);
  const record = await seedCompanyRecord({
    companyNameTh: 'Summary company',
    team: code,
    juristicId: '0105568233704',
    issuedOn: '2026-06-09',
  });
  try {
    const { error } = await db
      .from('user_dbd_assignments')
      .insert({ user_id: learner, dbd_record_id: record });
    if (error) throw error;
    await seedExamWithAnswer(`${code}l1`, 1, 'pass');
    await seedInterviewWithTurns(`${code}l1`, 'ready', 'Private interview text');
    const { data: attempt } = await db
      .from('assessment_attempts')
      .select('id')
      .eq('user_id', learner)
      .single();
    const { data: interview } = await db
      .from('interview_sessions')
      .select('id')
      .eq('user_id', learner)
      .single();
    await loginAs(page, `${code}s01`, 'Test123!');
    await page.goto('/th/admin/learners');
    const table = page.getByTestId('learner-record');
    await expect(table.locator('tbody tr')).toHaveCount(2);
    await expect(table).toContainText(`${code}l1`.toUpperCase());
    await expect(table).toContainText(`${code}l2`.toUpperCase());
    await expect(page.getByTestId(`mcq-${code}l1`)).toHaveText('ผ่าน');
    await expect(page.getByTestId(`chatbot-${code}l1`)).toHaveText('ผ่าน');
    await expect(page.getByTestId(`company-${code}l1`)).toHaveText('E2E COMPANY CO., LTD.');
    await expect(table).not.toContainText('Private interview text');
    await expect(table.locator('a, button, form, input, select')).toHaveCount(0);
    for (const path of [
      `users/${learner}`,
      `learners/${learner}/mcq`,
      `learners/${learner}/mcq/${attempt!.id}`,
      `learners/${learner}/chatbot`,
      `learners/${learner}/chatbot/${interview!.id}`,
      `dbd-records/${record}`,
      `interviews/${interview!.id}`,
      `appointments?learner=${learner}`,
    ]) {
      await page.goto(`/th/admin/${path}`);
      await expect(page, path).toHaveURL(/\/th\/admin\/users$/);
    }
    await db.from('profiles').update({ status: 'disabled' }).eq('id', manager);
    await page.goto('/th/admin/learners');
    await expect(page).toHaveURL(/\/th\/login/);
  } finally {
    await db.from('assessment_attempts').delete().eq('user_id', learner);
    await db.from('interview_sessions').delete().eq('user_id', learner);
    await db.from('user_dbd_assignments').delete().eq('user_id', learner);
    await db.from('dbd_records').delete().eq('id', record);
    for (const id of [
      learner,
      ...ids.filter((id) => id !== learner && id !== manager && id !== other),
      other,
      manager,
    ])
      await db.auth.admin.deleteUser(id);
  }
});

/**
 * D82: the Learner Record — Login ID, company (to its DBD record), registration date, MCQ and
 * Chatbot results (to their histories and full reviews), appointment — and no Back or Home.
 */
test('a learner’s MCQ attempts and Chatbot conversations open from the Learner Record', async ({
  page,
}) => {
  const company = `บริษัท บันทึกผลสอบ ${Date.now()} จำกัด`;
  const learner = await seedLearnerWithCompany(company, '2026-06-09', {
    registered_on: '2026-05-07',
  });
  await seedExamWithAnswer(learner, 1, 'fail');
  const prompt = await seedExamWithAnswer(learner, 2, 'pass');
  await seedInterviewWithTurns(learner, 'not_ready', 'ไม่ทราบค่ะ');
  await seedInterviewWithTurns(learner, 'ready', company);

  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/learners');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('บันทึกผู้เรียน');
  await expect(page.getByTestId('nav-back')).toHaveCount(0);
  const row = page.getByTestId(`learner-${learner}`);
  await expect(row.getByRole('link', { name: learner.toUpperCase(), exact: true })).toHaveAttribute(
    'href',
    /\/th\/admin\/users\/[0-9a-f-]{36}$/,
  );
  await expect(page.getByTestId(`registered-${learner}`)).toHaveText('7 พฤษภาคม 2569');
  await expect(page.getByTestId(`mcq-${learner}`)).toHaveText('ผ่าน');
  await expect(page.getByTestId(`chatbot-${learner}`)).toHaveText('ผ่าน');
  await expect(page.getByTestId(`appointment-${learner}`)).toHaveText('—');

  // The company opens its DBD record.
  await page.getByTestId(`company-${learner}`).getByRole('link').click();
  await expect(page).toHaveURL(/\/th\/admin\/dbd-records\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(company);

  // MCQ: every attempt, newest first, each with its full review.
  await page.goto('/th/admin/learners');
  await page.getByTestId(`mcq-${learner}`).getByRole('link').click();
  await expect(page).toHaveURL(/\/th\/admin\/learners\/[0-9a-f-]{36}\/mcq$/);
  // The sidebar keeps Learner Record marked on every page under it.
  const current = page.getByTestId('staff-nav').locator('[aria-current="page"]');
  await expect(current).toHaveText(/บันทึกผู้เรียน/);
  await expect(page.getByTestId('history-learner')).toContainText(company);
  const attempts = page.getByTestId('mcq-history').locator('tbody tr');
  await expect(attempts).toHaveCount(2);
  await expect(page.getByTestId('mcq-attempt-2')).toContainText('ผ่าน');
  await expect(page.getByTestId('mcq-attempt-2')).toContainText('1 / 1');
  await expect(page.getByTestId('mcq-attempt-1')).toContainText('ไม่ผ่าน');
  await page.getByTestId('mcq-attempt-1').getByRole('link', { name: 'ดูคำตอบ' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('แบบทดสอบ ครั้งที่ 1');
  await expect(current).toHaveText(/บันทึกผู้เรียน/);
  await expect(page.getByTestId('mcq-review-score')).toContainText('0 / 1');
  await expect(page.getByText(prompt)).toBeVisible();
  await page.getByTestId('history-back').click();
  await expect(page).toHaveURL(/\/mcq$/);

  // Chatbot: every session, each with the whole conversation.
  await page.goto('/th/admin/learners');
  await page.getByTestId(`chatbot-${learner}`).getByRole('link').click();
  await expect(page).toHaveURL(/\/th\/admin\/learners\/[0-9a-f-]{36}\/chatbot$/);
  await expect(page.getByTestId('chatbot-attempt-1')).toContainText('ไม่ผ่าน');
  await expect(page.getByTestId('chatbot-attempt-2')).toContainText('ผ่าน');
  await page.getByTestId('chatbot-attempt-1').getByRole('link', { name: 'ดูบทสนทนา' }).click();
  const transcript = page.getByTestId('admin-transcript');
  await expect(transcript.locator('li')).toHaveCount(2);
  await expect(transcript).toContainText('ชื่อบริษัทของคุณคืออะไรคะ');
  await expect(transcript).toContainText('ไม่ทราบค่ะ');
  await expect(page.getByTestId('admin-verdict')).toHaveAttribute('data-verdict', 'not_ready');
  await expect(page.getByRole('link', { name: '← ประวัติสัมภาษณ์' })).toBeVisible();
  await expect(current).toHaveText(/บันทึกผู้เรียน/);
});

test('another learner’s attempt or session cannot be opened under this learner', async ({
  page,
}) => {
  const first = await seedLearnerWithCompany(`บริษัท แยกหนึ่ง ${Date.now()} จำกัด`, '2026-04-09');
  const second = await seedLearnerWithCompany(`บริษัท แยกสอง ${Date.now()} จำกัด`, '2026-04-09');
  await seedExamWithAnswer(second, 1, 'pass');
  await seedInterviewWithTurns(second, 'ready', 'บริษัท แยกสอง');

  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/learners');
  const firstId = (await page
    .getByTestId(`learner-${first}`)
    .getByRole('link', { name: first.toUpperCase(), exact: true })
    .getAttribute('href'))!
    .split('/')
    .pop()!;
  await page.getByTestId(`mcq-${second}`).getByRole('link').click();
  const attemptHref = (await page
    .getByTestId('mcq-attempt-1')
    .getByRole('link')
    .getAttribute('href'))!;
  await page.goto('/th/admin/learners');
  await page.getByTestId(`chatbot-${second}`).getByRole('link').click();
  const sessionHref = (await page
    .getByTestId('chatbot-attempt-1')
    .getByRole('link')
    .getAttribute('href'))!;

  // The second learner's attempt and session, put under the first learner's address: not found.
  for (const href of [attemptHref, sessionHref]) {
    const swapped = href.replace(/\/learners\/[0-9a-f-]{36}\//, `/learners/${firstId}/`);
    const response = await page.goto(swapped);
    expect(response?.status(), swapped).toBe(404);
  }
});
