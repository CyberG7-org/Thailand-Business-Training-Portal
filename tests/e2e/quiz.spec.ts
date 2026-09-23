import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompany } from './seed';

test('admin authors a personalized question; learner takes the quiz with instant feedback, resume and review', async ({
  page,
}) => {
  const key = `e2e-q-${Date.now()}`;
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/questions/new');
  await page.locator('input[name="questionKey"]').fill(key);
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await page.waitForURL(/\/th\/admin\/questions\/[0-9a-f-]{36}$/);

  const texts = {
    th: {
      prompt: 'ชื่อบริษัทของคุณคือ {company_name_th} ใช่หรือไม่',
      a: 'ใช่',
      b: 'ไม่ใช่',
      explanation: 'ชื่อบริษัทตามหนังสือรับรอง',
    },
    en: {
      prompt: 'Is your company named {company_name_th}?',
      a: 'Yes',
      b: 'No',
      explanation: 'From the certificate.',
    },
    zh: {
      prompt: '您的公司名称是 {company_name_th} 吗？',
      a: '是',
      b: '否',
      explanation: '来自证书。',
    },
  } as const;
  for (const [lang, t] of Object.entries(texts)) {
    const form = page.getByTestId(`qloc-${lang}`);
    await form.locator('textarea[name="prompt"]').fill(t.prompt);
    await form.locator('input[name="option_A"]').fill(t.a);
    await form.locator('input[name="option_B"]').fill(t.b);
    await form.locator('select[name="correctKey"]').selectOption('A');
    await form.locator('textarea[name="explanation"]').fill(t.explanation);
    await form.getByRole('button', { name: 'บันทึกภาษานี้' }).click();
    await expect(form.getByRole('status')).toHaveText('บันทึกแล้ว');
  }
  await expect(page.getByTestId('question-dependencies')).toContainText('company_name_th');
  await page.locator('select[name="status"]').selectOption('approved');
  await page.getByTestId('set-status').click();
  await expect(page.getByTestId('question-status')).toHaveText('approved');
  await page.getByRole('button', { name: 'ออกจากระบบ' }).click();

  const company = 'บริษัท ควิซทดสอบ จำกัด';
  const learner = await seedLearnerWithCompany(company, '2026-07-13');
  await loginAs(page, learner, E2E_PASSWORD);
  await expect(page.getByTestId('stage-quiz-status')).toHaveText('พร้อมใช้งาน');
  await page.getByTestId('stage-quiz').getByRole('link', { name: 'เปิด' }).click();
  await page.getByTestId('start-quiz').click();
  await page.waitForURL(/\/th\/quiz\/[0-9a-f-]{36}$/);
  const attemptUrl = page.url();

  // Every question of the attempt is on this one page.
  const total = await page.locator('[data-testid^="question-card-"]').count();
  expect(total).toBeGreaterThan(1);
  const progress = page.getByTestId('attempt-progress');
  await expect(progress).toHaveAttribute('data-answered', '0');
  await expect(progress).toHaveAttribute('data-total', String(total));
  await expect(page.getByTestId('submit-quiz')).toBeDisabled();

  const first = page.getByTestId('question-card-0');
  // Options are shuffled, but the letters always read A, B, C… top to bottom.
  const letters = await first.locator('[data-testid^="option-"] span').allTextContents();
  expect(letters).toEqual(letters.map((_, i) => `${String.fromCharCode(65 + i)}.`));

  // Switching the UI language mid-attempt shows the same questions in that language (D50).
  const thaiPrompt = (await first.getByTestId('question-prompt').textContent())!;
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page).toHaveURL(attemptUrl.replace('/th/', '/en/'));
  const firstEn = page.getByTestId('question-card-0').getByTestId('question-prompt');
  await expect(firstEn).not.toHaveText(thaiPrompt);
  await expect(firstEn).toHaveText(/[A-Za-z]/);
  await page.getByRole('button', { name: 'ไทย' }).click();
  await expect(page).toHaveURL(attemptUrl);
  await expect(page.getByTestId('question-card-0').getByTestId('question-prompt')).toHaveText(
    thaiPrompt,
  );

  // Answer every question in place; the personalized prompt must contain the company name.
  let sawCompany = false;
  for (let i = 0; i < total; i++) {
    const card = page.getByTestId(`question-card-${i}`);
    const prompt = await card.getByTestId('question-prompt').textContent();
    if (prompt?.includes(company)) sawCompany = true;

    await card.locator('[data-testid^="option-"]').first().click();
    const feedback = card.getByTestId('feedback');
    await expect(feedback).toBeVisible();
    const correct = (await feedback.getAttribute('data-correct')) === 'true';
    if (!correct) {
      await expect(card.locator('[data-state="correct"]')).toHaveCount(1);
      await expect(card.locator('[data-state="incorrect"]')).toHaveCount(1);
      await expect(feedback).toContainText('ไม่ถูกต้อง');
    } else {
      await expect(feedback).toContainText('ถูกต้อง');
    }
    await expect(progress).toHaveAttribute('data-answered', String(i + 1));

    if (i === 1) {
      // Leaving mid-attempt and coming back keeps what was already answered.
      await page.goto('/th/quiz');
      await page.getByTestId('start-quiz').click();
      await expect(page).toHaveURL(attemptUrl);
      await expect(page.getByTestId('attempt-progress')).toHaveAttribute('data-answered', '2');
      await expect(page.getByTestId('question-card-0').getByTestId('feedback')).toBeVisible();
    }
  }
  expect(sawCompany).toBe(true);

  await page.getByTestId('submit-quiz').click();
  await expect(page).toHaveURL(/\/review$/);
  await expect(page.getByTestId('quiz-score')).toContainText(`/ ${total}`);
  await expect(page.getByTestId('review-0')).toBeVisible();

  await page.goto('/th/dashboard');
  await expect(page.getByTestId('stage-quiz-status')).toHaveText('เสร็จสิ้น');
});
