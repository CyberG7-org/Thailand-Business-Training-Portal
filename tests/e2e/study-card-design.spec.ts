import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { ensureStarterCards, seedLearnerWithCompany, seedStudyCard, setPolicy } from './seed';

/**
 * The study card says where it sits in the course without a competing back control. Its footer
 * leads to the next card (and, under "completed" tracking, marks the card done), and the table
 * becomes readable question-and-answer cards on a phone.
 */
test('a card shows its place in the list, leads to the next card, and the list records the read', async ({
  page,
}) => {
  await ensureStarterCards();
  const loginId = await seedLearnerWithCompany('บริษัท อ่านบทเรียน จำกัด', '2026-07-13');
  await loginAs(page, loginId, E2E_PASSWORD);
  await page.goto('/th/study');
  const total = await page.locator('[data-testid^="study-item-"]').count();
  await page.locator('[data-testid^="study-item-"][data-current="true"]').click();
  await expect(page.getByTestId('study-title')).toBeVisible();
  await expect(page.getByTestId('learner-stage-tabs')).toBeAttached();
  await expect(page.getByTestId('learner-stage-tab-home')).toHaveAttribute('href', '/th/dashboard');
  await expect(page.getByTestId('learner-stage-tab-study')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('study-previous')).toHaveCount(0);

  const segments = page.getByTestId('card-segments');
  await expect(segments).toContainText(`บทเรียนที่ 1 จาก ${total}`);
  await expect(segments.locator('[data-state]')).toHaveCount(total);
  await expect(segments.locator('[data-state]').first()).toHaveAttribute('data-state', 'current');
  await expect(page.getByTestId('nav-back')).toHaveCount(0);

  const next = page.getByTestId('study-next');
  await expect(next).toContainText('บทเรียนที่ 2:');
  await next.click();
  await expect(page).toHaveURL(/\/th\/study\/[^/]+$/);
  await expect(page.getByTestId('card-segments')).toContainText(`บทเรียนที่ 2 จาก ${total}`);
  await expect(page.getByTestId('study-previous')).toContainText('บทเรียนก่อนหน้า (1)');
  await page.getByTestId('study-previous').click();
  await expect(page.getByTestId('card-segments')).toContainText(`บทเรียนที่ 1 จาก ${total}`);
  await expect(page.getByTestId('card-segments').locator('[data-state]').nth(1)).toHaveAttribute(
    'data-state',
    'done',
  );
  await page.goto('/th/study');
  await page.locator('[data-testid^="study-item-"]').last().click();
  await expect(page.getByTestId('study-attend-quiz')).toHaveAttribute('href', '/th/exam');
});

test('under "completed" tracking the footer marks the card done', async ({ page }) => {
  await ensureStarterCards();
  await setPolicy('study_completion_tracking', 'completed');
  try {
    const loginId = await seedLearnerWithCompany('บริษัท ทำเครื่องหมาย จำกัด', '2026-07-13');
    await loginAs(page, loginId, E2E_PASSWORD);
    await page.goto('/th/study');
    await page.locator('[data-testid^="study-item-"][data-current="true"]').click();
    await expect(page.getByTestId('study-title')).toBeVisible();
    await page.getByRole('button', { name: 'ทำเครื่องหมายว่าเรียนจบแล้ว' }).click();
    await expect(page.getByTestId('study-completed')).toBeVisible();
    await page.goto('/th/study');
    await expect(page.getByTestId('study-segments').locator('[data-state="done"]')).toHaveCount(1);
  } finally {
    await setPolicy('study_completion_tracking', 'viewed');
  }
});

test('on a phone the card table stacks and nothing overflows', async ({ page }) => {
  const loginId = await seedLearnerWithCompany('บริษัท บทเรียนมือถือ จำกัด', '2026-07-13');
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, loginId, E2E_PASSWORD);
  const key = await seedStudyCard();
  await page.goto('/th/study/' + key);
  await expect(page.getByTestId('study-body')).toBeVisible();
  await expect(page.getByTestId('learner-stage-tabs')).toBeVisible();
  const table = page.getByTestId('study-body').locator('table').first();
  await expect(table).toBeVisible();
  await expect(table.locator('thead')).toBeHidden();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
