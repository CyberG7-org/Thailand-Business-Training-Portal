import { expect, test, type Page } from '@playwright/test';
import { CRITICAL_CONCEPT_KEYS } from '@/lib/domain/concepts/registry';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import {
  answerKeyOf,
  recordIdOf,
  seedApprovedBank,
  seedLearnerWithCompleteCompany,
  seedQuizReadyLearner,
  setPolicy,
} from './seed';

const OPTIONS = ['A', 'B', 'C', 'D'];

/** Starts the quiz from its page and returns the attempt's id. */
async function startQuiz(page: Page): Promise<string> {
  await page.goto('/th/exam');
  await page.getByTestId('start-exam').click();
  await page.waitForURL(/\/th\/exam\/[0-9a-f-]{36}$/);
  return page.url().split('/').pop()!;
}

/**
 * Answers every question not yet answered: right, except on the concepts named. The key comes
 * from the server's own table — the page does not carry it.
 */
async function answerAll(page: Page, attemptId: string, wrong: readonly string[] = []) {
  const key = await answerKeyOf(attemptId);
  for (const [i, q] of key.entries()) {
    const card = page.getByTestId(`question-card-${i}`);
    if ((await card.getAttribute('data-answered')) === 'true') continue;
    const pick = wrong.includes(q.conceptKey)
      ? OPTIONS.find((o) => o !== q.correctKey)!
      : q.correctKey;
    await card.getByTestId(`option-${pick}`).click();
    await expect(card.getByTestId('feedback')).toBeVisible();
  }
}

test('the quiz says what it is, marks each answer at once, and a pass is notified', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await setPolicy('telegram_admin_chat_ids', ['e2e-chat']);
  await setPolicy('email_admin_recipients', ['e2e@example.com']);
  await seedApprovedBank();
  const learner = await seedQuizReadyLearner(`บริษัท แบบทดสอบ ${Date.now()} จำกัด`);
  await loginAs(page, learner, E2E_PASSWORD);
  await expect(page.getByTestId('stage-exam-status')).toHaveText('พร้อมใช้งาน');
  await page.getByTestId('stage-exam').getByRole('link', { name: 'เปิด' }).click();

  // What the quiz is, before it starts (the Owner's point 1).
  const about = page.getByTestId('exam-about');
  await expect(about).toContainText('มี 30 ข้อ');
  await expect(about).toContainText('เปลี่ยนคำตอบไม่ได้');
  await expect(about).toContainText('ตอบถูก 27 ข้อขึ้นไป');
  await expect(about).toContainText('ตอบถูก 23 ถึง 26 ข้อ');

  await page.getByTestId('start-exam').click();
  await page.waitForURL(/\/th\/exam\/[0-9a-f-]{36}$/);
  const attemptId = page.url().split('/').pop()!;
  await expect(page.locator('[data-testid^="question-card-"]')).toHaveCount(30);
  const progress = page.getByTestId('attempt-progress');
  await expect(progress).toHaveAttribute('data-total', '30');
  await expect(page.getByTestId('exam-meta')).toContainText('27 / 30');
  await expect(page.getByTestId('submit-exam')).toBeDisabled();
  // An open attempt carries no marking for a question not yet answered.
  await expect(page.locator('[data-state="correct"]')).toHaveCount(0);

  const key = await answerKeyOf(attemptId);
  // The first question, answered right: marked correct, no correction needed, and locked.
  const first = page.getByTestId('question-card-0');
  await first.getByTestId(`option-${key[0].correctKey}`).click();
  await expect(first.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
  await expect(first.getByTestId('feedback')).toHaveText('ถูกต้อง!');
  await expect(first.getByTestId('saved')).toHaveCount(0);
  for (const option of OPTIONS) {
    await expect(first.getByTestId(`option-${option}`)).toBeDisabled();
  }

  // One question that is not a key fact, answered wrong: the correct answer and why.
  const slip = key.findIndex((q, i) => i > 0 && !CRITICAL_CONCEPT_KEYS.includes(q.conceptKey));
  const wrongPick = OPTIONS.find((o) => o !== key[slip].correctKey)!;
  const slipped = page.getByTestId(`question-card-${slip}`);
  await slipped.getByTestId(`option-${wrongPick}`).click();
  await expect(slipped.getByTestId('feedback')).toHaveAttribute('data-correct', 'false');
  await expect(slipped.getByTestId('feedback')).toContainText('ไม่ถูกต้อง — คำตอบที่ถูกคือ');
  await expect(slipped.getByTestId('feedback').locator('p')).toHaveCount(2);
  await expect(slipped.getByTestId(`option-${key[slip].correctKey}`)).toHaveAttribute(
    'data-state',
    'correct',
  );
  await expect(slipped.getByTestId(`option-${wrongPick}`)).toHaveAttribute(
    'data-state',
    'incorrect',
  );
  await expect(slipped.getByTestId(`option-${key[slip].correctKey}`)).toBeDisabled();
  await expect(progress).toHaveAttribute('data-answered', '2');

  // A reload keeps both markings and still shows nothing for the questions left.
  await page.reload();
  await expect(first.getByTestId('feedback')).toHaveAttribute('data-correct', 'true');
  await expect(slipped.getByTestId('feedback')).toHaveAttribute('data-correct', 'false');
  await expect(page.locator('[data-state="correct"]')).toHaveCount(2);

  await answerAll(page, attemptId);
  await expect(progress).toHaveAttribute('data-answered', '30');
  await page.getByTestId('submit-exam').click();
  await expect(page).toHaveURL(/\/result$/);
  await expect(page.getByTestId('exam-result')).toHaveAttribute('data-result', 'pass');
  await expect(page.getByTestId('exam-score')).toHaveText('29 / 30');
  // The result reviews every question: the correct option is marked (D51).
  await expect(page.locator('[data-testid^="review-"]')).toHaveCount(30);
  await expect(page.getByTestId('review-0').locator('[data-state="correct"]')).toHaveCount(1);

  await page.goto('/th/dashboard');
  await expect(page.getByTestId('stage-exam-status')).toHaveText('เสร็จสิ้น');
  await page.getByRole('button', { name: 'ออกจากระบบ' }).click();

  // The cron endpoint rejects unauthenticated calls and drains the queue with the secret.
  expect((await request.get('/api/cron/notifications')).status()).toBe(401);
  const drained = await request.get('/api/cron/notifications', {
    headers: { Authorization: 'Bearer local-cron-secret-for-dev' },
  });
  expect(drained.status()).toBe(200);

  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/notifications');
  const rows = page.locator(`[data-testid^="notification-exam_result:${attemptId}:"]`);
  await expect(rows).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    await expect(rows.nth(i).getByTestId('notification-status')).toHaveText('sent');
  }
});

test('27 correct passes without mandatory questions; below 27 keeps practising', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await seedApprovedBank();
  const learner = await seedQuizReadyLearner(`บริษัท ผลสามแบบ ${Date.now()} จำกัด`);
  await loginAs(page, learner, E2E_PASSWORD);

  // A formerly mandatory company fact no longer overrides a passing score.
  const passed = await startQuiz(page);
  await answerAll(page, passed, ['registered_capital']);
  await page.getByTestId('submit-exam').click();
  await expect(page).toHaveURL(/\/result$/);
  await expect(page.getByTestId('exam-result')).toHaveAttribute('data-result', 'pass');
  await expect(page.getByTestId('exam-score')).toHaveText('29 / 30');
  await expect(page.getByTestId('exam-critical-wrong')).toHaveCount(0);

  // The next attempt: 25 of 30 is a simple not-passed result, never a separate retest band.
  const notPassed = await startQuiz(page);
  expect(notPassed).not.toBe(passed);
  const wrong = (await answerKeyOf(notPassed)).map((q) => q.conceptKey).slice(0, 5);
  await answerAll(page, notPassed, wrong);
  await page.getByTestId('submit-exam').click();
  await expect(page).toHaveURL(/\/result$/);
  await expect(page.getByTestId('exam-result')).toHaveAttribute('data-result', 'fail');
  await expect(page.getByTestId('exam-result')).toContainText('ยังไม่ผ่าน');
  await expect(page.getByTestId('exam-score')).toHaveText('25 / 30');
  await expect(page.getByTestId('exam-critical-wrong')).toHaveCount(0);
  await expect(page.getByTestId('exam-next')).toHaveAttribute('href', '/th/exam');

  // The status pill names each result once; the row title stays focused on attempt and score.
  await page.goto('/th/exam');
  await expect(page.getByTestId('exam-attempt-1')).toHaveAttribute('data-result', 'pass');
  await expect(page.getByTestId('exam-attempt-2')).toHaveAttribute('data-result', 'fail');
  await expect(page.getByTestId('exam-attempt-summary-1')).toHaveText('ครั้งที่ 1: 29 / 30');
  await expect(page.getByTestId('exam-attempt-summary-2')).toHaveText('ครั้งที่ 2: 25 / 30');
  await page.goto('/th/dashboard');
  await expect(page.getByTestId('stage-interview-status')).toHaveText('พร้อมใช้งาน');
});

test('a company the bank cannot ask does not start the quiz, and its record says why', async ({
  page,
}) => {
  await seedApprovedBank();
  // Complete, but with no business category: the questions that offer other lines of business
  // as wrong answers cannot be made.
  const learner = await seedLearnerWithCompleteCompany(`บริษัท ยังไม่พร้อม ${Date.now()} จำกัด`);
  await loginAs(page, learner, E2E_PASSWORD);
  await page.goto('/th/exam');
  await page.getByTestId('start-exam').click();
  await expect(page.getByTestId('exam-error')).toContainText('ยังไม่พร้อม');
  await expect(page).toHaveURL(/\/th\/exam$/);
  await page.getByRole('button', { name: 'ออกจากระบบ' }).click();

  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto(`/th/admin/dbd-records/${await recordIdOf(learner)}`);
  await page.getByTestId('record-tab-exceptions').click();
  const notice = page.getByTestId('exception-render_failure-actual_business');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('ธุรกิจหลักที่ทำจริง');
  await expect(notice).toContainText('เริ่มทำแบบทดสอบไม่ได้');
});
