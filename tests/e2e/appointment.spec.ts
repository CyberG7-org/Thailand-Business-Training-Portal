import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './fixtures';
import { loginAs, switchTo } from './helpers';
import { THAI_BANK_HOLIDAYS_2026 } from '../../lib/config/policy-defaults';
import { seedManager, seedTeamLearner } from './seed';

/**
 * Spec §11: ready learner → appointment locked by date → past the date → a slot booked → the
 * manager sees it → a second learner cannot take the slot → the learner cancels → the slot is
 * free again. Bookings target a day two weeks out so notice hours and holidays stay clear.
 */
const slotIso = (date: string, hour: number) =>
  new Date(date + 'T' + String(hour).padStart(2, '0') + ':00:00+07:00').toISOString();

function twoWeeksOut(): string {
  // The first open day from fourteen days out, as a Bangkok date: a bank holiday offers no slot.
  for (let days = 14; ; days++) {
    const d = new Date(Date.now() + days * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
    if (!THAI_BANK_HOLIDAYS_2026.includes(d)) return d;
  }
}

test('the appointment waits for the date, then a slot is booked, seen by the manager, held against a teammate and freed on cancel', async ({
  page,
}) => {
  const manager = await seedManager('ผู้จัดการนัดหมาย');
  const waiting = await seedTeamLearner(manager.id, 'บริษัท รอวันนัด จำกัด', '2026-09-20');
  const booker = await seedTeamLearner(manager.id, 'บริษัท จองนัด จำกัด', '2026-01-05');
  const mate = await seedTeamLearner(manager.id, 'บริษัท เพื่อนร่วมทีม จำกัด', '2026-01-05');
  const from = twoWeeksOut();

  // Ready but before the 45th day: locked with the date, no picker.
  await loginAs(page, waiting, E2E_PASSWORD);
  await expect(page.getByTestId('stage-appointment')).toContainText('จองได้ตั้งแต่');
  await page.goto('/th/appointment');
  await expect(page.getByTestId('appointment-blocked')).toContainText('จองได้ตั้งแต่');

  // Past the date: the week shows free slots; the first one is booked.
  await switchTo(page, booker, E2E_PASSWORD);
  await page.goto(`/th/appointment?from=${from}`);
  const free = page.locator('[data-testid^="slot-"][data-state="free"]').first();
  const slotId = await free.getAttribute('data-testid');
  await free.click();
  await expect(page.getByTestId('booking-card')).toBeVisible();
  await page.goto('/th/dashboard');
  await expect(page.getByTestId('stage-appointment-status')).toHaveText('เสร็จสิ้น');
  await expect(page.getByTestId('stage-appointment')).toContainText('ผู้จัดการนัดหมาย');

  // The manager sees it under their team, with the company.
  await switchTo(page, manager.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/appointments');
  await expect(page.locator('[data-testid^="admin-appointment-"]').first()).toContainText(
    'บริษัท จองนัด จำกัด',
  );
  // The manager blocks the afternoon; the block shows on the list.
  const blockForm = page.getByTestId('block-form');
  await blockForm.locator('input[name="date"]').fill(from);
  await blockForm.locator('input[name="fromHour"]').fill('13');
  await blockForm.locator('input[name="toHour"]').fill('16');
  await blockForm.locator('input[name="reason"]').fill('ประชุมทีม');
  await blockForm.getByRole('button', { name: 'ปิดช่วงเวลา' }).click();
  await expect(
    page.locator('[data-testid^="block-"]').filter({ hasText: 'ประชุมทีม' }),
  ).toHaveCount(1);

  // A teammate sees the same slot taken and cannot click it.
  await switchTo(page, mate, E2E_PASSWORD);
  await page.goto(`/th/appointment?from=${from}`);
  const taken = page.getByTestId(slotId!);
  await expect(taken).toHaveAttribute('data-state', 'booked');
  await expect(taken).toBeDisabled();
  await expect(page.getByTestId('slot-' + slotIso(from, 13))).toHaveAttribute(
    'data-state',
    'blocked',
  );

  // The booker cancels; the slot is free for the teammate.
  await switchTo(page, booker, E2E_PASSWORD);
  await page.goto('/th/appointment');
  await page.getByTestId('cancel-booking').click();
  await expect(page.getByTestId('booking-card')).toHaveCount(0);
  await switchTo(page, mate, E2E_PASSWORD);
  await page.goto(`/th/appointment?from=${from}`);
  await expect(page.getByTestId(slotId!)).toHaveAttribute('data-state', 'free');
});

test('the picker fits a phone and walks week by week', async ({ page }) => {
  const manager = await seedManager('ผู้จัดการมือถือ');
  const learner = await seedTeamLearner(manager.id, 'บริษัท นัดมือถือ จำกัด', '2026-01-05');
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, learner, E2E_PASSWORD);
  await page.goto('/th/appointment');
  await expect(page.locator('[data-testid^="day-"]')).toHaveCount(7);
  await page.getByTestId('week-next').click();
  await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}/);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
