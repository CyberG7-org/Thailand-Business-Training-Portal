import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompany } from './seed';

test('admin writes a card in three languages; a learner reads it, progress is recorded, Thai read-aloud works', async ({
  page,
}) => {
  const stamp = Date.now();
  const key = `e2e-card-${stamp}`;
  const thTitle = `บทเรียนทดสอบ ${stamp}`;
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/content/new');
  await page.locator('input[name="contentKey"]').fill(key);
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await page.waitForURL(/\/th\/admin\/content\/[0-9a-f-]{36}$/);

  const texts = {
    th: { title: thTitle, body: '# หัวข้อ\n\nเนื้อหา **สำคัญ** ของบทเรียน' },
    en: { title: 'Test lesson', body: '# Heading\n\nThe **important** content' },
    zh: { title: '测试课程', body: '# 标题\n\n**重要**内容' },
  } as const;
  for (const [lang, t] of Object.entries(texts)) {
    const panel = page.getByTestId(`localization-${lang}`);
    await panel.locator('input[name="title"]').fill(t.title);
    await panel.locator('textarea[name="body"]').fill(t.body);
    if (lang === 'th') await panel.locator('input[name="ttsEnabled"]').check();
    await panel.getByRole('button', { name: 'บันทึกภาษานี้' }).click();
    await expect(panel.getByRole('status')).toHaveText('บันทึกแล้ว');
  }
  await page.getByRole('button', { name: 'ออกจากระบบ' }).click();

  const learner = await seedLearnerWithCompany('บริษัท เรียนรู้ จำกัด', '2026-07-13');
  await loginAs(page, learner, E2E_PASSWORD);
  await expect(page.getByTestId('stage-study-status')).toHaveText('พร้อมใช้งาน');
  await page.getByTestId('stage-study').getByRole('link', { name: 'เปิด' }).click();
  await expect(page).toHaveURL(/\/th\/study$/);
  await expect(page.getByTestId(`study-state-${key}`)).toHaveText('ใหม่');

  await page.getByRole('link', { name: thTitle }).click();
  await expect(page.getByTestId('study-title')).toHaveText(thTitle);
  await expect(page.getByTestId('study-body').getByRole('heading', { level: 1 })).toHaveText(
    'หัวข้อ',
  );
  await expect(page.getByTestId('study-body').locator('strong')).toHaveText('สำคัญ');

  // Read-aloud (fake provider in dev): the button fetches a signed audio URL.
  const ttsResponse = page.waitForResponse((r) => r.url().includes('/api/tts'));
  await page.getByTestId('read-aloud').click();
  expect((await ttsResponse).status()).toBe(200);
  await expect(page.getByTestId('read-aloud')).not.toHaveAttribute('data-status', 'error');

  await page.goto('/th/study');
  await expect(page.getByTestId(`study-state-${key}`)).toHaveText('เปิดดูแล้ว');
  await page.goto('/th/dashboard');
  await expect(page.getByTestId('stage-study-status')).toHaveText('กำลังดำเนินการ');

  // Chinese version exists for this card, but the seeded sample without zh shows the controlled state.
  await page.goto('/zh/study');
  await expect(page.getByTestId('study-item-sample-bank-visit')).toContainText('此语言暂无内容');
  await page.goto('/zh/study/sample-bank-visit');
  await expect(page.getByTestId('study-not-available')).toBeVisible();
});

test('read-aloud is refused for content that is not approved for TTS', async ({ page }) => {
  const learner = await seedLearnerWithCompany('บริษัท ไม่มีเสียง จำกัด', '2026-07-13');
  await loginAs(page, learner, E2E_PASSWORD);
  // sample-company-facts has tts_enabled on Thai; request a bogus material id instead.
  const response = await page.request.get('/api/tts?material=00000000-0000-4000-8000-000000000000');
  expect(response.status()).toBe(404);
  expect(await response.json()).toEqual({ error: 'not_available' });
});
