import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompany, seedStudyCard, setPolicy } from './seed';

/**
 * The study card from the design handoff (02): the band says which card this is, the back pill
 * leads to the list, the article's footer leads to the next card (and, under "completed"
 * tracking, marks the card done), and the table stacks on a phone.
 */
test('a card shows its place in the list, leads to the next card, and the list records the read', async ({
  page,
}) => {
  const loginId = await seedLearnerWithCompany('บริษัท อ่านบทเรียน จำกัด', '2026-07-13');
  await loginAs(page, loginId, E2E_PASSWORD);
  await page.goto('/th/study');
  const total = await page.locator('[data-testid^="study-item-"]').count();
  await page.getByTestId('study-continue').click();
  await expect(page.getByTestId('study-title')).toBeVisible();

  const segments = page.getByTestId('card-segments');
  await expect(segments).toContainText(`บทเรียนที่ 1 จาก ${total}`);
  await expect(segments.locator('[data-state]')).toHaveCount(total);
  await expect(segments.locator('[data-state]').first()).toHaveAttribute('data-state', 'current');
  await expect(page.getByTestId('nav-back')).toHaveText(/เอกสารเรียนรู้/);
  await expect(page.getByTestId('nav-back')).toHaveAttribute('href', '/th/study');

  const next = page.getByTestId('study-next');
  await expect(next).toContainText('บทเรียนที่ 2:');
  await next.click();
  await expect(page).toHaveURL(/\/th\/study\/[^/]+$/);
  await expect(page.getByTestId('card-segments')).toContainText(`บทเรียนที่ 2 จาก ${total}`);
  await expect(page.getByTestId('card-segments').locator('[data-state]').first()).toHaveAttribute(
    'data-state',
    'done',
  );
});

test('under "completed" tracking the footer marks the card done', async ({ page }) => {
  await setPolicy('study_completion_tracking', 'completed');
  try {
    const loginId = await seedLearnerWithCompany('บริษัท ทำเครื่องหมาย จำกัด', '2026-07-13');
    await loginAs(page, loginId, E2E_PASSWORD);
    await page.goto('/th/study');
    await page.getByTestId('study-continue').click();
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
  const table = page.getByTestId('study-body').locator('table').first();
  await expect(table).toBeVisible();
  await expect(table.locator('thead')).toBeHidden();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
