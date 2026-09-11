import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompany } from './seed';

/**
 * Object references that belong to another learner must not resolve (RLS + ownership checks),
 * and admin routes must bounce learners — the IDOR items of the security checklist.
 */
test('a learner cannot open another learner’s attempts, results, calls, or admin pages', async ({
  page,
  request,
}) => {
  const owner = await seedLearnerWithCompany('บริษัท เจ้าของ จำกัด', '2025-01-01');
  const intruder = await seedLearnerWithCompany('บริษัท ผู้บุกรุก จำกัด', '2025-01-01');

  await loginAs(page, owner, E2E_PASSWORD);
  await page.goto('/th/quiz');
  await page.getByTestId('start-quiz').click();
  await page.waitForURL(/\/th\/quiz\/[0-9a-f-]{36}$/);
  const attemptId = page.url().split('/').pop()!;
  await page.getByRole('button', { name: 'ออกจากระบบ' }).click();

  await loginAs(page, intruder, E2E_PASSWORD);
  for (const path of [
    `/th/quiz/${attemptId}`,
    `/th/quiz/${attemptId}/review`,
    `/th/exam/${attemptId}`,
    `/th/exam/${attemptId}/result`,
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
  for (const path of ['/th/admin', '/th/admin/users', '/th/admin/calls', '/th/admin/settings']) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/th\/dashboard$/);
  }

  // Secret-bearing endpoints refuse anonymous and unsigned calls.
  expect((await request.get('/api/cron/notifications')).status()).toBe(401);
  expect((await request.post('/api/webhooks/vapi', { data: {} })).status()).toBe(401);
  expect((await request.get('/api/tts?material=x')).status()).toBe(401);

  // Hardening headers are present on every response.
  const headers = (await request.get('/th/login')).headers();
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['permissions-policy']).toContain('microphone=(self)');
});
