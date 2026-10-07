import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompany, seedPassedExam } from './seed';

/**
 * The dashboard from the design handoff (Dashboard v4): the hero with the company pill, the
 * next step and its CTA, the progress ring, the six-step stepper, the "Your steps" list and the
 * company card. What it says must follow the learner's real progress.
 */
test('a new learner sees the company, the first step current, and the interview locked', async ({
  page,
}) => {
  const loginId = await seedLearnerWithCompany('บริษัท แดชบอร์ดใหม่ จำกัด', '2026-07-13');
  await loginAs(page, loginId, E2E_PASSWORD);
  await expect(page.getByTestId('hero-kicker')).toContainText('บริษัท แดชบอร์ดใหม่ จำกัด');
  await expect(page.getByRole('img', { name: 'เสร็จแล้ว 0 จาก 4 ขั้นตอน' })).toBeVisible();

  const stepper = page.getByTestId('stepper');
  await expect(stepper.getByRole('listitem')).toHaveCount(4);
  await expect(stepper.getByRole('listitem').nth(1)).toHaveText(/นามบัตร/);
  await expect(stepper.locator('[aria-current="step"]')).toHaveText(/เอกสารเรียนรู้/);

  await expect(page.getByRole('link', { name: 'ไปที่เอกสารเรียนรู้' })).toHaveAttribute(
    'href',
    '/th/study',
  );
  await expect(page.getByRole('link', { name: 'ดูผลล่าสุด' })).toHaveCount(0);
  await expect(page.getByTestId('stage-interview')).toHaveAttribute('data-locked', 'true');
  await expect(page.getByTestId('stage-appointment')).toHaveCount(0);
  // The card: the quiz not taken yet, its pass mark, and the interview waiting on it.
  await expect(page.getByTestId('exam-score')).toHaveText('ยังไม่ได้ทำ');
  await expect(page.getByTestId('quiz-pass-mark')).toHaveText(/^เกณฑ์ผ่าน \d+ \/ 30$/);
  await expect(page.getByTestId('interview-status')).toHaveText('หลังผ่านแบบทดสอบ');
  await expect(page.getByTestId('stage-study').getByRole('link', { name: 'เปิด' })).toHaveAttribute(
    'href',
    '/th/study',
  );
});

test('after a passed exam the next step moves on and the last result is one click away', async ({
  page,
}) => {
  const loginId = await seedLearnerWithCompany('บริษัท สอบผ่านแล้ว จำกัด', '2026-07-13');
  await seedPassedExam(loginId);
  await loginAs(page, loginId, E2E_PASSWORD);
  // The name card is standalone (D88): the next step after the quiz is the interview.
  await expect(page.getByTestId('stepper').locator('[aria-current="step"]')).toHaveText(
    /สัมภาษณ์ความพร้อมกับธนาคาร/,
  );
  await expect(page.getByTestId('exam-score')).toHaveText('1 / 1');
  await expect(page.getByTestId('interview-status')).toHaveText('ยังไม่ได้เริ่ม');
  await expect(page.getByRole('link', { name: 'ดูผลล่าสุด' })).toHaveAttribute(
    'href',
    /\/th\/exam\/[0-9a-f-]{36}\/result$/,
  );
  await expect(page.getByRole('img', { name: 'เสร็จแล้ว 1 จาก 4 ขั้นตอน' })).toBeVisible();
});

test('the dashboard fits a phone with four direct training actions', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  const loginId = await seedLearnerWithCompany('บริษัท มือถือ จำกัด', '2026-07-13', {
    company_name_en: 'MOBILE COMPANY CO., LTD.',
    registered_on: '2026-04-10',
    registered_capital: 2_000_000,
    head_office_address: 'เลขที่ 99/9 หมู่ 1 ตำบลหนองใหญ่ จังหวัดร้อยเอ็ด',
    directors: [{ name_th: 'นางสาวตัวอย่าง ทดสอบ', name_en: null }],
    website: null,
    facebook_page: 'https://www.facebook.com/mobilecompany',
    structured_data: {
      business: {
        objectives: [
          { no: 1, text: 'ซื้อ ขาย จัดหา รับ เช่า เช่าซื้อ' },
          { no: 2, text: 'ประกอบกิจการนำเข้าและส่งออก' },
        ],
        shareholders: [
          {
            name: 'นางสาวตัวอย่าง ทดสอบ',
            nationality: 'ไทย',
            shares: 850,
            percent: 85,
          },
        ],
      },
    },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, loginId, E2E_PASSWORD);
  await expect(page.getByTestId('stepper')).toContainText('ศึกษา');
  await expect(page.locator('[data-mobile-action="true"]')).toHaveCount(4);
  await expect(page.getByTestId('stage-study').getByRole('link', { name: 'เปิด' })).toBeVisible();
  await expect(page.getByTestId('stage-open-chevron').first()).toBeHidden();
  await expect(page.getByTestId('stage-appointment')).toBeHidden();
  await expect(page.getByText('ทำตามขั้นตอนการฝึกอบรมตามลำดับ')).toBeVisible();
  await expect(page.getByTestId('company-name')).toBeVisible();
  await expect(page.getByTestId('company-detail-address')).toBeVisible();
  await expect(page.getByTestId('company-detail-directors')).toContainText('นางสาวตัวอย่าง ทดสอบ');
  await expect(page.getByTestId('company-detail-shareholders')).toContainText('85%');
  await expect(page.getByTestId('company-detail-objectives')).toContainText('2 รายการ');
  await expect(page.getByTestId('company-products')).toContainText('ซื้อ ขาย จัดหา');
  await expect(page.getByTestId('company-detail-facebook')).toBeVisible();
  await expect(page.getByTestId('company-detail-website')).toHaveCount(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  expect(consoleErrors).toEqual([]);
});
