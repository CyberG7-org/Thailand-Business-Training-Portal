import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedExamWithAnswer, seedInterviewWithTurns, seedLearnerWithCompany } from './seed';

/**
 * D82: the Learner Record — Login ID, company (to its DBD record), DBD issue date, MCQ and
 * Chatbot results (to their histories and full reviews), appointment — and no Back or Home.
 */
test('a learner’s MCQ attempts and Chatbot conversations open from the Learner Record', async ({
  page,
}) => {
  const company = `บริษัท บันทึกผลสอบ ${Date.now()} จำกัด`;
  const learner = await seedLearnerWithCompany(company, '2026-04-09');
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
  await expect(page.getByTestId(`issued-${learner}`)).toHaveText('9 เมษายน 2569');
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
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('MCQ ครั้งที่ 1');
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
  await expect(page.getByRole('link', { name: '← ประวัติแชตบอต' })).toBeVisible();
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
