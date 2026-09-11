import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompany, seedPassedExam } from './seed';

test('an eligible learner runs a (fake) bank call; the transcript reaches the admin review page', async ({
  page,
}) => {
  const learner = await seedLearnerWithCompany('บริษัท ฝึกโทรอีทูอี จำกัด', '2025-01-01', {
    head_office_address: '1/1 ถนนตัวอย่าง',
    registered_capital: 1000000,
  });
  await seedPassedExam(learner);
  await loginAs(page, learner, E2E_PASSWORD);
  await expect(page.getByTestId('stage-bank-status')).toHaveText('พร้อมใช้งาน');
  await page.getByTestId('stage-bank').getByRole('link', { name: 'เปิด' }).click();
  await expect(page).toHaveURL(/\/th\/bank-call$/);

  await page.getByTestId('start-call').click();
  await expect(page.getByTestId('call-phase')).toHaveText('กำลังสนทนา');
  await page.getByTestId('simulate-call').click();
  await expect(page.getByTestId('call-phase')).toHaveText('จบการโทรแล้ว');
  const history = page.getByTestId('call-history');
  await expect(history.getByTestId('call-status').first()).toHaveText('เสร็จสิ้น');
  await history.getByText('ดูบทสนทนา').first().click();
  await expect(history.getByText('บริษัท ฝึกโทรอีทูอี จำกัด').first()).toBeVisible();

  await page.goto('/th/dashboard');
  await expect(page.getByTestId('stage-bank-status')).toHaveText('เสร็จสิ้น');
  await page.getByRole('button', { name: 'ออกจากระบบ' }).click();

  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/calls');
  const row = page.locator('tr', { hasText: learner }).first();
  await expect(row.getByTestId('admin-call-status')).toHaveText('completed');
  await row.getByRole('link', { name: 'เปิด' }).click();
  await expect(page.getByTestId('admin-transcript')).toContainText('บริษัท ฝึกโทรอีทูอี จำกัด');
});

test('a learner who has not passed the exam cannot start a call', async ({ page }) => {
  const learner = await seedLearnerWithCompany('บริษัท ยังไม่สอบ จำกัด', '2025-01-01');
  await loginAs(page, learner, E2E_PASSWORD);
  await page.goto('/th/bank-call');
  await expect(page.getByTestId('call-blocked')).toHaveText('ต้องสอบผ่านก่อน');
  await expect(page.getByTestId('start-call')).toHaveCount(0);
});

test('the Vapi webhook rejects calls without the shared secret and ledgers deliveries idempotently', async ({
  request,
}) => {
  const body = {
    message: { type: 'status-update', status: 'ended', call: { id: `e2e-call-${Date.now()}` } },
  };
  expect((await request.post('/api/webhooks/vapi', { data: body })).status()).toBe(401);
  const headers = { 'x-vapi-secret': 'local-vapi-webhook-secret' };
  const first = await request.post('/api/webhooks/vapi', { data: body, headers });
  expect(first.status()).toBe(200);
  expect(await first.json()).toMatchObject({ ok: true, outcome: 'no_session' });
  const second = await request.post('/api/webhooks/vapi', { data: body, headers });
  expect(await second.json()).toMatchObject({ ok: true, outcome: 'duplicate' });
  expect((await request.post('/api/webhooks/vapi', { data: { nope: 1 }, headers })).status()).toBe(
    400,
  );
});
