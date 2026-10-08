import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs, switchTo } from './helpers';
import { seedLearnerWithCompany, seedLearnerWithCompleteCompany, seedPassedExam } from './seed';

/**
 * The readiness interview with the fake officer (spec §4.6): it asks the plan's Thai questions,
 * marks an answer correct when it carries the record's value and evasive on "ไม่ทราบ". The
 * friendly v2 plan always asks all 11 questions, offers one retry and passes at 9 correct.
 */
const GOOD: Record<string, string> = {
  registration_number: '0105568233704',
  registered_address: 'เลขที่ 87 หมู่ที่ 9 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด',
  actual_business: 'ค้าส่งและค้าปลีกเสื้อผ้า',
  products_services: 'ชุดเดรส เสื้อ กระโปรงสตรี',
  authorized_representative: 'นางสาวกุลธิดา พลเยี่ยม',
  attendee_identity: 'นางสาวกุลธิดา พลเยี่ยม กรรมการ',
  registration_date: '16 เมษายน 2569',
  account_purpose:
    'เพื่อใช้ทำธุรกรรมทางการเงินของบริษัท รับเงินจากลูกค้าและจ่ายค่าใช้จ่ายของกิจการ',
  customer_profile: 'ส่วนใหญ่เป็นลูกค้าธุรกิจและลูกค้าบุคคลทั่วไปในประเทศไทย',
  transaction_details:
    'ลูกค้าชำระด้วยการโอนเงินผ่านธนาคารและ PromptPay / QR เฉลี่ยรายการละประมาณ 10,000 บาท',
};
const FALLBACK = 'บริษัทดำเนินกิจการตามปกติ มีลูกค้าประจำในประเทศไทย';

/** Answers whatever the officer asks until the debrief appears. */
async function answerUntilClosed(page: Page, answer: (concept: string) => string) {
  for (let i = 0; i < 40; i++) {
    if (await page.getByTestId('interview-verdict').count()) return;
    const messages = page.getByTestId('chat-message');
    const before = await messages.count();
    const concept = (await messages.last().getAttribute('data-concept')) ?? '';
    await page.getByTestId('chat-input').fill(answer(concept));
    await page.getByTestId('chat-send').click();
    // Either the officer replied (two more bubbles) or the session closed into the debrief.
    await expect
      .poll(
        async () =>
          (await page.getByTestId('interview-verdict').count()) > 0 ||
          (await messages.count()) >= before + 2,
        { timeout: 15_000 },
      )
      .toBe(true);
  }
}

test('the interview is locked before the exam and open after it', async ({ page }) => {
  const loginId = await seedLearnerWithCompany('บริษัท ล็อกสัมภาษณ์ จำกัด', '2026-07-13');
  await loginAs(page, loginId, E2E_PASSWORD);
  await page.goto('/th/interview');
  await expect(page.getByTestId('interview-blocked')).toContainText(
    'ต้องผ่านแบบทดสอบความรู้ธุรกิจก่อน',
  );
  await expect(page.getByTestId('interview-start')).toHaveCount(0);
});

test('a learner who evades is not ready, retries with good answers, and becomes ready for good', async ({
  page,
}) => {
  // This scenario completes two full interviews and then verifies the staff transcript.
  test.slow();
  const company = 'บริษัท สัมภาษณ์อีทูอี จำกัด';
  const loginId = await seedLearnerWithCompleteCompany(company);
  await seedPassedExam(loginId);
  await loginAs(page, loginId, E2E_PASSWORD);
  await page.getByTestId('stage-interview').getByRole('link', { name: 'เปิด' }).click();
  await expect(page).toHaveURL(/\/th\/interview$/);
  const guide = page.getByTestId('interview-guide');
  await expect(guide).toContainText('11');
  await expect(guide).toContainText('9');
  await expect(guide).toContainText('ภาษาไทย');
  await expect(guide).toContainText('ฝึกได้ไม่จำกัด');
  await page.getByTestId('interview-start').click();
  await page.waitForURL(/\/th\/interview\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('chat-message').first()).toHaveAttribute('data-role', 'officer');
  await expect(page.getByTestId('chat-message').first()).toContainText('สวัสดี');
  // Spec §4.3: the message budget is shown, not silently cut.
  await expect(page.getByTestId('chat-budget')).toContainText('จาก');

  await answerUntilClosed(page, () => 'ไม่ทราบ');
  await expect(page.getByTestId('interview-verdict')).toHaveAttribute('data-verdict', 'not_ready');
  await expect(page.getByTestId('interview-outcome')).toHaveAttribute(
    'data-outcome',
    'cannot_open',
  );
  await expect(page.getByTestId('interview-outcome')).toContainText('ฝึกอีกนิด');
  await expect(page.getByTestId('interview-verdict')).toContainText('0 จาก 11');
  await expect(page.getByTestId('verdict-reason-company_name')).toHaveAttribute(
    'data-verdict',
    'evasive',
  );
  // The debrief teaches: the correct company name is shown now, and never was in the chat.
  await expect(page.getByTestId('verdict-reasons')).toContainText(company);
  for (const bubble of await page.getByTestId('chat-message').all()) {
    if ((await bubble.getAttribute('data-role')) === 'officer') {
      await expect(bubble).not.toContainText('0105568233704');
    }
  }

  await page.goto('/th/interview');
  await expect(
    page.getByTestId('interview-history').locator('[data-verdict="not_ready"]'),
  ).toHaveCount(1);
  await page.getByTestId('interview-start').click();
  await page.waitForURL(/\/th\/interview\/[0-9a-f-]{36}$/);
  await answerUntilClosed(page, (c) => (c === 'company_name' ? company : (GOOD[c] ?? FALLBACK)));
  await expect(page.getByTestId('interview-verdict')).toHaveAttribute('data-verdict', 'ready');
  // The result says in plain words what the learner came to find out.
  await expect(page.getByTestId('interview-outcome')).toHaveAttribute('data-outcome', 'can_open');
  await expect(page.getByTestId('interview-outcome')).toContainText('พร้อมสำหรับขั้นตอนถัดไป');
  await expect(page.getByTestId('interview-verdict')).toContainText('11 จาก 11');

  await page.goto('/th/dashboard');
  await expect(page.getByTestId('stage-interview-status')).toHaveText('เสร็จสิ้น');
  await expect(page.getByTestId('stage-appointment')).toHaveCount(0);

  // The staff side: the newest session of this learner is the ready one, with its transcript
  // and the officer's per-answer assessments.
  await switchTo(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/interviews');
  const row = page
    .locator('[data-testid^="admin-interview-"]')
    .filter({ hasText: company })
    .first();
  await expect(row).toContainText('พร้อมแล้ว');
  await row.getByRole('link').click();
  await expect(page).toHaveURL(/\/th\/admin\/interviews\/[0-9a-f-]{36}$/);
  await expect(
    page.getByTestId('admin-transcript').locator('[data-role="officer"]').first(),
  ).toContainText('สวัสดี');
  await expect(page.getByTestId('admin-assessments')).toContainText('ถูกต้อง');
});

test('the learner can end the interview early and is told to try again', async ({ page }) => {
  const loginId = await seedLearnerWithCompany('บริษัท จบก่อน จำกัด', '2026-07-13');
  await seedPassedExam(loginId);
  await loginAs(page, loginId, E2E_PASSWORD);
  await page.goto('/th/interview');
  await page.getByTestId('interview-start').click();
  await page.waitForURL(/\/th\/interview\/[0-9a-f-]{36}$/);
  await page.getByTestId('chat-end').click();
  await expect(page.getByTestId('interview-verdict')).toHaveAttribute('data-verdict', 'not_ready');
  await expect(page.getByTestId('interview-outcome')).toHaveAttribute(
    'data-outcome',
    'cannot_open',
  );
  await expect(page.getByTestId('interview-outcome')).toContainText('ฝึกอีกนิด');
  await expect(page.getByTestId('close-reason')).toHaveText('คุณจบการสัมภาษณ์ก่อนครบทุกข้อ');
  await expect(page.getByRole('link', { name: 'ลองอีกครั้ง' })).toHaveAttribute(
    'href',
    '/th/interview',
  );
});

test('the chat fits a phone', async ({ page }) => {
  const loginId = await seedLearnerWithCompany('บริษัท สัมภาษณ์มือถือ จำกัด', '2026-07-13');
  await seedPassedExam(loginId);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, loginId, E2E_PASSWORD);
  await page.goto('/th/interview');
  await page.getByTestId('interview-start').click();
  await page.waitForURL(/\/th\/interview\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('chat-input')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
