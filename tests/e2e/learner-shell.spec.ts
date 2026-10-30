import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompany } from './seed';

test('the desktop learner shell owns navigation, breadcrumbs, and the upward profile menu', async ({
  page,
}) => {
  const loginId = await seedLearnerWithCompany('บริษัท เชลล์ผู้เรียน จำกัด', '2026-07-13');
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAs(page, loginId, E2E_PASSWORD);
  await page.goto('/en/dashboard');

  const sidebar = page.getByTestId('learner-sidebar');
  const header = page.getByTestId('learner-shell-header');
  const nav = page.getByTestId('learner-shell-nav');
  const profile = page.getByTestId('learner-profile-trigger');
  await expect(sidebar).toBeVisible();
  expect((await sidebar.boundingBox())?.width).toBe(248);
  await expect(sidebar).toContainText('Business Training Portal');
  await expect(sidebar).toContainText('Learner');
  await expect(header).toContainText('Home');
  await expect(header).not.toContainText(loginId);
  await expect(nav.getByRole('link')).toHaveText([
    'Home',
    'Study',
    'Quiz',
    'Interview',
    'Namecard',
  ]);
  await expect(nav.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByTestId('learner-stage-tabs')).toHaveCount(0);

  await profile.click();
  const profileMenu = page.getByRole('menu', { name: 'Profile' });
  await expect(profileMenu).toBeVisible();
  const [menuBox, profileBox] = await Promise.all([
    profileMenu.boundingBox(),
    profile.boundingBox(),
  ]);
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(profileBox!.y);

  await page.getByRole('button', { name: 'Collapse menu' }).click();
  await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(64);
  await expect(profileMenu).toBeHidden();

  await page.reload();
  await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
  await page.getByRole('button', { name: 'Expand menu' }).click();
  await nav.getByRole('link', { name: 'Study', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/study$/);
  await expect(header).toContainText('Training');
  await expect(header).toContainText('Study');
  await expect(nav.getByRole('link', { name: 'Study', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('the mobile learner drawer traps focus, closes after navigation, and uses numbered steps', async ({
  page,
}) => {
  const loginId = await seedLearnerWithCompany('บริษัท ลิ้นชักผู้เรียน จำกัด', '2026-07-13');
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, loginId, E2E_PASSWORD);
  await page.goto('/en/dashboard');

  const header = page.getByTestId('learner-shell-header');
  const drawer = page.getByTestId('learner-sidebar');
  const openMenu = page.getByRole('button', { name: 'Open menu' });
  const language = page.getByTestId('language-menu-button');
  await expect(header).toContainText('Business Training Portal');
  await expect(drawer).toBeHidden();
  expect((await language.boundingBox())?.width).toBe(76);
  expect((await language.boundingBox())?.height).toBe(44);

  for (const key of ['study', 'exam', 'interview', 'nameCard']) {
    await expect(page.getByTestId(`stage-number-${key}`)).toBeVisible();
    await expect(page.getByTestId(`stage-icon-${key}`)).toBeHidden();
  }

  await openMenu.click();
  await expect(drawer).toBeVisible();
  await expect(page.getByTestId('learner-drawer-scrim')).toBeVisible();
  expect((await drawer.boundingBox())?.width).toBe(288);
  await expect(drawer.getByRole('button', { name: 'Close menu' })).toBeFocused();
  await page.getByTestId('learner-profile-trigger').focus();
  await page.keyboard.press('Tab');
  await expect(
    drawer.getByRole('link', { name: 'Business Training Portal', exact: true }),
  ).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(openMenu).toBeFocused();

  await openMenu.click();
  await drawer.getByRole('link', { name: 'Study', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/study$/, { timeout: 15_000 });
  await expect(drawer).toBeHidden();
  await expect(page.getByTestId('learner-stage-tabs')).toHaveCount(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('desktop dashboard step cards retain their icons', async ({ page }) => {
  const loginId = await seedLearnerWithCompany('บริษัท ไอคอนผู้เรียน จำกัด', '2026-07-13');
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAs(page, loginId, E2E_PASSWORD);
  await page.goto('/en/dashboard');

  for (const key of ['study', 'exam', 'interview', 'nameCard']) {
    await expect(page.getByTestId(`stage-icon-${key}`)).toBeVisible();
    await expect(page.getByTestId(`stage-number-${key}`)).toBeHidden();
  }
});
