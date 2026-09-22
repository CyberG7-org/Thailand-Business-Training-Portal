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

  // Switching the UI language mid-attempt shows the same question in that language (D50).
  const thaiPrompt = (await page.getByTestId('question-prompt').textContent())!;
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page).toHaveURL(attemptUrl.replace('/th/', '/en/'));
  await expect(page.getByTestId('question-prompt')).not.toHaveText(thaiPrompt);
  await expect(page.getByTestId('question-prompt')).toHaveText(/[A-Za-z]/);
  await page.getByRole('button', { name: 'ไทย' }).click();
  await expect(page).toHaveURL(attemptUrl);
  await expect(page.getByTestId('question-prompt')).toHaveText(thaiPrompt);

  // Answer questions one by one; the personalized prompt must contain the company name.
  const total = Number(
    (await page.getByText(/ข้อ 1 จาก (\d+)/).textContent())?.match(/จาก (\d+)/)?.[1] ?? '0',
  );
  expect(total).toBeGreaterThan(0);
  let sawCompany = false;
  for (let i = 0; i < total; i++) {
    await expect(page.getByText(`ข้อ ${i + 1} จาก ${total}`)).toBeVisible();
    const prompt = await page.getByTestId('question-prompt').textContent();
    if (prompt?.includes(company)) sawCompany = true;

    // Pick a deliberately wrong-looking option first time, then check feedback semantics.
    const buttons = page.locator('[data-testid^="option-"]');
    await buttons.first().click();
    const feedback = page.getByTestId('feedback');
    await expect(feedback).toBeVisible();
    const correct = (await feedback.getAttribute('data-correct')) === 'true';
    if (!correct) {
      await expect(page.locator('[data-state="correct"]')).toHaveCount(1);
      await expect(page.locator('[data-state="incorrect"]')).toHaveCount(1);
      await expect(feedback).toContainText('ไม่ถูกต้อง');
    } else {
      await expect(feedback).toContainText('ถูกต้อง');
    }

    if (i === 1) {
      // Leaving mid-attempt and coming back resumes at the next unanswered question.
      await page.goto('/th/quiz');
      await page.getByTestId('start-quiz').click();
      await expect(page).toHaveURL(attemptUrl);
      await expect(page.getByText(`ข้อ ${i + 2} จาก ${total}`)).toBeVisible();
      continue;
    }
    await page.getByTestId('next-question').click();
  }
  expect(sawCompany).toBe(true);

  await page.getByTestId('submit-quiz').click();
  await expect(page).toHaveURL(/\/review$/);
  await expect(page.getByTestId('quiz-score')).toContainText(`/ ${total}`);
  await expect(page.getByTestId('review-0')).toBeVisible();

  await page.goto('/th/dashboard');
  await expect(page.getByTestId('stage-quiz-status')).toHaveText('เสร็จสิ้น');
});
