import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_LEARNER, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompany } from './seed';

test('a learner sees their company and the interview locked behind the exam, the appointment behind the interview', async ({
  page,
}) => {
  const loginId = await seedLearnerWithCompany('บริษัท แดชบอร์ด จำกัด', '2099-01-01');
  await loginAs(page, loginId, E2E_PASSWORD);
  await expect(page.getByTestId('company-name')).toHaveText('บริษัท แดชบอร์ด จำกัด');
  // Default policy: exam pass required before the interview (decision D9, renamed in P16).
  await expect(page.getByTestId('stage-interview-status')).toHaveText('ล็อก');
  await expect(page.getByTestId('stage-interview')).toContainText(
    'ต้องผ่านแบบทดสอบความรู้ธุรกิจก่อน',
  );
  await expect(page.getByTestId('stage-appointment-status')).toHaveText('ล็อก');
  await expect(page.getByTestId('stage-appointment')).toContainText(
    'ต้องผ่านการสัมภาษณ์ความพร้อมกับธนาคารก่อน',
  );
  await expect(page.getByTestId('stage-quiz-status')).toHaveText('พร้อมใช้งาน');
  await expect(page.getByTestId('stage-study-status')).toHaveText('พร้อมใช้งาน');
});

test('a learner whose certificate has no issue date still sees the pending reason on the company card', async ({
  page,
}) => {
  const loginId = await seedLearnerWithCompany('บริษัท ไม่มีวันที่ จำกัด', null);
  await loginAs(page, loginId, E2E_PASSWORD);
  await expect(page.getByTestId('company-name')).toHaveText('บริษัท ไม่มีวันที่ จำกัด');
  await expect(page.getByTestId('stage-appointment-status')).toHaveText('ล็อก');
});

test('a learner with no assignment sees the no-company message and every stage locked', async ({
  page,
}) => {
  await loginAs(page, E2E_LEARNER.loginId, E2E_PASSWORD);
  await expect(page.getByTestId('no-company')).toBeVisible();
  for (const stage of ['study', 'quiz', 'exam', 'nameCard', 'interview', 'appointment']) {
    await expect(page.getByTestId(`stage-${stage}-status`)).toHaveText('ล็อก');
  }
});

test('the admin sees each learner on the Learner Record, with or without a company', async ({
  page,
}) => {
  const assigned = await seedLearnerWithCompany('บริษัท ความคืบหน้า จำกัด', '2026-07-13');
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/learners');
  await expect(page.getByTestId(`company-${assigned}`)).toHaveText('บริษัท ความคืบหน้า จำกัด');
  await expect(page.getByTestId(`issued-${assigned}`)).toHaveText('13 กรกฎาคม 2569');
  // Nothing taken yet: no result and nothing to open.
  await expect(page.getByTestId(`mcq-${assigned}`)).toHaveText('—');
  await expect(page.getByTestId(`chatbot-${assigned}`)).toHaveText('—');
  await expect(page.getByTestId(`company-${E2E_LEARNER.loginId}`)).toHaveText('—');
});
