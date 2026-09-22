import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompany, setPolicy } from './seed';

test('learner takes the exam without feedback, sees pass/fail; notifications are queued and drained by the cron', async ({
  page,
  request,
}) => {
  await setPolicy('telegram_admin_chat_ids', ['e2e-chat']);
  await setPolicy('email_admin_recipients', ['e2e@example.com']);
  const learner = await seedLearnerWithCompany('บริษัท สอบอีทูอี จำกัด', '2026-07-13');
  await loginAs(page, learner, E2E_PASSWORD);
  await expect(page.getByTestId('stage-exam-status')).toHaveText('พร้อมใช้งาน');
  await page.getByTestId('stage-exam').getByRole('link', { name: 'เปิด' }).click();
  await page.getByTestId('start-exam').click();
  await page.waitForURL(/\/th\/exam\/[0-9a-f-]{36}$/);
  const attemptId = page.url().split('/').pop()!;

  const total = Number(
    (await page.getByText(/ข้อ 1 จาก (\d+)/).textContent())?.match(/จาก (\d+)/)?.[1] ?? '0',
  );
  expect(total).toBeGreaterThan(0);
  for (let i = 0; i < total; i++) {
    await expect(page.getByText(`ข้อ ${i + 1} จาก ${total}`)).toBeVisible();
    await page.getByTestId('option-A').click();
    // No correctness feedback during the exam (EXAM-002): only "saved".
    await expect(page.getByTestId('saved')).toBeVisible();
    await expect(page.getByTestId('feedback')).toHaveCount(0);
    await page.getByTestId('next-question').click();
  }
  await page.getByTestId('submit-exam').click();
  await expect(page).toHaveURL(/\/result$/);
  await expect(page.getByTestId('exam-result')).toHaveAttribute('data-result', /pass|fail/);
  await expect(page.getByTestId('exam-score')).toContainText(`/ ${total}`);
  // The result reviews every question like the quiz does: the correct option is marked (D51).
  await expect(page.getByTestId('review-0')).toBeVisible();
  await expect(page.locator('[data-testid^="review-"]')).toHaveCount(total);
  await expect(page.getByTestId('review-0').locator('[data-state="correct"]')).toHaveCount(1);

  await page.goto('/th/dashboard');
  await expect(page.getByTestId('stage-exam-status')).toHaveText(/เสร็จสิ้น|กำลังดำเนินการ/);
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
