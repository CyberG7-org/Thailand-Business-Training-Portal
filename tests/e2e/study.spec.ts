import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedAllCardsViewed, seedLearnerWithCompany, seedLocalizedStudyCard } from './seed';

test('a learner reads a card in three languages, progress is recorded, Thai read-aloud works', async ({
  page,
}) => {
  const stamp = Date.now();
  const key = `e2e-card-${stamp}`;
  const thTitle = `บทเรียนทดสอบ ${stamp}`;
  // Staff no longer write cards (D81); the card is put in place the way the starter cards are.
  await seedLocalizedStudyCard(key, {
    th: { title: thTitle, body: '# หัวข้อ\n\nเนื้อหา **สำคัญ** ของบทเรียน', ttsEnabled: true },
    en: { title: 'Test lesson', body: '# Heading\n\nThe **important** content' },
    zh: { title: '测试课程', body: '# 标题\n\n**重要**内容' },
  });
  const missingChineseKey = `e2e-no-zh-${stamp}`;
  await seedLocalizedStudyCard(missingChineseKey, {
    th: { title: 'บทเรียนไม่มีภาษาจีน', body: 'เนื้อหาภาษาไทย' },
    en: { title: 'Lesson without Chinese', body: 'English content' },
  });

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
  await expect(page.getByTestId(`study-state-${key}`)).toHaveText('เรียนจบแล้ว');
  await page.goto('/th/dashboard');
  await expect(page.getByTestId('stage-study-status')).toHaveText('กำลังดำเนินการ');

  // Chinese exists for the first card; a deliberately incomplete card shows the controlled state.
  await page.goto('/zh/study');
  await expect(page.getByTestId(`study-item-${missingChineseKey}`)).toContainText('此语言暂无内容');
  await page.goto(`/zh/study/${missingChineseKey}`);
  await expect(page.getByTestId('study-not-available')).toBeVisible();
});

/** "All cards done" on the study list is what the steps call Done (the owner, 2026-10-02). */
test('study is done once every card is opened', async ({ page }) => {
  const learner = await seedLearnerWithCompany('บริษัท อ่านครบ จำกัด', '2026-07-13');
  await seedAllCardsViewed(learner);
  await loginAs(page, learner, E2E_PASSWORD);
  await expect(page.getByTestId('stage-study-status')).toHaveText('เสร็จสิ้น');
  await page.goto('/th/study');
  const studyItems = page.locator('[data-testid^="study-item-"]');
  await expect(page.locator('[data-testid^="study-item-"][data-current="true"]')).toHaveCount(0);
  const total = await studyItems.count();
  await expect(page.getByTestId('study-summary')).toContainText(`${total}/${total}`);
  await expect(page.getByTestId('learner-stage-tab-study')).toHaveCount(0);
});

test("a card not written in the reader's language is not waited for", async ({ page }) => {
  const learner = await seedLearnerWithCompany('บริษัท อ่านภาษาจีน จำกัด', '2026-07-13');
  await seedLocalizedStudyCard(`e2e-th-en-only-${Date.now()}`, {
    th: { title: 'บทเรียนเฉพาะไทย', body: 'เนื้อหาภาษาไทย' },
    en: { title: 'Thai and English only', body: 'English content' },
  });
  // Every card that has Chinese is opened; the deliberately incomplete card is not.
  await seedAllCardsViewed(learner, 'zh');
  await loginAs(page, learner, E2E_PASSWORD);
  await page.goto('/zh/dashboard');
  await expect(page.getByTestId('stage-study-status')).toHaveText('已完成');
  // In Thai the incomplete card can be opened, and it is not yet.
  await page.goto('/th/dashboard');
  await expect(page.getByTestId('stage-study-status')).toHaveText('กำลังดำเนินการ');
});

test('read-aloud is refused for content that is not approved for TTS', async ({ page }) => {
  const learner = await seedLearnerWithCompany('บริษัท ไม่มีเสียง จำกัด', '2026-07-13');
  await loginAs(page, learner, E2E_PASSWORD);
  // Request a bogus material id so no approved Thai TTS localization exists.
  const response = await page.request.get('/api/tts?material=00000000-0000-4000-8000-000000000000');
  expect(response.status()).toBe(404);
  expect(await response.json()).toEqual({ error: 'not_available' });
});
