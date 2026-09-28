# P16a — Six steps and the readiness interview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the voice-call stage with a Thai chat against an AI bank assessor that ends with a rules-based _ready / not yet ready_ verdict, make the dashboard show six steps (interview, then appointment), and delete the Vapi call.

**Architecture:** A pure domain module (`lib/domain/interview/`) builds a question plan from a fact sheet, detects pasted answers and decides the verdict; a provider module (`lib/integrations/interview/`) turns the plan into officer turns — `fake` deterministically, `claude` through the Anthropic SDK with structured output — and writes the closing narrative; `lib/db/interviews.ts` owns the session lifecycle under the service role with ownership checks; the learner screens are server pages plus one client chat component; progression gains the `interview` and `appointment` stages. The appointment tables and screens are P16b.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (RLS, security-definer team predicates), Anthropic SDK `@anthropic-ai/sdk` ^0.124 (`messages.stream(...).finalMessage()` with `output_config.format = zodOutputFormat(schema)`, as `lib/integrations/question-gen/claude.ts` does), zod, next-intl th/en/zh, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-28-bank-readiness-interview-and-appointments-design.md`

## Global Constraints

- The officer speaks **Thai only**, whatever the UI language (spec §2, §4.4); UI chrome follows the locale.
- The officer **never states a company fact** during the interview (spec §4.3); the debrief shows the correct values afterwards.
- The verdict is decided by `decideVerdict()` in code, never by the model (spec §4.4).
- Every adapter has a fake: `INTERVIEW_PROVIDER=claude|fake|off`, default `claude` when `ANTHROPIC_API_KEY` is set, otherwise `fake` outside production and `off` in production (same rule as extraction).
- Writes to `interview_sessions` / `interview_turns` happen only under the service role after an ownership check; learners and staff read through RLS (spec §7).
- Keep every existing `data-testid` the suite reads; new strings go to th, en and zh (`tests/unit/messages.test.ts` enforces parity).
- Tokens only, never raw hex, in components (design brief); learner screens sit in `LearnerShell`.
- Model ids as the repo uses them: `claude-sonnet-5` for turns, `claude-opus-5` for the narrative.
- Never leave a `next dev` running while Playwright runs; `pnpm db:reset` before the full gate if learners have piled up.
- The other session may be editing `app/[locale]/(learner)/name-card/*` — never touch those files; commit with explicit paths, never `git add -A`, until that work has landed.

## Review Focus

1. A learner whose record lacks an address or directors must still be able to reach _ready_: core concepts absent from the plan are not required (Task 4 pins it).
2. An answer that legitimately types the registered address in full is **not** "pasted"; a multi-field dump is (Task 4).
3. A resumed session continues at the same plan item; an idle session older than 30 minutes is abandoned, not resumed, and never gets a verdict (Task 6).
4. Ownership: a learner posting a message to another learner's session id gets `not_found`, and the RLS suite proves a manager of team B reads nothing of team A (Tasks 3, 6).
5. The exam-passed gate: with `require_exam_pass_for_interview` off, the interview opens right after assignment; with it on, the step stays locked with `exam_required` (Task 1).

---

### Task 1: Six stages in the domain

**Files:**
- Modify: `lib/domain/progression.ts`
- Modify: `tests/unit/domain/progression.test.ts`
- Modify: `tests/unit/domain/stage-progress.test.ts` (the six-key fixture)

**Interfaces:**
- Produces: `StageKey = 'study'|'quiz'|'exam'|'nameCard'|'interview'|'appointment'`, `STAGE_KEYS` (six, in that order), `StageReason` gains `'interview_required'`, `ProgressionFacts` gains `interviewSessions: number`, `interviewReady: boolean`, `appointmentBooked: boolean` and `policy.requireExamPassForInterview` (replacing `requireExamPassForBankCall`; `callSessions`/`callsCompleted` removed), `ProgressionState` gains `INTERVIEW_STARTED | INTERVIEW_READY | APPOINTMENT_BOOKED` (the two `CALL_*` states removed).

- [ ] **Step 1: Write the failing tests**

Replace `tests/unit/domain/progression.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import {
  STAGE_KEYS,
  deriveProgression,
  stageStatuses,
  type ProgressionFacts,
} from '@/lib/domain/progression';

const base: ProgressionFacts = {
  hasActiveAssignment: true,
  studyOpened: false,
  quizAttempts: 0,
  examSubmitted: 0,
  examPassed: false,
  nameCardCreated: false,
  eligibility: { availableFrom: '2026-10-27', expiresAt: null },
  today: '2026-09-28',
  interviewSessions: 0,
  interviewReady: false,
  appointmentBooked: false,
  policy: { requireExamPassForInterview: true, requireExamPassForNameCard: false },
};
const passed: ProgressionFacts = { ...base, examSubmitted: 1, examPassed: true };

describe('STAGE_KEYS', () => {
  it('is the six steps in order', () => {
    expect(STAGE_KEYS).toEqual(['study', 'quiz', 'exam', 'nameCard', 'interview', 'appointment']);
  });
});

describe('stageStatuses', () => {
  it('locks every step without an assignment', () => {
    const s = stageStatuses({ ...base, hasActiveAssignment: false });
    for (const key of STAGE_KEYS) {
      expect(s[key]).toEqual({ status: 'locked', reason: 'no_assignment' });
    }
  });

  it('opens study, quiz, exam and name card on assignment; the interview waits for the exam', () => {
    const s = stageStatuses(base);
    expect(s.study.status).toBe('available');
    expect(s.quiz.status).toBe('available');
    expect(s.exam.status).toBe('available');
    expect(s.nameCard.status).toBe('available');
    expect(s.interview).toEqual({ status: 'locked', reason: 'exam_required' });
    expect(s.appointment).toEqual({ status: 'locked', reason: 'interview_required' });
  });

  it('opens the interview at once when the policy does not require the exam', () => {
    const s = stageStatuses({
      ...base,
      policy: { ...base.policy, requireExamPassForInterview: false },
    });
    expect(s.interview.status).toBe('available');
  });

  it('opens the interview after the exam and tracks its sessions', () => {
    expect(stageStatuses(passed).interview.status).toBe('available');
    expect(stageStatuses({ ...passed, interviewSessions: 2 }).interview.status).toBe(
      'in_progress',
    );
    expect(
      stageStatuses({ ...passed, interviewSessions: 2, interviewReady: true }).interview,
    ).toEqual({ status: 'done' });
  });

  it('holds the appointment until the learner is ready, then until the eligibility date', () => {
    const ready = { ...passed, interviewSessions: 1, interviewReady: true };
    expect(stageStatuses(passed).appointment).toEqual({
      status: 'locked',
      reason: 'interview_required',
    });
    expect(stageStatuses(ready).appointment).toEqual({
      status: 'locked',
      reason: 'before_available_from',
    });
    expect(stageStatuses({ ...ready, today: '2026-10-27' }).appointment.status).toBe('available');
    expect(stageStatuses({ ...ready, today: '2026-10-27', appointmentBooked: true }).appointment)
      .toEqual({ status: 'done' });
  });

  it('reports a pending appointment when the issue date is missing', () => {
    const s = stageStatuses({ ...passed, interviewReady: true, eligibility: null });
    expect(s.appointment).toEqual({ status: 'pending', reason: 'missing_issue_date' });
  });

  it('locks the appointment once the access window has expired', () => {
    const s = stageStatuses({
      ...passed,
      interviewReady: true,
      eligibility: { availableFrom: '2026-08-01', expiresAt: '2026-09-01' },
    });
    expect(s.appointment).toEqual({ status: 'locked', reason: 'expired' });
  });
});

describe('deriveProgression', () => {
  it('walks the states in order', () => {
    expect(deriveProgression({ ...base, hasActiveAssignment: false })).toBe('UNASSIGNED');
    expect(deriveProgression(base)).toBe('PROVISIONED');
    expect(deriveProgression({ ...base, studyOpened: true })).toBe('LEARNING');
    expect(deriveProgression({ ...base, examSubmitted: 1 })).toBe('EXAM_PENDING');
    expect(deriveProgression(passed)).toBe('EXAM_PASSED');
    expect(deriveProgression({ ...passed, interviewSessions: 1 })).toBe('INTERVIEW_STARTED');
    expect(deriveProgression({ ...passed, interviewSessions: 1, interviewReady: true })).toBe(
      'WAITING_BANK_ELIGIBILITY',
    );
    expect(
      deriveProgression({ ...passed, interviewReady: true, today: '2026-10-27' }),
    ).toBe('BANK_ELIGIBLE');
    expect(
      deriveProgression({
        ...passed,
        interviewReady: true,
        today: '2026-10-27',
        appointmentBooked: true,
      }),
    ).toBe('APPOINTMENT_BOOKED');
  });

  it('reports INTERVIEW_READY when the window has expired', () => {
    expect(
      deriveProgression({
        ...passed,
        interviewReady: true,
        eligibility: { availableFrom: '2026-08-01', expiresAt: '2026-09-01' },
      }),
    ).toBe('INTERVIEW_READY');
  });
});
```

In `tests/unit/domain/stage-progress.test.ts`, extend the `statuses()` fixture with the two new keys:

```ts
const statuses = (o: Partial<Record<StageKey, StageStatus>>): Record<StageKey, StageInfo> => ({
  study: { status: o.study ?? 'available' },
  quiz: { status: o.quiz ?? 'available' },
  exam: { status: o.exam ?? 'available' },
  nameCard: { status: o.nameCard ?? 'available' },
  interview: { status: o.interview ?? 'locked' },
  appointment: { status: o.appointment ?? 'locked' },
});
```

and change the two tests that spelled out a completed run: "is the locked bank step once everything before it is done" becomes `statuses({ study: 'done', quiz: 'done', exam: 'done', nameCard: 'done' })` → `'interview'`; "is nothing once every step is done" adds `interview: 'done', appointment: 'done'`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/unit/domain/progression.test.ts tests/unit/domain/stage-progress.test.ts`
Expected: FAIL — type errors surface as runtime failures (`interviewSessions` unknown, `STAGE_KEYS` has 5 entries, `s.interview` undefined).

- [ ] **Step 3: Rewrite the domain**

Replace the body of `lib/domain/progression.ts` from the `ProgressionState` type down (keep the imports):

```ts
/** PRD §8 states plus UNASSIGNED, with the interview and appointment states of P16. */
export type ProgressionState =
  | 'UNASSIGNED'
  | 'PROVISIONED'
  | 'LEARNING'
  | 'EXAM_PENDING'
  | 'EXAM_PASSED'
  | 'INTERVIEW_STARTED'
  | 'INTERVIEW_READY'
  | 'WAITING_BANK_ELIGIBILITY'
  | 'BANK_ELIGIBLE'
  | 'APPOINTMENT_BOOKED';

export type ProgressionFacts = {
  hasActiveAssignment: boolean;
  studyOpened: boolean;
  quizAttempts: number;
  examSubmitted: number;
  /** Already evaluated against policy_config.exam_pass_rule by the loader. */
  examPassed: boolean;
  nameCardCreated: boolean;
  eligibility: EligibilityWindow | null;
  today: ISODate;
  /** Readiness interviews (P16): how many were held, and whether one ended ready. */
  interviewSessions: number;
  interviewReady: boolean;
  /** An upcoming booked appointment (P16b); false until that slice lands. */
  appointmentBooked: boolean;
  policy: { requireExamPassForInterview: boolean; requireExamPassForNameCard: boolean };
};

export type StageKey = 'study' | 'quiz' | 'exam' | 'nameCard' | 'interview' | 'appointment';
export type StageStatus = 'locked' | 'pending' | 'available' | 'in_progress' | 'done';
export type StageReason =
  | 'no_assignment'
  | 'exam_required'
  | 'interview_required'
  | 'before_available_from'
  | 'expired'
  | 'missing_issue_date';
export type StageInfo = { status: StageStatus; reason?: StageReason };

export const STAGE_KEYS: readonly StageKey[] = [
  'study',
  'quiz',
  'exam',
  'nameCard',
  'interview',
  'appointment',
];

/** The readiness interview opens once the exam is passed (policy) and stays open for practice. */
function interviewGate(f: ProgressionFacts): StageInfo {
  if (!f.hasActiveAssignment) return { status: 'locked', reason: 'no_assignment' };
  if (f.policy.requireExamPassForInterview && !f.examPassed) {
    return { status: 'locked', reason: 'exam_required' };
  }
  if (f.interviewReady) return { status: 'done' };
  if (f.interviewSessions > 0) return { status: 'in_progress' };
  return { status: 'available' };
}

/** The appointment needs a ready learner and an open eligibility window (BR-002). */
function appointmentGate(f: ProgressionFacts): StageInfo {
  if (!f.hasActiveAssignment) return { status: 'locked', reason: 'no_assignment' };
  if (!f.interviewReady) return { status: 'locked', reason: 'interview_required' };
  if (!f.eligibility) return { status: 'pending', reason: 'missing_issue_date' };
  if (f.today < f.eligibility.availableFrom) {
    return { status: 'locked', reason: 'before_available_from' };
  }
  if (!isBankStageOpen(f.eligibility, f.today)) return { status: 'locked', reason: 'expired' };
  if (f.appointmentBooked) return { status: 'done' };
  return { status: 'available' };
}

/** Eligibility and readiness are independent conditions; the state is derived every read. */
export function deriveProgression(f: ProgressionFacts): ProgressionState {
  if (!f.hasActiveAssignment) return 'UNASSIGNED';
  if (f.appointmentBooked) return 'APPOINTMENT_BOOKED';
  if (f.interviewReady) {
    const gate = appointmentGate(f);
    if (gate.status === 'available') return 'BANK_ELIGIBLE';
    if (gate.reason === 'before_available_from' || gate.reason === 'missing_issue_date') {
      return 'WAITING_BANK_ELIGIBILITY';
    }
    return 'INTERVIEW_READY';
  }
  if (f.interviewSessions > 0) return 'INTERVIEW_STARTED';
  if (f.examPassed) return 'EXAM_PASSED';
  if (f.examSubmitted > 0) return 'EXAM_PENDING';
  if (f.studyOpened || f.quizAttempts > 0) return 'LEARNING';
  return 'PROVISIONED';
}

export function stageStatuses(f: ProgressionFacts): Record<StageKey, StageInfo> {
  if (!f.hasActiveAssignment) {
    const locked: StageInfo = { status: 'locked', reason: 'no_assignment' };
    return {
      study: locked,
      quiz: locked,
      exam: locked,
      nameCard: locked,
      interview: locked,
      appointment: locked,
    };
  }
  const study: StageInfo = { status: f.studyOpened ? 'in_progress' : 'available' };
  const quiz: StageInfo = { status: f.quizAttempts > 0 ? 'done' : 'available' };
  const exam: StageInfo = {
    status: f.examPassed ? 'done' : f.examSubmitted > 0 ? 'in_progress' : 'available',
  };
  let nameCard: StageInfo;
  if (f.policy.requireExamPassForNameCard && !f.examPassed) {
    nameCard = { status: 'locked', reason: 'exam_required' };
  } else {
    nameCard = { status: f.nameCardCreated ? 'done' : 'available' };
  }
  return { study, quiz, exam, nameCard, interview: interviewGate(f), appointment: appointmentGate(f) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/unit/domain/progression.test.ts tests/unit/domain/stage-progress.test.ts`
Expected: PASS (all). `pnpm exec tsc --noEmit -p tsconfig.json` will now report errors in `lib/db/progression.ts`, `lib/db/calls.ts`, the dashboard and the exam result — Task 2 clears them; do not commit between the two tasks.

---

### Task 2: Remove the voice call and rename the stage everywhere

**Files:**
- Delete: `lib/integrations/vapi/` (three files), `app/api/webhooks/vapi/route.ts`, `app/[locale]/(learner)/bank-call/` (three files), `app/[locale]/(admin)/admin/calls/` (two pages), `lib/db/calls.ts`, `tests/e2e/bank-call.spec.ts`, `tests/integration/calls.test.ts`, `tests/unit/integrations/vapi.test.ts`
- Modify: `package.json` (remove `@vapi-ai/web`), `app/api/health/route.ts`, `playwright.config.ts`, `scripts/write-local-env.mjs`, `tests/integration/setup.ts`, `tests/integration/team-boundaries.test.ts`, `tests/integration/team-gates.test.ts`, `lib/config/policy-defaults.ts`, `lib/config/policy-schema.ts`, `lib/db/progression.ts`, `app/[locale]/(learner)/dashboard/page.tsx`, `app/[locale]/(learner)/dashboard/stage-row.ts`, `app/[locale]/(learner)/dashboard/stepper.tsx`, `components/shell/step-segments.tsx`, `app/[locale]/(learner)/exam/[attemptId]/result/page.tsx`, `app/[locale]/(admin)/admin/page.tsx`, `messages/th.json`, `messages/en.json`, `messages/zh.json`
- Modify tests: `tests/e2e/learner-dashboard.spec.ts`, `tests/e2e/dashboard-design.spec.ts`, `tests/e2e/language.spec.ts`, `tests/e2e/admin-settings.spec.ts`, `tests/e2e/exam-result-design.spec.ts`, `tests/e2e/idor.spec.ts`, `tests/unit/domain/bank-interview.test.ts` (only if it imports from the deleted files)

**Interfaces:**
- Consumes: Task 1's `ProgressionFacts` and `STAGE_KEYS`.
- Produces: policy keys `require_exam_pass_for_interview` (boolean, default true; `call_max_sessions` removed); `STAGE_ROUTES` as `Partial<Record<StageKey, string>>` with `interview: '/interview'` and no `appointment` yet; message keys `stages.titles.interview|appointment`, `stages.short.interview|appointment`, `stages.reasons.interview_required`, `stages.stepOf` with `{total}`, `dashboard.next.interview|appointment`, `dashboard.appointment.{pending,available,lockedUntil}`, `exam.toInterview`, `progression.INTERVIEW_STARTED|INTERVIEW_READY|APPOINTMENT_BOOKED`, `admin.settings.keys.require_exam_pass_for_interview`.

- [ ] **Step 1: Update the e2e expectations first (they are the failing tests of this task)**

`tests/e2e/learner-dashboard.spec.ts` — first test, replace the two `stage-bank` lines with:

```ts
  // Default policy: exam pass required before the interview (decision D9, renamed in P16).
  await expect(page.getByTestId('stage-interview-status')).toHaveText('ล็อก');
  await expect(page.getByTestId('stage-interview')).toContainText('ต้องสอบผ่านก่อน');
  await expect(page.getByTestId('stage-appointment-status')).toHaveText('ล็อก');
  await expect(page.getByTestId('stage-appointment')).toContainText(
    'ต้องผ่านการสัมภาษณ์ความพร้อมก่อน',
  );
```

second test: `stage-bank-status` → `stage-appointment-status`; third test: the loop over `['study','quiz','exam','nameCard','bank']` becomes `['study', 'quiz', 'exam', 'nameCard', 'interview', 'appointment']`.

`tests/e2e/dashboard-design.spec.ts:28` → `page.getByTestId('stage-interview')` has `data-locked`, and add `await expect(page.getByTestId('stage-appointment')).toHaveAttribute('data-locked', 'true');`. In the "after a passed exam" test the current step is still the name card (`/นามบัตร/`) — unchanged.

`tests/e2e/language.spec.ts:14` → `stage-interview-status` `'Locked'`.

`tests/e2e/admin-settings.spec.ts:34` → `stage-interview-status` `'พร้อมใช้งาน'` (the test toggles the renamed key through the Settings screen; its label comes from `admin.settings.keys.require_exam_pass_for_interview`).

`tests/e2e/exam-result-design.spec.ts:27-28` → text `/ไปสัมภาษณ์ความพร้อม/` and href `'/th/interview'`.

`tests/e2e/idor.spec.ts:34` → `'/th/admin/interviews'` in place of `'/th/admin/calls'`.

- [ ] **Step 2: Delete the call**

```bash
git rm -r -q lib/integrations/vapi app/api/webhooks/vapi "app/[locale]/(learner)/bank-call" "app/[locale]/(admin)/admin/calls" lib/db/calls.ts tests/e2e/bank-call.spec.ts tests/integration/calls.test.ts tests/unit/integrations/vapi.test.ts
pnpm remove @vapi-ai/web
```

Then: in `app/api/health/route.ts` remove the `resolveVapiProvider` import and the `vapi:` line; in `playwright.config.ts` remove `VAPI_PROVIDER: 'fake',`; in `scripts/write-local-env.mjs` remove the `VAPI_WEBHOOK_SECRET` line; in `tests/integration/setup.ts` remove `'VAPI_PROVIDER',`; in `tests/integration/team-boundaries.test.ts` delete the `it(...)` block that reads `call_sessions` (around lines 120–160); in `tests/integration/team-gates.test.ts` delete the `getCallSession` import and the block that inserts into `call_sessions`; `grep -rn "recordings\|call_sessions" tests/integration` must then print nothing. In `app/[locale]/(admin)/admin/page.tsx` remove `['/admin/calls', 'calls'],` (Task 8 adds interviews).

- [ ] **Step 3: Rename the policy key**

`lib/config/policy-defaults.ts`: replace the two lines

```ts
  require_exam_pass_for_interview: true as boolean,
```

(`call_max_sessions` is gone). `lib/config/policy-schema.ts`: the entry becomes `require_exam_pass_for_interview: { control: { kind: 'boolean' }, schema: z.boolean() },` and the `call_max_sessions` entry is removed. In each `messages/*.json`, under `admin.settings.keys`, rename the `require_exam_pass_for_bank_call` object to `require_exam_pass_for_interview` with these texts and delete `call_max_sessions`:

| lang | label | help |
| --- | --- | --- |
| th | ต้องสอบผ่านก่อนเข้าสัมภาษณ์ความพร้อม | เมื่อเปิด ผู้เรียนต้องสอบผ่านก่อนจึงจะเริ่มสัมภาษณ์ความพร้อมกับธนาคารได้ |
| en | Exam pass required before the readiness interview | When on, a learner must pass the exam before starting the readiness interview. |
| zh | 准备度面谈前须通过考试 | 开启后，学员必须先通过考试才能开始准备度面谈。 |

(keep the object shape the existing entries use — check one neighbour before editing).

- [ ] **Step 4: Facts loaders without the call (interim)**

In `lib/db/progression.ts`: in `loadProgressionFacts` replace the two `call_sessions` queries in the `Promise.all` with nothing, rename `requireExamPassForBankCall` → `requireExamPassForInterview` (`getPolicy('require_exam_pass_for_interview')`), and return

```ts
    interviewSessions: 0,
    interviewReady: false,
    appointmentBooked: false,
    policy: { requireExamPassForInterview, requireExamPassForNameCard },
```

(Task 6 reads the real values.) In `loadProgressionFactsForUsers` remove the `calls` query, the `callCount` map and `c`, and emit the same three fields per user.

- [ ] **Step 5: The messages**

In each of `messages/th.json`, `messages/en.json`, `messages/zh.json`:

- delete `bankCall`, `admin.calls` and `admin.nav.calls` entirely;
- `stages.titles`: remove `bank`, add `interview` / `appointment`; `stages.short` likewise; `stages.reasons.interview_required`; `stages.stepOf`;
- `progression`: remove `CALL_TRAINING_STARTED`, `CALL_TRAINING_COMPLETED`; add the three states;
- `dashboard.bank` → `dashboard.appointment` (same three keys, reworded), `dashboard.next.bank` → `dashboard.next.interview` + `dashboard.next.appointment`;
- `exam.toBankCall` → `exam.toInterview`; `exam.passedNext` reworded; delete `exam.passedNextCard`.

| key | th | en | zh |
| --- | --- | --- | --- |
| stages.titles.interview | สัมภาษณ์ความพร้อม | Readiness interview | 准备度面谈 |
| stages.titles.appointment | นัดหมายธนาคาร | Bank appointment | 银行预约 |
| stages.short.interview | สัมภาษณ์ | Interview | 面谈 |
| stages.short.appointment | นัดหมาย | Booking | 预约 |
| stages.reasons.interview_required | ต้องผ่านการสัมภาษณ์ความพร้อมก่อน | Pass the readiness interview first | 请先通过准备度面谈 |
| stages.stepOf | ขั้นตอนที่ {n} จาก {total} | Step {n} of {total} | 第 {n} 步（共 {total} 步） |
| progression.INTERVIEW_STARTED | เริ่มสัมภาษณ์ความพร้อมแล้ว | Interview started | 已开始面谈 |
| progression.INTERVIEW_READY | พร้อมยืนยันกับธนาคาร | Ready for the bank | 已准备好 |
| progression.APPOINTMENT_BOOKED | นัดหมายธนาคารแล้ว | Appointment booked | 已预约银行 |
| dashboard.appointment.pending | ยังไม่สามารถคำนวณวันที่ได้ เนื่องจากไม่มีวันที่ออกหนังสือรับรอง | Eligibility date pending — the certificate issue date is missing. | 无法计算可预约日期：缺少证书签发日期。 |
| dashboard.appointment.available | จองนัดหมายได้แล้ว | You can book now. | 现在可以预约。 |
| dashboard.appointment.lockedUntil | จองได้ตั้งแต่ {date} | Bookable from {date} | 可自 {date} 起预约 |
| dashboard.next.interview | ขั้นตอนถัดไปคือการสัมภาษณ์ความพร้อม เจ้าหน้าที่จะถามเกี่ยวกับบริษัทของคุณเป็นภาษาไทย | Your next step is the readiness interview. The officer asks about your company, in Thai. | 下一步是准备度面谈。面谈官会用泰语询问贵公司的情况。 |
| dashboard.next.appointment | คุณพร้อมแล้ว ขั้นตอนถัดไปคือการนัดหมายธนาคาร | You are ready. Your next step is the bank appointment. | 你已准备好。下一步是预约银行。 |
| exam.passedNext | คุณสอบผ่านแล้ว การสัมภาษณ์ความพร้อมเปิดให้ทำได้แล้ว | You passed. The readiness interview is now open. | 你已通过考试。准备度面谈现已开放。 |
| exam.toInterview | ไปสัมภาษณ์ความพร้อม | Go to the readiness interview | 前往准备度面谈 |

Keep `progression.WAITING_BANK_ELIGIBILITY` / `BANK_ELIGIBLE` texts as they are.

- [ ] **Step 6: The screens that assumed five steps**

`app/[locale]/(learner)/dashboard/stage-row.ts`:

```ts
/** Where each step's screens live; a step without a route shows status only (appointment: P16b). */
export const STAGE_ROUTES: Partial<Record<StageKey, string>> = {
  study: '/study',
  quiz: '/quiz',
  exam: '/exam',
  nameCard: '/name-card',
  interview: '/interview',
};
```

`app/[locale]/(learner)/dashboard/page.tsx`: in `detailFor`, `key === 'bank'` becomes `key === 'appointment'` with `t('appointment.lockedUntil'|'appointment.pending'|'appointment.available')`; the row builder's `href: open ? STAGE_ROUTES[key] : null` becomes `href: open ? (STAGE_ROUTES[key] ?? null) : null`.

`app/[locale]/(learner)/dashboard/stepper.tsx`: make the geometry follow the count —

```tsx
  const n = rows.length;
  const inset = 100 / (2 * n);
  const step = 100 / n;
  ...
      <div
        className="relative grid"
        style={{ gridTemplateColumns: 'repeat(' + n + ', minmax(0, 1fr))' }}
      >
        <span
          aria-hidden="true"
          className="absolute top-[18px] h-0.5 bg-brand-700/20 md:top-[22px]"
          style={{ left: inset + '%', right: inset + '%' }}
        />
        <span
          aria-hidden="true"
          className="line-fill absolute top-[18px] h-0.5 bg-brand-700 md:top-[22px]"
          style={{ left: inset + '%', width: currentIndex * step + '%' }}
        />
```

(`grid-cols-5` and the `[10%]` classes go.)

`components/shell/step-segments.tsx`: `t('stepOf', { n, total: STAGE_KEYS.length })`.

`app/[locale]/(learner)/exam/[attemptId]/result/page.tsx`: replace the `bankOpen` logic with

```ts
  const interviewOpen = ['available', 'in_progress', 'done'].includes(stages.interview.status);
  const line = passed ? t('passedNext') : t('notPassedNext');
  const primary = passed
    ? interviewOpen
      ? { href: '/interview', label: t('toInterview') }
      : { href: '/name-card', label: td('cta.open', { step: ts('titles.nameCard') }) }
    : { href: '/exam', label: t('retake') };
```

The login page's step list and the dashboard's progress ring already iterate `STAGE_KEYS`; verify they render six.

- [ ] **Step 7: Verify**

Run: `pnpm exec vitest run && pnpm exec tsc --noEmit -p tsconfig.json && pnpm lint && grep -rn "vapi\|call_sessions\|bankCall\|CALL_TRAINING" app lib components tests messages scripts --include=*.ts --include=*.tsx --include=*.json --include=*.mjs`
Expected: unit PASS (messages parity included), tsc clean, lint clean, the grep prints nothing.

Run: `pnpm exec playwright test tests/e2e/learner-dashboard.spec.ts tests/e2e/dashboard-design.spec.ts tests/e2e/language.spec.ts tests/e2e/admin-settings.spec.ts tests/e2e/exam-result-design.spec.ts tests/e2e/idor.spec.ts tests/e2e/login-design.spec.ts tests/e2e/learner-shell.spec.ts`
Expected: PASS. (The login page now lists six steps; `login-design.spec` counts `listitem`s — update its `toHaveCount(5)` to `6`.)

- [ ] **Step 8: Commit**

```bash
git add -A -- lib app components tests messages scripts package.json pnpm-lock.yaml playwright.config.ts
git commit -m "feat(progression): six steps — the readiness interview and the appointment replace the voice call"
```

(`git add -A --` with explicit paths still excludes `app/[locale]/(learner)/name-card/*` only if that work has landed; otherwise list the changed files by hand.)

---

### Task 3: Migration — interview tables, RLS, policy rename, the call dropped

**Files:**
- Create: `supabase/migrations/20260929000000_interview.sql`
- Modify: `lib/db/database.types.ts` (regenerated)
- Create: `tests/integration/interviews.rls.test.ts`

**Interfaces:**
- Produces: tables `public.interview_sessions`, `public.interview_turns` exactly as spec §7 (plus `provider` and `last_turn_at`), readable by learner/team/admin, writable by the service role only; `policy_config` row `require_exam_pass_for_interview`; `call_sessions`, `webhook_events` and the `recordings` bucket gone.

- [ ] **Step 1: Write the failing RLS test**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, clientFor, deleteTeam, seedTeam, type Team } from './helpers';

const svc = adminClient();

/** Spec §7: a session and its turns are the learner's, their manager's and the admin's — nobody else's. */
describe('interview sessions under RLS', () => {
  let a: Team;
  let b: Team;
  let sessionId: string;
  beforeAll(async () => {
    a = await seedTeam('สัมภาษณ์เอ');
    b = await seedTeam('สัมภาษณ์บี');
    const { data, error } = await svc
      .from('interview_sessions')
      .insert({
        user_id: a.learner.id,
        dbd_record_id: a.recordId,
        status: 'completed',
        verdict: 'ready',
        plan: { items: [], cursor: 0 },
        provider: 'fake',
      })
      .select('id')
      .single();
    if (error) throw error;
    sessionId = data.id;
    const { error: turnError } = await svc.from('interview_turns').insert([
      { session_id: sessionId, seq: 1, role: 'officer', content: 'สวัสดีค่ะ' },
      { session_id: sessionId, seq: 2, role: 'learner', content: 'สวัสดีครับ' },
    ]);
    if (turnError) throw turnError;
  });
  afterAll(async () => {
    await svc.from('interview_sessions').delete().eq('id', sessionId);
    await deleteTeam(a);
    await deleteTeam(b);
  });

  it('shows the learner their own session and its turns', async () => {
    const me = await clientFor(a.learner);
    const { data } = await me.from('interview_sessions').select('id').eq('id', sessionId);
    expect(data).toHaveLength(1);
    const { data: turns } = await me.from('interview_turns').select('seq').eq('session_id', sessionId);
    expect(turns).toHaveLength(2);
  });

  it('shows the manager their team, and another team nothing', async () => {
    const { data: mine } = await a.asManager.from('interview_sessions').select('id').eq('id', sessionId);
    expect(mine).toHaveLength(1);
    const { data: theirs } = await b.asManager.from('interview_sessions').select('id').eq('id', sessionId);
    expect(theirs).toEqual([]);
    const { data: turns } = await b.asManager.from('interview_turns').select('seq').eq('session_id', sessionId);
    expect(turns).toEqual([]);
  });

  it('refuses a learner who tries to write a session or a turn', async () => {
    const me = await clientFor(a.learner);
    const { error } = await me.from('interview_sessions').insert({
      user_id: a.learner.id,
      dbd_record_id: a.recordId,
      status: 'in_progress',
      plan: {},
      provider: 'fake',
    });
    expect(error?.code).toBe('42501');
    const { error: turnError } = await me
      .from('interview_turns')
      .insert({ session_id: sessionId, seq: 3, role: 'learner', content: 'x' });
    expect(turnError?.code).toBe('42501');
  });

  it('carried the exam-pass policy over under its new key', async () => {
    const { data } = await svc.from('policy_config').select('key').in('key', [
      'require_exam_pass_for_bank_call',
      'require_exam_pass_for_interview',
      'call_max_sessions',
    ]);
    expect((data ?? []).map((r) => r.key)).not.toContain('require_exam_pass_for_bank_call');
    expect((data ?? []).map((r) => r.key)).not.toContain('call_max_sessions');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/interviews.rls.test.ts`
Expected: FAIL — `relation "public.interview_sessions" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260929000000_interview.sql`:

```sql
-- P16a: the readiness interview replaces the voice call (spec 2026-09-28 §6–7).

create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  dbd_record_id uuid not null references public.dbd_records (id),
  language text not null default 'th',
  status text not null check (status in ('in_progress', 'completed', 'abandoned')),
  verdict text check (verdict in ('ready', 'not_ready')),
  plan jsonb not null,
  summary jsonb,
  provider text not null,
  started_at timestamptz not null default now(),
  last_turn_at timestamptz not null default now(),
  ended_at timestamptz
);
create index interview_sessions_user_idx on public.interview_sessions (user_id, started_at desc);
create index interview_sessions_record_idx on public.interview_sessions (dbd_record_id);
alter table public.interview_sessions enable row level security;

create table public.interview_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions (id) on delete cascade,
  seq integer not null,
  role text not null check (role in ('officer', 'learner')),
  content text not null,
  assessment jsonb,
  created_at timestamptz not null default now(),
  unique (session_id, seq)
);
alter table public.interview_turns enable row level security;

-- Reads: the learner, their manager (through the team predicate computed once per statement,
-- as 20260925000000 does), the admin. Writes: the service role only — no insert/update policy.
create policy "interviews: learners read their own" on public.interview_sessions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "interviews: admins and owning managers read" on public.interview_sessions
  for select to authenticated
  using (public.is_admin() or (public.is_manager() and user_id = any (public.my_team_member_ids())));
create policy "interview turns: learners read their own" on public.interview_turns
  for select to authenticated
  using (exists (
    select 1 from public.interview_sessions s
    where s.id = interview_turns.session_id and s.user_id = (select auth.uid())));
create policy "interview turns: admins and owning managers read" on public.interview_turns
  for select to authenticated
  using (public.is_admin() or (public.is_manager() and exists (
    select 1 from public.interview_sessions s
    where s.id = interview_turns.session_id and s.user_id = any (public.my_team_member_ids()))));

-- The exam-pass gate keeps its value under the stage's new name; the session cap is gone.
update public.policy_config set key = 'require_exam_pass_for_interview'
  where key = 'require_exam_pass_for_bank_call';
delete from public.policy_config where key = 'call_max_sessions';

-- The voice call: nothing was ever recorded on staging.
drop table if exists public.webhook_events;
drop table if exists public.call_sessions;
drop policy if exists "recordings bucket: staff read" on storage.objects;
drop policy if exists "recordings bucket: admins write" on storage.objects;
delete from storage.objects where bucket_id = 'recordings';
delete from storage.buckets where id = 'recordings';
```

Check `policy_config`'s primary key with `grep -n "policy_config" supabase/migrations/*.sql | head` first; if `key` is the primary key the update is a plain rename, which is what we want.

- [ ] **Step 4: Apply locally and regenerate the types**

Run: `pnpm exec supabase migration up --local && pnpm db:types && pnpm exec prettier --write lib/db/database.types.ts`
Expected: "Migrations applied"; `git diff --stat lib/db/database.types.ts` shows the two new tables added and `call_sessions`/`webhook_events` removed; `grep -n "release_login_id\|interview_turns\|call_sessions" lib/db/database.types.ts` shows the first two and not the third.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/interviews.rls.test.ts`
Expected: PASS 4/4. Then `pnpm exec tsc --noEmit -p tsconfig.json` — clean.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260929000000_interview.sql lib/db/database.types.ts tests/integration/interviews.rls.test.ts
git commit -m "feat(db): interview sessions and turns under team RLS; the voice call's tables dropped"
```

---

### Task 4: The engine — plan, pasted detection, verdict

**Files:**
- Create: `lib/domain/interview/types.ts`, `lib/domain/interview/plan.ts`, `lib/domain/interview/pasted.ts`, `lib/domain/interview/verdict.ts`
- Create: `tests/unit/domain/interview/plan.test.ts`, `tests/unit/domain/interview/pasted.test.ts`, `tests/unit/domain/interview/verdict.test.ts`

**Interfaces:**
- Produces (all pure):

```ts
// types.ts
export type ConceptId = string;                       // BankInterviewConcept['id'] or 'juristic_id'
export type FactSheet = Record<string, string | null>;  // TemplateRecord keys → display strings (Thai)
export type Verdict = 'correct' | 'partial' | 'wrong' | 'evasive' | 'pasted' | 'off_topic';
export type Assessment = { concept: ConceptId; verdict: Verdict; note: string };
export type PlanItem = {
  concept: ConceptId;
  phase: 'facts' | 'probing';
  core: boolean;
  /** The Thai question the fake officer asks; the model phrases its own. */
  question: string;
  /** The record's value(s) for the concept, joined with " / "; a concept without one is not asked. */
  expected: string;
  attempts: number;
};
export type InterviewPlan = { items: PlanItem[]; cursor: number };
export type CloseReason =
  | 'plan_complete' | 'too_many_evasions' | 'off_topic_limit' | 'learner_ended' | 'turn_limit';
export type OfficerTurn = {
  say: string;
  assessment: Assessment | null;
  next: { concept: ConceptId } | { close: CloseReason };
};
export type Turn = { role: 'officer' | 'learner'; content: string; assessment?: Assessment | null };
export type VerdictReason = { concept: ConceptId; verdict: Verdict; note: string; cardKey: string | null };
export type SessionVerdict = { verdict: 'ready' | 'not_ready'; reasons: VerdictReason[]; narrative: string };
```

```ts
// plan.ts
export const JURISTIC_ID_CONCEPT: ConceptId = 'juristic_id';
export const CORE_CONCEPTS: readonly ConceptId[] = ['company_name', 'juristic_id', 'registered_address', 'directors_count'];
export function buildPlan(facts: FactSheet): InterviewPlan;          // facts phase only
export function probingItems(plan: InterviewPlan, assessments: Assessment[]): PlanItem[]; // ≤ 4 concepts to revisit
export function currentItem(plan: InterviewPlan): PlanItem | null;
export function advance(plan: InterviewPlan, to: { concept: ConceptId } | { close: CloseReason }): InterviewPlan;
// pasted.ts
export function detectPasted(answer: string, facts: FactSheet): boolean;
// verdict.ts
export function latestAssessments(assessments: Assessment[]): Map<ConceptId, Assessment>;
export function decideVerdict(plan: InterviewPlan, assessments: Assessment[], close: CloseReason): Omit<SessionVerdict, 'narrative'>;
```

- [ ] **Step 1: Write the failing tests**

`tests/unit/domain/interview/plan.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { advance, buildPlan, currentItem, probingItems } from '@/lib/domain/interview/plan';
import type { Assessment, FactSheet } from '@/lib/domain/interview/types';

const facts: FactSheet = {
  company_name_th: 'บริษัท ธาราวาณิช จำกัด',
  company_name_en: 'THARA VANICH CO., LTD.',
  juristic_id: '0105568233704',
  head_office_address: null,
  directors: null,
  directors_count: null,
  registered_on: '2026-07-13',
  nature_of_business: 'ค้าปลีกสินค้าเกษตร',
  products_services: 'ข้าวสาร',
  account_purpose: 'รับชำระค่าสินค้าจากลูกค้า',
  my_position: 'กรรมการผู้จัดการ',
};

describe('buildPlan', () => {
  it('asks only what the record can verify, identity first, the registration number second', () => {
    const plan = buildPlan(facts);
    const ids = plan.items.map((i) => i.concept);
    expect(ids.slice(0, 3)).toEqual(['company_name', 'juristic_id', 'incorporation_date']);
    expect(ids).not.toContain('registered_address');
    expect(ids).not.toContain('directors_count');
    expect(ids).toContain('business_activity');
    expect(plan.cursor).toBe(0);
    expect(plan.items.every((i) => i.phase === 'facts' && i.attempts === 0)).toBe(true);
  });

  it('marks the core concepts and carries the expected values', () => {
    const plan = buildPlan(facts);
    const name = plan.items.find((i) => i.concept === 'company_name')!;
    expect(name.core).toBe(true);
    expect(name.expected).toContain('บริษัท ธาราวาณิช จำกัด');
    expect(name.question.length).toBeGreaterThan(0);
    const purpose = plan.items.find((i) => i.concept === 'account_purpose')!;
    expect(purpose.core).toBe(false);
  });

  it('skips a concept the record cannot verify, so every item carries a value', () => {
    const plan = buildPlan({ ...facts, source_of_funds: null, operations_status: null });
    expect(plan.items.every((i) => i.expected.length > 0)).toBe(true);
    expect(plan.items.map((i) => i.concept)).not.toContain('source_of_funds');
  });
});

describe('probingItems', () => {
  it('revisits partial, wrong and evasive concepts, at most four, as probing items', () => {
    const plan = buildPlan(facts);
    const assessments: Assessment[] = [
      { concept: 'company_name', verdict: 'correct', note: '' },
      { concept: 'juristic_id', verdict: 'wrong', note: '' },
      { concept: 'business_activity', verdict: 'partial', note: '' },
      { concept: 'account_purpose', verdict: 'evasive', note: '' },
      { concept: 'my_position', verdict: 'partial', note: '' },
      { concept: 'incorporation_date', verdict: 'wrong', note: '' },
    ];
    const items = probingItems(plan, assessments);
    expect(items.length).toBe(4);
    expect(items.every((i) => i.phase === 'probing')).toBe(true);
    expect(items.map((i) => i.concept)).not.toContain('company_name');
  });
});

describe('advance', () => {
  it('moves the cursor to the named concept and counts an attempt when it stays', () => {
    const plan = buildPlan(facts);
    const same = advance(plan, { concept: 'company_name' });
    expect(same.cursor).toBe(0);
    expect(currentItem(same)!.attempts).toBe(1);
    const next = advance(same, { concept: 'juristic_id' });
    expect(next.cursor).toBe(1);
    expect(currentItem(next)!.attempts).toBe(0);
  });

  it('parks the cursor past the end on close', () => {
    const plan = buildPlan(facts);
    const closed = advance(plan, { close: 'plan_complete' });
    expect(currentItem(closed)).toBeNull();
  });

  it('prefers the probing copy of a concept at or after the cursor', () => {
    const plan = buildPlan(facts);
    const probing = { ...plan.items[1], phase: 'probing' as const, attempts: 0 };
    const withProbing = { items: [...plan.items, probing], cursor: plan.items.length - 1 };
    const moved = advance(withProbing, { concept: probing.concept });
    expect(moved.cursor).toBe(plan.items.length);
    expect(currentItem(moved)!.phase).toBe('probing');
  });
});
```

`tests/unit/domain/interview/pasted.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { detectPasted } from '@/lib/domain/interview/pasted';

const facts = {
  company_name_th: 'บริษัท ธาราวาณิช จำกัด',
  juristic_id: '0105568233704',
  head_office_address: 'เลขที่ 35/9 ซอย พหลโยธิน 54/1 แยก 4-22 แขวงสายไหม เขตสายไหม กรุงเทพมหานคร',
  products_services: 'ค้าปลีกสินค้าเกษตร ข้าวสาร ปุ๋ย และเครื่องมือการเกษตร',
};

/** Review Focus 2: typing a long fact is fine; dumping the record is not. */
describe('detectPasted', () => {
  it('lets a learner type the full address in their own answer', () => {
    expect(
      detectPasted('เลขที่ 35/9 ซอย พหลโยธิน 54/1 แยก 4-22 แขวงสายไหม เขตสายไหม กรุงเทพมหานคร ครับ', facts),
    ).toBe(false);
  });

  it('lets a learner say the name and the number in one sentence', () => {
    expect(detectPasted('บริษัท ธาราวาณิช จำกัด เลขทะเบียน 0105568233704 ครับ', facts)).toBe(false);
  });

  it('flags two long facts reproduced verbatim together', () => {
    expect(detectPasted(facts.head_office_address + ' ' + facts.products_services, facts)).toBe(true);
  });

  it('flags a system-style summary of label: value lines', () => {
    expect(
      detectPasted('ชื่อบริษัท: บริษัท ธาราวาณิช จำกัด\nเลขทะเบียน: 0105568233704\nทุนจดทะเบียน: 1,000,000 บาท', facts),
    ).toBe(true);
  });
});
```

`tests/unit/domain/interview/verdict.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildPlan } from '@/lib/domain/interview/plan';
import { decideVerdict } from '@/lib/domain/interview/verdict';
import type { Assessment, FactSheet } from '@/lib/domain/interview/types';

const facts: FactSheet = {
  company_name_th: 'บริษัท ธาราวาณิช จำกัด',
  juristic_id: '0105568233704',
  head_office_address: 'เลขที่ 35/9 แขวงสายไหม กรุงเทพมหานคร',
  directors: 'นางสาวพัชรณัฏฐ์ จิรเมธวัชร',
  directors_count: '1',
  nature_of_business: 'ค้าปลีกสินค้าเกษตร',
  products_services: 'ข้าวสาร',
  account_purpose: 'รับชำระค่าสินค้า',
};
const plan = buildPlan(facts);
const good: Assessment[] = [
  { concept: 'company_name', verdict: 'correct', note: '' },
  { concept: 'juristic_id', verdict: 'correct', note: '' },
  { concept: 'registered_address', verdict: 'correct', note: '' },
  { concept: 'directors_count', verdict: 'correct', note: '' },
  { concept: 'business_activity', verdict: 'partial', note: '' },
  { concept: 'account_purpose', verdict: 'correct', note: '' },
];

describe('decideVerdict', () => {
  it('is ready when the core facts are right, the business is coherent and the plan was completed', () => {
    const v = decideVerdict(plan, good, 'plan_complete');
    expect(v.verdict).toBe('ready');
    expect(v.reasons.filter((r) => r.verdict !== 'correct').map((r) => r.concept)).toEqual([
      'business_activity',
    ]);
  });

  it('is not ready when a core fact ended wrong, and names the card to revisit', () => {
    const v = decideVerdict(
      plan,
      good.map((a) => (a.concept === 'juristic_id' ? { ...a, verdict: 'wrong' as const } : a)),
      'plan_complete',
    );
    expect(v.verdict).toBe('not_ready');
    const reason = v.reasons.find((r) => r.concept === 'juristic_id')!;
    expect(reason.verdict).toBe('wrong');
    expect(reason.cardKey).toBe('bank-interview-1-identity');
  });

  it('lets a later correct answer override an earlier partial one', () => {
    const v = decideVerdict(
      plan,
      [{ concept: 'juristic_id', verdict: 'partial', note: '' }, ...good],
      'plan_complete',
    );
    expect(v.verdict).toBe('ready');
  });

  it('tolerates one evasion but not two', () => {
    const one = [...good, { concept: 'account_purpose', verdict: 'evasive' as const, note: '' }];
    expect(decideVerdict(plan, one, 'plan_complete').verdict).toBe('ready');
    const two = [...one, { concept: 'business_activity', verdict: 'evasive' as const, note: '' }];
    expect(decideVerdict(plan, two, 'plan_complete').verdict).toBe('not_ready');
  });

  it('is not ready when the learner ended early or the officer gave up', () => {
    expect(decideVerdict(plan, good, 'learner_ended').verdict).toBe('not_ready');
    expect(decideVerdict(plan, good, 'too_many_evasions').verdict).toBe('not_ready');
  });

  it('does not require a core fact the record cannot verify', () => {
    // Review Focus 1: no address and no directors on the record.
    const thin = buildPlan({
      company_name_th: 'บริษัท ทดสอบ จำกัด',
      juristic_id: '0105568233704',
      nature_of_business: 'ทดสอบระบบ',
      products_services: 'สินค้าทดสอบ',
    });
    const v = decideVerdict(
      thin,
      [
        { concept: 'company_name', verdict: 'correct', note: '' },
        { concept: 'juristic_id', verdict: 'correct', note: '' },
        { concept: 'business_activity', verdict: 'partial', note: '' },
      ],
      'plan_complete',
    );
    expect(v.verdict).toBe('ready');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run tests/unit/domain/interview`
Expected: FAIL — `Cannot find package '@/lib/domain/interview/plan'` (and the two others).

- [ ] **Step 3: Implement**

`lib/domain/interview/types.ts` — the types from the Interfaces block, verbatim.

`lib/domain/interview/plan.ts`:

```ts
import { BANK_INTERVIEW_CONCEPTS, type BankInterviewConcept } from '@/lib/domain/bank-interview';
import type { Assessment, CloseReason, ConceptId, FactSheet, InterviewPlan, PlanItem } from './types';

export const JURISTIC_ID_CONCEPT: ConceptId = 'juristic_id';
export const CORE_CONCEPTS: readonly ConceptId[] = [
  'company_name',
  JURISTIC_ID_CONCEPT,
  'registered_address',
  'directors_count',
];
/** Identity, then ownership, then the business and the learner's own role (spec §4.2). */
const GROUP_ORDER = ['identity', 'ownership', 'business_plan', 'personal'] as const;
const MAX_PROBING = 4;

const JURISTIC_ITEM: Omit<PlanItem, 'expected' | 'attempts'> = {
  concept: JURISTIC_ID_CONCEPT,
  phase: 'facts',
  core: true,
  question: 'เลขทะเบียนนิติบุคคลของบริษัทคือหมายเลขอะไรคะ',
};

function expectedFor(placeholders: string[], facts: FactSheet): string | null {
  const values = placeholders.map((p) => facts[p]).filter((v): v is string => !!v && v.trim() !== '');
  return values.length ? values.join(' / ') : null;
}

function item(concept: BankInterviewConcept, facts: FactSheet): PlanItem | null {
  const expected = expectedFor(concept.placeholders, facts);
  // Every concept names placeholders; one the record cannot fill is not asked (spec §4.2).
  if (expected === null) return null;
  return {
    concept: concept.id,
    phase: 'facts',
    core: CORE_CONCEPTS.includes(concept.id),
    question: concept.question.th,
    expected,
    attempts: 0,
  };
}

/** The facts phase: every concept the record can verify, in the bank's order. */
export function buildPlan(facts: FactSheet): InterviewPlan {
  const items: PlanItem[] = [];
  for (const group of GROUP_ORDER) {
    for (const concept of BANK_INTERVIEW_CONCEPTS.filter((c) => c.group === group)) {
      const built = item(concept, facts);
      if (built) items.push(built);
      if (concept.id === 'company_name' && facts.juristic_id) {
        items.push({ ...JURISTIC_ITEM, expected: facts.juristic_id, attempts: 0 });
      }
    }
  }
  return { items, cursor: 0 };
}

/** What the risk officer comes back to: anything short of correct, worst first, at most four. */
export function probingItems(plan: InterviewPlan, assessments: Assessment[]): PlanItem[] {
  const rank = { evasive: 0, wrong: 1, pasted: 2, off_topic: 3, partial: 4, correct: 5 } as const;
  const latest = new Map<ConceptId, Assessment>();
  for (const a of assessments) latest.set(a.concept, a);
  return [...latest.values()]
    .filter((a) => a.verdict !== 'correct')
    .sort((x, y) => rank[x.verdict] - rank[y.verdict])
    .slice(0, MAX_PROBING)
    .map((a) => {
      const source = plan.items.find((i) => i.concept === a.concept);
      return {
        concept: a.concept,
        phase: 'probing',
        core: source?.core ?? false,
        question: source?.question ?? '',
        expected: source?.expected ?? '',
        attempts: 0,
      };
    });
}

export function currentItem(plan: InterviewPlan): PlanItem | null {
  return plan.items[plan.cursor] ?? null;
}

/**
 * Same concept again = one more attempt; another concept = move there; close = park past the
 * end. A concept the probing phase repeats exists twice in the items, so the search starts at
 * the cursor and only then falls back to the whole plan.
 */
export function advance(
  plan: InterviewPlan,
  to: { concept: ConceptId } | { close: CloseReason },
): InterviewPlan {
  if ('close' in to) return { ...plan, cursor: plan.items.length };
  const ahead = plan.items.findIndex((i, n) => n >= plan.cursor && i.concept === to.concept);
  const index = ahead >= 0 ? ahead : plan.items.findIndex((i) => i.concept === to.concept);
  if (index < 0) return plan;
  if (index === plan.cursor) {
    const items = plan.items.map((i, n) => (n === index ? { ...i, attempts: i.attempts + 1 } : i));
    return { items, cursor: index };
  }
  return { ...plan, cursor: index };
}
```

`lib/domain/interview/pasted.ts`:

```ts
import type { FactSheet } from './types';

const LONG_FACT = 20;
const LABEL_LINE = /^[^:\n]{2,40}:\s*\S/;

function normalise(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Spec §4.3: an answer that reproduces the record wholesale is not the learner's knowledge.
 * Two long facts verbatim, or three "label: value" lines, mark it. One long fact typed out —
 * an address, a product line — is an honest answer and passes.
 */
export function detectPasted(answer: string, facts: FactSheet): boolean {
  const text = normalise(answer);
  const longFacts = Object.values(facts)
    .filter((v): v is string => typeof v === 'string' && v.trim().length >= LONG_FACT)
    .map(normalise);
  const reproduced = new Set(longFacts.filter((v) => text.includes(v))).size;
  if (reproduced >= 2) return true;
  const labelLines = answer.split('\n').filter((line) => LABEL_LINE.test(line.trim())).length;
  return labelLines >= 3;
}
```

`lib/domain/interview/verdict.ts`:

```ts
import { BANK_INTERVIEW_CARDS } from '@/lib/content/bank-interview-cards';
import { BANK_INTERVIEW_CONCEPTS } from '@/lib/domain/bank-interview';
import { CORE_CONCEPTS, JURISTIC_ID_CONCEPT } from './plan';
import type { Assessment, CloseReason, ConceptId, InterviewPlan, SessionVerdict } from './types';

const BUSINESS_CONCEPT: ConceptId = 'business_activity';
const MAX_EVASIONS = 1;

/** The last word on each concept wins: a partial answer corrected later is correct. */
export function latestAssessments(assessments: Assessment[]): Map<ConceptId, Assessment> {
  const latest = new Map<ConceptId, Assessment>();
  for (const a of assessments) latest.set(a.concept, a);
  return latest;
}

/** The study card that teaches a concept's group; the registration number belongs to identity. */
function cardFor(concept: ConceptId): string | null {
  const group =
    concept === JURISTIC_ID_CONCEPT
      ? 'identity'
      : BANK_INTERVIEW_CONCEPTS.find((c) => c.id === concept)?.group;
  return BANK_INTERVIEW_CARDS.find((c) => c.conceptGroup === group)?.contentKey ?? null;
}

/** Spec §4.4, as rules. */
export function decideVerdict(
  plan: InterviewPlan,
  assessments: Assessment[],
  close: CloseReason,
): Omit<SessionVerdict, 'narrative'> {
  const latest = latestAssessments(assessments);
  // One line per concept the officer actually judged, in the plan's order; a concept never
  // reached (the interview closed early) is not a verdict on the learner and is left out.
  const reasons = plan.items
    .filter((i) => i.phase === 'facts')
    .flatMap((i) => {
      const a = latest.get(i.concept);
      return a
        ? [{ concept: i.concept, verdict: a.verdict, note: a.note, cardKey: cardFor(i.concept) }]
        : [];
    });
  const planned = new Set(plan.items.map((i) => i.concept));
  const coreRight = CORE_CONCEPTS.filter((c) => planned.has(c)).every(
    (c) => latest.get(c)?.verdict === 'correct',
  );
  const business = latest.get(BUSINESS_CONCEPT)?.verdict;
  const businessOk = !planned.has(BUSINESS_CONCEPT) || business === 'correct' || business === 'partial';
  const evasions = assessments.filter((a) => a.verdict === 'evasive').length;
  const pastedLeft = [...latest.values()].some((a) => a.verdict === 'pasted');
  const ready =
    close === 'plan_complete' && coreRight && businessOk && evasions <= MAX_EVASIONS && !pastedLeft;
  return { verdict: ready ? 'ready' : 'not_ready', reasons };
}
```

Check `BANK_INTERVIEW_CARDS` and its `conceptGroup`/`contentKey` fields exist in `lib/content/bank-interview-cards.ts` (`cardConceptGroup` reads them); adjust the import names to what that file exports.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/unit/domain/interview`
Expected: PASS 13/13.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/interview tests/unit/domain/interview
git commit -m "feat(interview): the plan, pasted-answer detection and the verdict rules"
```

---

### Task 5: The providers — fake officer, Claude officer, resolver

**Files:**
- Create: `lib/integrations/interview/types.ts`, `lib/integrations/interview/fake.ts`, `lib/integrations/interview/claude.ts`, `lib/integrations/interview/index.ts`
- Modify: `app/api/health/route.ts`, `playwright.config.ts`, `tests/integration/setup.ts`, `.env.example`
- Create: `tests/unit/integrations/interview-fake.test.ts`, `tests/unit/integrations/interview-claude.test.ts`

**Interfaces:**
- Consumes: Task 4's types and `currentItem`.
- Produces:

```ts
export type InterviewProviderName = 'claude' | 'fake' | 'off';
export type TurnInput = {
  facts: FactSheet;
  plan: InterviewPlan;
  transcript: Turn[];
  /** Null on the opening turn. */
  learnerMessage: string | null;
  pastedDetected: boolean;
  evasions: number;
};
export interface InterviewProvider {
  readonly name: 'claude' | 'fake';
  turn(input: TurnInput): Promise<OfficerTurn>;
  narrate(input: { facts: FactSheet; verdict: Omit<SessionVerdict, 'narrative'>; transcript: Turn[] }): Promise<string>;
}
export function resolveInterviewProvider(env?): InterviewProviderName;
export function getInterviewProvider(env?): InterviewProvider | null;
export const officerTurnSchema: z.ZodType<OfficerTurn>;  // shared by the Claude adapter and the tests
```

- [ ] **Step 1: Write the failing tests**

`tests/unit/integrations/interview-fake.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildPlan } from '@/lib/domain/interview/plan';
import { FakeInterview } from '@/lib/integrations/interview/fake';

const facts = {
  company_name_th: 'บริษัท ทดสอบ จำกัด',
  juristic_id: '0105568233704',
  nature_of_business: 'ทดสอบระบบ',
  products_services: 'สินค้าทดสอบ',
};

describe('FakeInterview', () => {
  it('opens with a greeting and the first question, in Thai', async () => {
    const officer = new FakeInterview();
    const plan = buildPlan(facts);
    const turn = await officer.turn({ facts, plan, transcript: [], learnerMessage: null, pastedDetected: false, evasions: 0 });
    expect(turn.assessment).toBeNull();
    expect(turn.say).toMatch(/สวัสดี/);
    expect(turn.say).toContain(plan.items[0].question);
    expect(turn.next).toEqual({ concept: 'company_name' });
  });

  it('marks an answer containing the expected value correct and moves on', async () => {
    const officer = new FakeInterview();
    const plan = buildPlan(facts);
    const turn = await officer.turn({
      facts, plan, transcript: [], learnerMessage: 'บริษัท ทดสอบ จำกัด ครับ', pastedDetected: false, evasions: 0,
    });
    expect(turn.assessment).toEqual({ concept: 'company_name', verdict: 'correct', note: expect.any(String) });
    expect(turn.next).toEqual({ concept: 'juristic_id' });
    expect(turn.say).not.toContain('0105568233704');
  });

  it('marks "ไม่ทราบ" evasive, asks again once, then moves on', async () => {
    const officer = new FakeInterview();
    const plan = buildPlan(facts);
    const first = await officer.turn({ facts, plan, transcript: [], learnerMessage: 'ไม่ทราบ', pastedDetected: false, evasions: 0 });
    expect(first.assessment?.verdict).toBe('evasive');
    expect(first.next).toEqual({ concept: 'company_name' });
    const again = { ...plan, items: plan.items.map((i, n) => (n === 0 ? { ...i, attempts: 1 } : i)) };
    const second = await officer.turn({ facts, plan: again, transcript: [], learnerMessage: 'ไม่ทราบ', pastedDetected: false, evasions: 1 });
    expect(second.next).toEqual({ concept: 'juristic_id' });
  });

  it('closes on the third evasion and at the end of the plan', async () => {
    const officer = new FakeInterview();
    const plan = buildPlan(facts);
    const closed = await officer.turn({ facts, plan, transcript: [], learnerMessage: 'ไม่ทราบ', pastedDetected: false, evasions: 2 });
    expect(closed.next).toEqual({ close: 'too_many_evasions' });
    const last = { ...plan, cursor: plan.items.length - 1 };
    const done = await officer.turn({ facts, plan: last, transcript: [], learnerMessage: 'สินค้าทดสอบ ครับ', pastedDetected: false, evasions: 0 });
    expect(done.next).toEqual({ close: 'plan_complete' });
  });

  it('asks for a pasted answer in the learner’s own words', async () => {
    const officer = new FakeInterview();
    const plan = buildPlan(facts);
    const turn = await officer.turn({ facts, plan, transcript: [], learnerMessage: 'ชื่อ: x\nเลข: y\nทุน: z', pastedDetected: true, evasions: 0 });
    expect(turn.assessment?.verdict).toBe('pasted');
    expect(turn.say).toContain('คำพูดของคุณเอง');
  });
});
```

`tests/unit/integrations/interview-claude.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildPlan } from '@/lib/domain/interview/plan';
import { ClaudeInterview } from '@/lib/integrations/interview/claude';

const facts = { company_name_th: 'บริษัท ทดสอบ จำกัด', juristic_id: '0105568233704', products_services: 'สินค้าทดสอบ' };

/** A client that records the request and answers with a fixed parsed output. */
function stub(parsed: unknown) {
  const calls: unknown[] = [];
  const client = {
    messages: {
      stream: (params: unknown) => {
        calls.push(params);
        return { finalMessage: async () => ({ stop_reason: 'end_turn', parsed_output: parsed, content: [{ type: 'text', text: 'สรุปผล' }] }) };
      },
    },
  };
  return { client: client as never, calls };
}

describe('ClaudeInterview', () => {
  it('sends the fact sheet in a cached system block and forces the officer_turn shape', async () => {
    const { client, calls } = stub({ say: 'สวัสดีค่ะ บริษัทชื่ออะไรคะ', assessment: null, next: { concept: 'company_name' } });
    const officer = new ClaudeInterview(client);
    const turn = await officer.turn({ facts, plan: buildPlan(facts), transcript: [], learnerMessage: null, pastedDetected: false, evasions: 0 });
    expect(turn.next).toEqual({ concept: 'company_name' });
    const params = calls[0] as { model: string; system: { text: string; cache_control?: unknown }[]; output_config: unknown };
    expect(params.model).toBe('claude-sonnet-5');
    expect(params.system.some((b) => b.text.includes('0105568233704') && b.cache_control)).toBe(true);
    expect(params.output_config).toBeDefined();
  });

  it('refuses a turn whose next concept is not in the plan', async () => {
    const { client } = stub({ say: 'x', assessment: null, next: { concept: 'made_up' } });
    await expect(
      new ClaudeInterview(client).turn({ facts, plan: buildPlan(facts), transcript: [], learnerMessage: null, pastedDetected: false, evasions: 0 }),
    ).rejects.toThrow(/plan/);
  });

  it('writes the narrative with the verdict model as plain text', async () => {
    const { client, calls } = stub(null);
    const text = await new ClaudeInterview(client).narrate({
      facts,
      verdict: { verdict: 'not_ready', reasons: [{ concept: 'juristic_id', verdict: 'wrong', note: 'ตอบผิด', cardKey: null }] },
      transcript: [],
    });
    expect(text).toBe('สรุปผล');
    expect((calls[0] as { model: string }).model).toBe('claude-opus-5');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run tests/unit/integrations/interview-fake.test.ts tests/unit/integrations/interview-claude.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`lib/integrations/interview/types.ts`:

```ts
import { z } from 'zod';
import type { FactSheet, InterviewPlan, OfficerTurn, SessionVerdict, Turn } from '@/lib/domain/interview/types';

export type InterviewProviderName = 'claude' | 'fake' | 'off';

export type TurnInput = {
  facts: FactSheet;
  plan: InterviewPlan;
  transcript: Turn[];
  /** Null on the opening turn. */
  learnerMessage: string | null;
  pastedDetected: boolean;
  evasions: number;
};

export interface InterviewProvider {
  readonly name: 'claude' | 'fake';
  turn(input: TurnInput): Promise<OfficerTurn>;
  narrate(input: {
    facts: FactSheet;
    verdict: Omit<SessionVerdict, 'narrative'>;
    transcript: Turn[];
  }): Promise<string>;
}

export const officerTurnSchema = z.object({
  say: z.string().min(1).max(600),
  assessment: z
    .object({
      concept: z.string(),
      verdict: z.enum(['correct', 'partial', 'wrong', 'evasive', 'pasted', 'off_topic']),
      note: z.string().max(300),
    })
    .nullable(),
  next: z.union([
    z.object({ concept: z.string() }),
    z.object({
      close: z.enum(['plan_complete', 'too_many_evasions', 'off_topic_limit', 'learner_ended', 'turn_limit']),
    }),
  ]),
}) satisfies z.ZodType<OfficerTurn>;
```

`lib/integrations/interview/fake.ts`:

```ts
import { currentItem } from '@/lib/domain/interview/plan';
import type { Assessment, OfficerTurn } from '@/lib/domain/interview/types';
import type { InterviewProvider, TurnInput } from './types';

const MAX_EVASIONS = 3;
const EVASIVE = /ไม่ทราบ|ไม่รู้|ไม่แน่ใจ/;

function norm(s: string): string {
  return s.normalize('NFC').replace(/[\s,.\-/]/g, '').toLowerCase();
}

/**
 * The deterministic officer for the suites: asks the plan's Thai questions in order, judges an
 * answer by whether it carries the record's value, asks once more, and closes when the plan ends
 * or the third evasion comes. It never says a fact.
 */
export class FakeInterview implements InterviewProvider {
  readonly name = 'fake' as const;

  async turn(input: TurnInput): Promise<OfficerTurn> {
    const item = currentItem(input.plan);
    if (input.learnerMessage === null || !item) {
      const first = input.plan.items[0];
      return { say: 'สวัสดีค่ะ ดิฉันเป็นเจ้าหน้าที่ธนาคาร ขอสอบถามข้อมูลบริษัทนะคะ ' + (first?.question ?? ''), assessment: null, next: first ? { concept: first.concept } : { close: 'plan_complete' } };
    }
    let verdict: Assessment['verdict'];
    if (input.pastedDetected) verdict = 'pasted';
    else {
      const answer = norm(input.learnerMessage);
      const expected = item.expected.split(' / ').map(norm);
      if (expected.some((e) => e.length > 0 && (answer.includes(e) || (e.includes(answer) && answer.length >= Math.ceil(e.length * 0.6))))) verdict = 'correct';
      else if (input.learnerMessage.trim().length < 3 || EVASIVE.test(input.learnerMessage)) verdict = 'evasive';
      else verdict = 'wrong';
    }
    const assessment: Assessment = { concept: item.concept, verdict, note: NOTE[verdict] };
    const evasions = input.evasions + (verdict === 'evasive' ? 1 : 0);
    if (evasions >= MAX_EVASIONS) {
      return { say: 'ขออภัยค่ะ วันนี้ธนาคารยังไม่สามารถดำเนินการต่อได้ ขอบคุณที่มาค่ะ', assessment, next: { close: 'too_many_evasions' } };
    }
    const stay = (verdict === 'pasted' || verdict === 'evasive' || verdict === 'wrong') && item.attempts < 1;
    if (stay) {
      const ask = verdict === 'pasted' ? 'กรุณาตอบด้วยคำพูดของคุณเองนะคะ ' : 'ขอถามอีกครั้งนะคะ ';
      return { say: ask + item.question, assessment, next: { concept: item.concept } };
    }
    const next = input.plan.items[input.plan.cursor + 1];
    if (!next) return { say: 'ขอบคุณค่ะ ครบทุกข้อแล้ว ธนาคารจะสรุปผลให้นะคะ', assessment, next: { close: 'plan_complete' } };
    return { say: 'รับทราบค่ะ ' + next.question, assessment, next: { concept: next.concept } };
  }

  async narrate(input: { verdict: { verdict: 'ready' | 'not_ready'; reasons: { concept: string; verdict: string }[] } }): Promise<string> {
    const weak = input.verdict.reasons.filter((r) => r.verdict !== 'correct').map((r) => r.concept);
    return input.verdict.verdict === 'ready'
      ? 'ผู้สมัครตอบคำถามเกี่ยวกับบริษัทได้ถูกต้องและครบถ้วน ธนาคารประเมินความเสี่ยงต่ำ'
      : 'ผู้สมัครยังตอบคำถามบางข้อไม่ได้หรือไม่ชัดเจน (' + weak.join(', ') + ') ธนาคารยังไม่สามารถดำเนินการต่อได้ในวันนี้';
  }
}

const NOTE: Record<Assessment['verdict'], string> = {
  correct: 'ตรงกับหนังสือรับรอง',
  partial: 'ตอบได้บางส่วน',
  wrong: 'ไม่ตรงกับหนังสือรับรอง',
  evasive: 'ไม่ได้ตอบคำถาม',
  pasted: 'คัดลอกข้อความจากระบบ',
  off_topic: 'ไม่เกี่ยวกับคำถาม',
};
```

`lib/integrations/interview/claude.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { currentItem } from '@/lib/domain/interview/plan';
import type { OfficerTurn } from '@/lib/domain/interview/types';
import { officerTurnSchema, type InterviewProvider, type TurnInput } from './types';

const TURN_MODEL = 'claude-sonnet-5';
const NARRATIVE_MODEL = 'claude-opus-5';
const TIMEOUT_MS = 60_000;

const PERSONA = `คุณคือเจ้าหน้าที่ธนาคารฝ่ายเปิดบัญชีนิติบุคคล กำลังสัมภาษณ์กรรมการบริษัทเพื่อยืนยันว่าผู้สมัครรู้จักบริษัทของตนเองจริง
กติกา:
- พูดภาษาไทยเท่านั้น สุภาพ เป็นทางการ ลงท้าย "ค่ะ" ถามครั้งละหนึ่งข้อ
- ห้ามบอกข้อมูลบริษัทจาก FACT SHEET แก่ผู้สมัครเด็ดขาด ห้ามยืนยันคำตอบผิดว่าถูก ห้ามเฉลย
- ประเมินคำตอบล่าสุดของผู้สมัครเทียบกับ FACT SHEET: correct = ตรง, partial = ตรงบางส่วน, wrong = ไม่ตรง, evasive = เลี่ยง/ไม่ตอบ, pasted = คัดลอกข้อความระบบ (ระบบจะแจ้ง), off_topic = ไม่เกี่ยว
- ถ้าคำตอบคลุมเครือหรือทั่วไป ให้ซักถามเจาะจงอย่างเจ้าหน้าที่บริหารความเสี่ยง ถามซ้ำได้อีกหนึ่งครั้งต่อข้อ แล้วไปข้อถัดไป
- ถ้า pastedDetected เป็นจริง ให้ประเมิน pasted และขอให้ตอบด้วยคำพูดของตนเอง
- เลี่ยงครั้งที่ 3 ให้ปิดการสัมภาษณ์ (close: too_many_evasions) และเมื่อครบทุกข้อในแผนให้ปิด (close: plan_complete)
- ข้อที่ระบุ (probing) ใน STATE.remaining คือข้อที่ผู้สมัครเคยตอบไม่ชัดเจน ให้ซักถามซ้ำแบบเจาะลึกกว่าเดิม
- next.concept ต้องเป็น concept ที่มีใน STATE.remaining เท่านั้น`;

function factBlock(input: TurnInput): string {
  const facts = Object.entries(input.facts)
    .filter(([, v]) => v)
    .map(([k, v]) => k + ': ' + v)
    .join('\n');
  return 'FACT SHEET (ห้ามเปิดเผย):\n' + facts;
}

function stateBlock(input: TurnInput): string {
  const item = currentItem(input.plan);
  const remaining = input.plan.items.slice(input.plan.cursor).map((i) => i.concept + (i.phase === 'probing' ? ' (probing)' : ''));
  return JSON.stringify({
    current: item ? { concept: item.concept, attempts: item.attempts, phase: item.phase } : null,
    remaining,
    evasions: input.evasions,
    pastedDetected: input.pastedDetected,
  });
}

/** The Claude officer: the persona and the fact sheet cached, the transcript as the conversation. */
export class ClaudeInterview implements InterviewProvider {
  readonly name = 'claude' as const;
  constructor(private readonly client: Anthropic = new Anthropic()) {}

  async turn(input: TurnInput): Promise<OfficerTurn> {
    const messages: Anthropic.MessageParam[] = input.transcript.map((t) => ({
      role: t.role === 'officer' ? 'assistant' : 'user',
      content: t.content,
    }));
    const state = 'STATE: ' + stateBlock(input);
    messages.push({
      role: 'user',
      content: input.learnerMessage === null ? state + '\n\n(เริ่มการสัมภาษณ์: ทักทายและถามข้อแรก)' : state + '\n\nคำตอบของผู้สมัคร: ' + input.learnerMessage,
    });
    const response = await this.client.messages
      .stream(
        {
          model: TURN_MODEL,
          max_tokens: 1000,
          system: [
            { type: 'text', text: PERSONA },
            { type: 'text', text: factBlock(input), cache_control: { type: 'ephemeral' } },
          ],
          messages,
          output_config: { format: zodOutputFormat(officerTurnSchema) },
        },
        { timeout: TIMEOUT_MS },
      )
      .finalMessage();
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      throw new Error('The officer returned no turn');
    }
    const turn = response.parsed_output as OfficerTurn;
    if ('concept' in turn.next && !input.plan.items.some((i) => i.concept === turn.next.concept)) {
      // The model may only move within the plan; anything else is a hallucinated concept.
      throw new Error('The officer left the plan: ' + turn.next.concept);
    }
    return turn;
  }

  async narrate(input: Parameters<InterviewProvider['narrate']>[0]): Promise<string> {
    const response = await this.client.messages
      .stream(
        {
          model: NARRATIVE_MODEL,
          max_tokens: 800,
          system:
            'คุณคือเจ้าหน้าที่ธนาคารที่สรุปผลการสัมภาษณ์ผู้สมัครเปิดบัญชีนิติบุคคล เขียนย่อหน้าเดียวเป็นภาษาไทย สุภาพ ตรงไปตรงมา อ้างอิงเฉพาะผลประเมินที่ให้มา ห้ามเปลี่ยนผลสรุป (verdict) และห้ามเปิดเผยข้อมูลจาก FACT SHEET',
          messages: [
            {
              role: 'user',
              content:
                'VERDICT: ' + input.verdict.verdict + '\nASSESSMENTS: ' + JSON.stringify(input.verdict.reasons) + '\nเขียนสรุปผลให้ผู้สมัครอ่าน',
            },
          ],
        },
        { timeout: TIMEOUT_MS },
      )
      .finalMessage();
    const text = response.content.find((b) => b.type === 'text');
    return text && text.type === 'text' ? text.text.trim() : '';
  }
}
```

(`zodOutputFormat` import path: copy it from `lib/integrations/question-gen/claude.ts`.)

`lib/integrations/interview/index.ts`:

```ts
import 'server-only';
import { ClaudeInterview } from './claude';
import { FakeInterview } from './fake';
import type { InterviewProvider, InterviewProviderName } from './types';

export type { InterviewProvider, InterviewProviderName, TurnInput } from './types';

/**
 * INTERVIEW_PROVIDER=claude|fake|off. Default: claude when ANTHROPIC_API_KEY is set, otherwise
 * fake outside production and off in production (the extraction rule).
 */
export function resolveInterviewProvider(
  env: Record<string, string | undefined> = process.env,
): InterviewProviderName {
  const configured = env.INTERVIEW_PROVIDER;
  if (configured === 'claude' || configured === 'fake' || configured === 'off') return configured;
  if (env.ANTHROPIC_API_KEY) return 'claude';
  return env.NODE_ENV === 'production' ? 'off' : 'fake';
}

export function getInterviewProvider(
  env: Record<string, string | undefined> = process.env,
): InterviewProvider | null {
  switch (resolveInterviewProvider(env)) {
    case 'claude':
      return new ClaudeInterview();
    case 'fake':
      return new FakeInterview();
    default:
      return null;
  }
}
```

Wire the environment: `app/api/health/route.ts` gains `interview: resolveInterviewProvider(),` in `providers`; `playwright.config.ts` gains `INTERVIEW_PROVIDER: 'fake',`; `tests/integration/setup.ts` adds `'INTERVIEW_PROVIDER'` to the forced-fake list; `.env.example` gains `INTERVIEW_PROVIDER=` with the one-line comment used for the other providers.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/unit/integrations/interview-fake.test.ts tests/unit/integrations/interview-claude.test.ts && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: PASS 8/8; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/interview tests/unit/integrations/interview-fake.test.ts tests/unit/integrations/interview-claude.test.ts app/api/health/route.ts playwright.config.ts tests/integration/setup.ts .env.example
git commit -m "feat(interview): the fake and Claude officers behind INTERVIEW_PROVIDER"
```

---

### Task 6: Session lifecycle and progression facts

**Files:**
- Create: `lib/db/interviews.ts`
- Modify: `lib/db/progression.ts`
- Create: `tests/integration/interviews.test.ts`

**Interfaces:**
- Consumes: Tasks 3–5.
- Produces:

```ts
export type InterviewSessionRow = Database['public']['Tables']['interview_sessions']['Row'];
export type InterviewTurnRow = Database['public']['Tables']['interview_turns']['Row'];
export class InterviewError extends Error { code: 'not_open' | 'not_configured' | 'not_found' | 'no_assignment' | 'closed' | 'too_long' }
export const IDLE_MINUTES = 30; export const MAX_LEARNER_TURNS = 30; export const MAX_INPUT_CHARS = 1000;
export function interviewFacts(record: DbdRecordRow, role: LearnerRole | null): FactSheet;
export async function startOrResumeInterview(userId: string): Promise<{ session: InterviewSessionRow; turns: InterviewTurnRow[] }>;
export async function submitLearnerMessage(userId: string, sessionId: string, content: string): Promise<{ turns: InterviewTurnRow[]; closed: boolean }>;
export async function endInterview(userId: string, sessionId: string): Promise<void>;
export async function listMyInterviews(db: Db, userId: string): Promise<InterviewSessionRow[]>;
export async function getInterviewWithTurns(db: Db, id: string): Promise<{ session: InterviewSessionRow; turns: InterviewTurnRow[] } | null>;
export type StaffInterviewRow = InterviewSessionRow & { profiles: { login_id: string; display_name: string | null }; dbd_records: { company_name_th: string | null } | null };
export async function listInterviewsForStaff(db: Db): Promise<StaffInterviewRow[]>;
```

Plus `loadProgressionFacts` / `loadProgressionFactsForUsers` reading `interview_sessions` (`interviewSessions` = number of rows, `interviewReady` = any row with `verdict = 'ready'`).

- [ ] **Step 1: Write the failing tests**

`tests/integration/interviews.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadProgressionFacts } from '@/lib/db/progression';
import {
  InterviewError,
  endInterview,
  startOrResumeInterview,
  submitLearnerMessage,
} from '@/lib/db/interviews';
import { adminClient, clientFor, confirmRecord, deleteTeam, seedTeam, type Team } from './helpers';

const svc = adminClient();

/** Answers the fake officer accepts for a record confirmed with CONFIRMED_ANSWERS. */
async function answerAll(userId: string, sessionId: string, answer: (concept: string) => string) {
  for (let i = 0; i < 40; i++) {
    const { data: session } = await svc.from('interview_sessions').select('plan, status').eq('id', sessionId).single();
    if (session!.status !== 'in_progress') return;
    const plan = session!.plan as { items: { concept: string }[]; cursor: number };
    const concept = plan.items[plan.cursor]?.concept ?? 'end';
    const { closed } = await submitLearnerMessage(userId, sessionId, answer(concept));
    if (closed) return;
  }
}

describe('the readiness interview', () => {
  let team: Team;
  let expected: Record<string, string>;
  beforeAll(async () => {
    team = await seedTeam('สัมภาษณ์');
    await confirmRecord(team.recordId, team.manager.id);
    const { data: record } = await svc.from('dbd_records').select('company_name_th, juristic_id').eq('id', team.recordId).single();
    await svc.from('user_dbd_assignments').insert({ user_id: team.learner.id, dbd_record_id: team.recordId });
    await svc.from('assessment_attempts').insert({
      user_id: team.learner.id, kind: 'exam', language: 'th', attempt_no: 1, status: 'submitted', question_ids: [],
      shuffle_seed: 'seed', passing_mark_snapshot: 70, score: 1, max_score: 1, result: 'pass', submitted_at: new Date().toISOString(),
    });
    expected = {
      company_name: record!.company_name_th!,
      juristic_id: record!.juristic_id!,
      business_activity: 'ทดสอบระบบ สินค้าทดสอบ',
    };
  });
  afterAll(async () => {
    await svc.from('interview_sessions').delete().eq('user_id', team.learner.id);
    await deleteTeam(team);
  });

  it('opens with the officer’s greeting and resumes the same session', async () => {
    const first = await startOrResumeInterview(team.learner.id);
    expect(first.session.status).toBe('in_progress');
    expect(first.turns).toHaveLength(1);
    expect(first.turns[0].role).toBe('officer');
    const again = await startOrResumeInterview(team.learner.id);
    expect(again.session.id).toBe(first.session.id);
  });

  it('ends not ready when the learner evades, and the reasons name the concepts', async () => {
    const { session } = await startOrResumeInterview(team.learner.id);
    await answerAll(team.learner.id, session.id, () => 'ไม่ทราบ');
    const { data } = await svc.from('interview_sessions').select('status, verdict, summary').eq('id', session.id).single();
    expect(data!.status).toBe('completed');
    expect(data!.verdict).toBe('not_ready');
    const summary = data!.summary as { reasons: { concept: string; verdict: string }[]; narrative: string };
    expect(summary.reasons.some((r) => r.concept === 'company_name' && r.verdict === 'evasive')).toBe(true);
    expect(summary.narrative.length).toBeGreaterThan(0);
    const facts = await loadProgressionFacts(await clientFor(team.learner), team.learner.id);
    expect(facts.interviewSessions).toBe(1);
    expect(facts.interviewReady).toBe(false);
  });

  it('ends ready when the answers match the record, and readiness is one-way', async () => {
    const { session } = await startOrResumeInterview(team.learner.id);
    await answerAll(team.learner.id, session.id, (c) => expected[c] ?? 'บริษัทดำเนินการตามปกติ มีลูกค้าในประเทศ');
    const { data } = await svc.from('interview_sessions').select('verdict').eq('id', session.id).single();
    expect(data!.verdict).toBe('ready');
    const facts = await loadProgressionFacts(await clientFor(team.learner), team.learner.id);
    expect(facts.interviewReady).toBe(true);
    // Another, worse session does not take it away.
    const { session: practice } = await startOrResumeInterview(team.learner.id);
    await answerAll(team.learner.id, practice.id, () => 'ไม่ทราบ');
    const after = await loadProgressionFacts(await clientFor(team.learner), team.learner.id);
    expect(after.interviewReady).toBe(true);
    expect(after.interviewSessions).toBe(3);
  });

  it('lets the probing phase correct a wrong answer, and the last word wins', async () => {
    const { session } = await startOrResumeInterview(team.learner.id);
    let juristicAsked = 0;
    await answerAll(team.learner.id, session.id, (c) => {
      if (c === 'juristic_id') return ++juristicAsked <= 2 ? '1111111111111' : expected.juristic_id;
      return expected[c] ?? 'บริษัทดำเนินการตามปกติ มีลูกค้าในประเทศ';
    });
    const { data } = await svc.from('interview_sessions').select('verdict, summary, plan').eq('id', session.id).single();
    // Wrong twice in the facts phase, asked a third time in the probing phase, right at last.
    expect(juristicAsked).toBe(3);
    expect((data!.plan as { items: { phase: string }[] }).items.some((i) => i.phase === 'probing')).toBe(true);
    expect(data!.verdict).toBe('ready');
    const summary = data!.summary as { reasons: { concept: string; verdict: string }[] };
    expect(summary.reasons.find((r) => r.concept === 'juristic_id')?.verdict).toBe('correct');
  });

  it('abandons an idle session and starts a fresh one', async () => {
    const { session } = await startOrResumeInterview(team.learner.id);
    await svc.from('interview_sessions').update({ last_turn_at: new Date(Date.now() - 31 * 60_000).toISOString() }).eq('id', session.id);
    const fresh = await startOrResumeInterview(team.learner.id);
    expect(fresh.session.id).not.toBe(session.id);
    const { data } = await svc.from('interview_sessions').select('status, verdict').eq('id', session.id).single();
    expect(data).toEqual({ status: 'abandoned', verdict: null });
    await endInterview(team.learner.id, fresh.session.id);
  });

  it('refuses another learner’s session, a closed session and an oversized message', async () => {
    const { session } = await startOrResumeInterview(team.learner.id);
    await expect(submitLearnerMessage(team.manager.id, session.id, 'x')).rejects.toMatchObject({ code: 'not_found' });
    await expect(submitLearnerMessage(team.learner.id, session.id, 'ก'.repeat(1001))).rejects.toMatchObject({ code: 'too_long' });
    await endInterview(team.learner.id, session.id);
    await expect(submitLearnerMessage(team.learner.id, session.id, 'สวัสดี')).rejects.toMatchObject({ code: 'closed' });
    const { data } = await svc.from('interview_sessions').select('verdict, summary').eq('id', session.id).single();
    expect(data!.verdict).toBe('not_ready');
  });

  it('is closed to a learner who has not passed the exam', async () => {
    const other = await seedTeam('ยังไม่สอบ');
    try {
      await confirmRecord(other.recordId, other.manager.id);
      await svc.from('user_dbd_assignments').insert({ user_id: other.learner.id, dbd_record_id: other.recordId });
      await expect(startOrResumeInterview(other.learner.id)).rejects.toBeInstanceOf(InterviewError);
    } finally {
      await deleteTeam(other);
    }
  });
});
```

(`seedTeam` + `confirmRecord` give the record a company name, a 13-digit juristic id and the two business answers, and no address, directors, capital, shareholders or role, so the fake officer's plan is three items: company name, registration number, business activity. The `assessment_attempts` columns are the ones `tests/e2e/seed.ts`'s `seedPassedExam` writes; `passing_mark_snapshot` there is 80.)

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/interviews.test.ts`
Expected: FAIL — `Cannot find package '@/lib/db/interviews'`.

- [ ] **Step 3: Implement `lib/db/interviews.ts`**

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { advance, buildPlan, currentItem, probingItems } from '@/lib/domain/interview/plan';
import { detectPasted } from '@/lib/domain/interview/pasted';
import type { Assessment, CloseReason, FactSheet, InterviewPlan, Turn } from '@/lib/domain/interview/types';
import { decideVerdict } from '@/lib/domain/interview/verdict';
import type { LearnerRole } from '@/lib/domain/bank-interview';
import { stageStatuses, type StageInfo } from '@/lib/domain/progression';
import { formatDate } from '@/lib/domain/thai-date';
import { getInterviewProvider, type InterviewProvider } from '@/lib/integrations/interview';
import { createSupabaseAdminClient } from './admin';
import { toTemplateRecord } from './assessment';
import { getActiveAssignmentForUser } from './assignments';
import type { Database, Json } from './database.types';
import type { DbdRecordRow } from './dbd-records';
import { loadProgressionFacts } from './progression';

type Db = SupabaseClient<Database>;
export type InterviewSessionRow = Database['public']['Tables']['interview_sessions']['Row'];
export type InterviewTurnRow = Database['public']['Tables']['interview_turns']['Row'];

export const IDLE_MINUTES = 30;
export const MAX_LEARNER_TURNS = 30;
export const MAX_INPUT_CHARS = 1000;
const MAX_EVASIONS = 3;

export class InterviewError extends Error {
  constructor(
    message: string,
    public readonly code: 'not_open' | 'not_configured' | 'not_found' | 'no_assignment' | 'closed' | 'too_long',
    public readonly gate?: StageInfo,
  ) {
    super(message);
    this.name = 'InterviewError';
  }
}

/** Every fact the officer may verify (D39), as Thai display strings; the same set the call used. */
export function interviewFacts(record: DbdRecordRow, role: LearnerRole | null): FactSheet {
  const t = toTemplateRecord(record, role);
  const text = (v: unknown): string | null =>
    v === null || v === undefined || v === '' ? null : typeof v === 'number' ? v.toLocaleString('th-TH') : String(v);
  return {
    company_name_th: text(t.company_name_th),
    company_name_en: text(t.company_name_en),
    juristic_id: text(t.juristic_id),
    registered_capital: text(t.registered_capital),
    head_office_address: text(t.head_office_address),
    province: text(t.province),
    directors: t.directors?.length ? t.directors.map((d) => d.name_th).join(', ') : null,
    directors_count: t.directors?.length ? String(t.directors.length) : null,
    // The officer reads the date the way the certificate prints it (D47), so a Thai answer matches.
    registered_on: t.registered_on ? formatDate(t.registered_on, 'th') : null,
    business_categories: t.business_categories?.length ? t.business_categories.join(', ') : null,
    objectives: t.objectives?.length ? t.objectives.map((o) => o.text).slice(0, 10).join('; ') : null,
    shareholders: t.shareholders?.length ? t.shareholders.map((s) => s.name).join(', ') : null,
    shareholders_count: text(t.shareholders_count),
    total_shares: text(t.total_shares),
    par_value: text(t.par_value),
    nature_of_business: text(t.nature_of_business),
    products_services: text(t.products_services),
    account_purpose: text(t.account_purpose),
    monthly_volume: text(t.monthly_volume),
    clients_location: text(t.clients_location),
    suppliers_location: text(t.suppliers_location),
    source_of_funds: text(t.source_of_funds),
    business_address: text(t.business_address),
    operations_status: text(t.operations_status),
    my_name: text(t.my_name),
    my_position: text(t.my_position),
    my_responsibilities: text(t.my_responsibilities),
    my_relationship: text(t.my_relationship),
    my_shares: text(t.my_shares),
    my_share_percent: text(t.my_share_percent),
  };
}
```

(`Director.name_th`, `Objective.text` and `Shareholder.name` are the field names in `lib/domain/dbd-record.ts` and `lib/domain/dbd-profile.ts`; `formatDate(iso, 'th')` comes from `lib/domain/thai-date.ts`.)

```ts
function provider(): InterviewProvider {
  const p = getInterviewProvider();
  if (!p) throw new InterviewError('The interview is not configured', 'not_configured');
  return p;
}

async function gateFor(userId: string): Promise<StageInfo> {
  const admin = createSupabaseAdminClient();
  return stageStatuses(await loadProgressionFacts(admin, userId)).interview;
}

function toTurns(rows: InterviewTurnRow[]): Turn[] {
  return rows.map((r) => ({
    role: r.role as Turn['role'],
    content: r.content,
    assessment: (r.assessment as Assessment | null) ?? null,
  }));
}

async function turnsOf(sessionId: string): Promise<InterviewTurnRow[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from('interview_turns')
    .select('*')
    .eq('session_id', sessionId)
    .order('seq');
  if (error) throw error;
  return data;
}

async function record(sessionId: string, seq: number, role: Turn['role'], content: string, assessment: Json | null) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('interview_turns')
    .insert({ session_id: sessionId, seq, role, content, assessment })
    .select()
    .single();
  if (error) throw error;
  await admin.from('interview_sessions').update({ last_turn_at: new Date().toISOString() }).eq('id', sessionId);
  return data;
}

/**
 * The learner's open session, or a new one. An open session idle for IDLE_MINUTES is abandoned
 * first: the bank would not have waited either, and an abandoned session never gets a verdict.
 */
export async function startOrResumeInterview(userId: string) {
  const officer = provider();
  const gate = await gateFor(userId);
  if (gate.status !== 'available' && gate.status !== 'in_progress' && gate.status !== 'done') {
    throw new InterviewError('The interview is not open', 'not_open', gate);
  }
  const admin = createSupabaseAdminClient();
  const { data: open } = await admin
    .from('interview_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open) {
    const idleMs = Date.now() - new Date(open.last_turn_at).getTime();
    if (idleMs < IDLE_MINUTES * 60_000) return { session: open, turns: await turnsOf(open.id) };
    await admin.from('interview_sessions').update({ status: 'abandoned', ended_at: new Date().toISOString() }).eq('id', open.id);
  }
  const assignment = await getActiveAssignmentForUser(admin, userId);
  if (!assignment) throw new InterviewError('No active assignment', 'no_assignment');
  const facts = interviewFacts(assignment.dbd_records, assignment);
  const plan = buildPlan(facts);
  const { data: session, error } = await admin
    .from('interview_sessions')
    .insert({
      user_id: userId,
      dbd_record_id: assignment.dbd_record_id,
      status: 'in_progress',
      plan: plan as unknown as Json,
      provider: officer.name,
    })
    .select()
    .single();
  if (error) throw error;
  const opening = await officer.turn({ facts, plan, transcript: [], learnerMessage: null, pastedDetected: false, evasions: 0 });
  const turn = await record(session.id, 1, 'officer', opening.say, { next: opening.next } as Json);
  return { session, turns: [turn] };
}

async function ownSession(userId: string, sessionId: string): Promise<InterviewSessionRow> {
  const { data } = await createSupabaseAdminClient()
    .from('interview_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) throw new InterviewError('No such session', 'not_found');
  return data;
}

async function close(session: InterviewSessionRow, plan: InterviewPlan, transcript: Turn[], facts: FactSheet, reason: CloseReason) {
  const assessments = transcript.flatMap((t) => (t.assessment ? [t.assessment] : []));
  const core = decideVerdict(plan, assessments, reason);
  const narrative = await provider().narrate({ facts, verdict: core, transcript });
  const { error } = await createSupabaseAdminClient()
    .from('interview_sessions')
    .update({
      status: 'completed',
      verdict: core.verdict,
      summary: { ...core, narrative, closeReason: reason } as unknown as Json,
      plan: advance(plan, { close: reason }) as unknown as Json,
      ended_at: new Date().toISOString(),
    })
    .eq('id', session.id);
  if (error) throw error;
}

/** One learner message in, one officer turn out; the session closes when the officer says so. */
export async function submitLearnerMessage(userId: string, sessionId: string, content: string) {
  const text = content.trim();
  if (text.length === 0 || text.length > MAX_INPUT_CHARS) throw new InterviewError('Message too long', 'too_long');
  const session = await ownSession(userId, sessionId);
  if (session.status !== 'in_progress') throw new InterviewError('The session is closed', 'closed');
  const admin = createSupabaseAdminClient();
  const assignment = await getActiveAssignmentForUser(admin, userId);
  if (!assignment) throw new InterviewError('No active assignment', 'no_assignment');
  const facts = interviewFacts(assignment.dbd_records, assignment);
  const rows = await turnsOf(sessionId);
  const transcript = toTurns(rows);
  const assessed = (turns: Turn[]) => turns.flatMap((t) => (t.assessment ? [t.assessment] : []));
  let plan = session.plan as unknown as InterviewPlan;
  const item = currentItem(plan);
  // Spec §4.2, the second phase: when the last facts item is on the table, the risk officer's
  // probing items are appended, so the officer moves on to them instead of closing. The item
  // being answered now is not probed: its verdict is not known yet.
  if (item && item.phase === 'facts' && plan.cursor === plan.items.length - 1) {
    const probing = probingItems(plan, assessed(transcript)).filter((p) => p.concept !== item.concept);
    if (probing.length) plan = { ...plan, items: [...plan.items, ...probing] };
  }
  const seq = rows.length + 1;
  await record(sessionId, seq, 'learner', text, null);
  const learnerTurns = rows.filter((r) => r.role === 'learner').length + 1;
  const evasions = assessed(transcript).filter((a) => a.verdict === 'evasive').length;
  // The transcript ends with the officer's question; the answer travels as learnerMessage, so
  // the Claude adapter's messages alternate.
  const reply = await provider().turn({
    facts, plan, transcript, learnerMessage: text, pastedDetected: detectPasted(text, facts), evasions,
  });
  const assessment = reply.assessment;
  await record(sessionId, seq + 1, 'officer', reply.say, { ...(assessment ?? {}), next: reply.next } as Json);
  const withReply: Turn[] = [...transcript, { role: 'learner', content: text }, { role: 'officer', content: reply.say, assessment }];
  // Hard limits belong to the code, whatever the officer decided.
  const evasionsNow = evasions + (assessment?.verdict === 'evasive' ? 1 : 0);
  let next = reply.next;
  if (learnerTurns >= MAX_LEARNER_TURNS && 'concept' in next) next = { close: 'turn_limit' };
  if (evasionsNow >= MAX_EVASIONS && 'concept' in next) next = { close: 'too_many_evasions' };
  if ('concept' in next) plan = advance(plan, next);
  if ('close' in next || !currentItem(plan)) {
    await close(session, plan, withReply, facts, 'close' in next ? next.close : 'plan_complete');
    return { turns: await turnsOf(sessionId), closed: true };
  }
  await admin.from('interview_sessions').update({ plan: plan as unknown as Json }).eq('id', sessionId);
  return { turns: await turnsOf(sessionId), closed: false };
}

/** The learner ends early: a verdict on what was answered, which cannot be ready (spec §4.5). */
export async function endInterview(userId: string, sessionId: string): Promise<void> {
  const session = await ownSession(userId, sessionId);
  if (session.status !== 'in_progress') return;
  const admin = createSupabaseAdminClient();
  const assignment = await getActiveAssignmentForUser(admin, userId);
  const facts = assignment ? interviewFacts(assignment.dbd_records, assignment) : {};
  await close(session, session.plan as unknown as InterviewPlan, toTurns(await turnsOf(sessionId)), facts, 'learner_ended');
}

export async function listMyInterviews(db: Db, userId: string): Promise<InterviewSessionRow[]> {
  const { data, error } = await db.from('interview_sessions').select('*').eq('user_id', userId).order('started_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getInterviewWithTurns(db: Db, id: string) {
  const { data: session } = await db.from('interview_sessions').select('*').eq('id', id).maybeSingle();
  if (!session) return null;
  const { data: turns, error } = await db.from('interview_turns').select('*').eq('session_id', id).order('seq');
  if (error) throw error;
  return { session, turns };
}

export type StaffInterviewRow = InterviewSessionRow & {
  profiles: { login_id: string; display_name: string | null };
  dbd_records: { company_name_th: string | null } | null;
};

/** RLS narrows a manager to their team; the admin reads everything. */
export async function listInterviewsForStaff(db: Db): Promise<StaffInterviewRow[]> {
  const { data, error } = await db
    .from('interview_sessions')
    .select('*, profiles!interview_sessions_user_id_fkey(login_id, display_name), dbd_records(company_name_th)')
    .order('started_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data as unknown as StaffInterviewRow[];
}
```

Note on the two phases: `probingItems` (Task 4) ranks by the latest assessment per concept, and the probing items are appended before the officer's turn on the last facts item, so `remaining` in the officer's state already lists them; `advance` (Task 4) searches from the cursor forward, so a concept that exists twice moves to its probing copy.

`lib/db/progression.ts` — replace the interim zeros (Task 2, Step 4) with real reads. In `loadProgressionFacts`, add to the `Promise.all`:

```ts
    db.from('interview_sessions').select('verdict').eq('user_id', userId),
```

and return `interviewSessions: interviews.data?.length ?? 0, interviewReady: (interviews.data ?? []).some((s) => s.verdict === 'ready'), appointmentBooked: false`. In `loadProgressionFactsForUsers`, add `db.from('interview_sessions').select('user_id, verdict').in('user_id', userIds)` and fold per user the same way.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/interviews.test.ts tests/integration/interviews.rls.test.ts && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: PASS 10/10; tsc clean. If the "ready" case is not ready, print the session's `summary.reasons` — the fake officer's `expected` matching is the usual culprit (`confirmRecord` writes `CONFIRMED_ANSWERS`; the answers in `expected` must contain those exact strings).

- [ ] **Step 5: Commit**

```bash
git add lib/db/interviews.ts lib/db/progression.ts tests/integration/interviews.test.ts
git commit -m "feat(interview): sessions, turns and verdicts under the service role; progression reads readiness"
```

---

### Task 7: The learner's screens

**Files:**
- Create: `app/[locale]/(learner)/interview/page.tsx`, `app/[locale]/(learner)/interview/start-button.tsx`, `app/[locale]/(learner)/interview/actions.ts`, `app/[locale]/(learner)/interview/turns.ts`, `app/[locale]/(learner)/interview/[sessionId]/page.tsx`, `app/[locale]/(learner)/interview/[sessionId]/chat.tsx`, `app/[locale]/(learner)/interview/[sessionId]/debrief.tsx`
- Modify: `messages/th.json`, `messages/en.json`, `messages/zh.json` (namespace `interview`)
- Create: `tests/e2e/interview.spec.ts`

**Interfaces:**
- Consumes: Task 6.
- Produces: routes `/interview`, `/interview/[sessionId]`; test ids `interview-start`, `interview-blocked`, `interview-history`, `interview-session-{id}` (with `data-verdict`), `chat-log`, `chat-message` (`data-role`, `data-concept`), `chat-input`, `chat-send`, `chat-end`, `chat-typing`, `interview-verdict` (`data-verdict`), `verdict-reasons`, `verdict-reason-{concept}` (`data-verdict`).

- [ ] **Step 1: Write the failing e2e spec**

```ts
import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerWithCompany, seedPassedExam } from './seed';

/** Answers the fake officer accepts for a record seeded by seedLearnerWithCompany. */
const GOOD: Record<string, string> = {
  company_name: '', // filled per test with the seeded name
  juristic_id: '0105568233704',
  business_activity: 'ทดสอบระบบ ขายสินค้าทดสอบให้ลูกค้าในประเทศ',
};
const FALLBACK = 'บริษัทดำเนินกิจการตามปกติ มีลูกค้าประจำในประเทศไทย';

async function answerUntilClosed(page: import('@playwright/test').Page, answer: (concept: string) => string) {
  for (let i = 0; i < 40; i++) {
    const verdict = page.getByTestId('interview-verdict');
    if (await verdict.count()) return;
    const last = page.getByTestId('chat-message').last();
    const concept = (await last.getAttribute('data-concept')) ?? '';
    await page.getByTestId('chat-input').fill(answer(concept));
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-typing')).toHaveCount(0, { timeout: 15_000 });
  }
}

test('the interview is locked before the exam and open after it', async ({ page }) => {
  const loginId = await seedLearnerWithCompany('บริษัท ล็อกสัมภาษณ์ จำกัด', '2026-07-13');
  await loginAs(page, loginId, E2E_PASSWORD);
  await page.goto('/th/interview');
  await expect(page.getByTestId('interview-blocked')).toContainText('ต้องสอบผ่านก่อน');
  await expect(page.getByTestId('interview-start')).toHaveCount(0);
});

test('a learner who evades is not ready, retries with good answers, and becomes ready for good', async ({ page }) => {
  const company = 'บริษัท สัมภาษณ์อีทูอี จำกัด';
  const loginId = await seedLearnerWithCompany(company, '2026-07-13');
  await seedPassedExam(loginId);
  await loginAs(page, loginId, E2E_PASSWORD);
  await page.getByTestId('stage-interview').getByRole('link', { name: 'เปิด' }).click();
  await expect(page).toHaveURL(/\/th\/interview$/);
  await page.getByTestId('interview-start').click();
  await page.waitForURL(/\/th\/interview\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('chat-message').first()).toHaveAttribute('data-role', 'officer');
  await expect(page.getByTestId('chat-message').first()).toContainText('สวัสดี');

  await answerUntilClosed(page, () => 'ไม่ทราบ');
  await expect(page.getByTestId('interview-verdict')).toHaveAttribute('data-verdict', 'not_ready');
  await expect(page.getByTestId('verdict-reason-company_name')).toHaveAttribute('data-verdict', 'evasive');
  // The debrief teaches: the correct company name is shown now, and never was in the chat.
  await expect(page.getByTestId('verdict-reasons')).toContainText(company);
  for (const bubble of await page.getByTestId('chat-message').all()) {
    if ((await bubble.getAttribute('data-role')) === 'officer') {
      await expect(bubble).not.toContainText('0105568233704');
    }
  }

  await page.goto('/th/interview');
  await expect(page.getByTestId('interview-history').locator('[data-verdict="not_ready"]')).toHaveCount(1);
  await page.getByTestId('interview-start').click();
  await page.waitForURL(/\/th\/interview\/[0-9a-f-]{36}$/);
  await answerUntilClosed(page, (c) => (c === 'company_name' ? company : (GOOD[c] ?? FALLBACK)));
  await expect(page.getByTestId('interview-verdict')).toHaveAttribute('data-verdict', 'ready');

  await page.goto('/th/dashboard');
  await expect(page.getByTestId('stage-interview-status')).toHaveText('เสร็จสิ้น');
  await expect(page.getByTestId('stage-appointment-status')).toHaveText('พร้อมใช้งาน');
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
  await expect(page.getByRole('link', { name: 'ลองอีกครั้ง' })).toHaveAttribute('href', '/th/interview');
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
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
```

`seedLearnerWithCompany` seeds juristic id `0105568233704`, nature `ทดสอบระบบ` and products `สินค้าทดสอบ`, no address, directors or role, so the fake officer's plan is three items: company name, registration number, business activity. The assignment trigger writes the eligibility snapshot; the seeded issue date 2026-07-13 plus 45 days is past and access never expires by default, so the appointment step reads **available** once the learner is ready.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec playwright test tests/e2e/interview.spec.ts`
Expected: FAIL — `/th/interview` is a 404 (`interview-blocked` not found).

- [ ] **Step 3: Strings**

Add the `interview` namespace to the three files:

| key | th | en | zh |
| --- | --- | --- | --- |
| title | สัมภาษณ์ความพร้อม | Readiness interview | 准备度面谈 |
| intro | เจ้าหน้าที่ธนาคาร (AI) จะสัมภาษณ์คุณเป็นภาษาไทยเหมือนวันจริง: ถามเกี่ยวกับบริษัท ตรวจกับหนังสือรับรอง และสรุปว่าคุณพร้อมหรือยัง ทำซ้ำได้ไม่จำกัด | An AI bank officer interviews you in Thai, as on the day: questions about your company, checked against the certificate, and a verdict on whether you are ready. Repeat as often as you like. | AI 银行专员将用泰语像正式面谈一样提问：询问贵公司情况、核对登记证明，并给出你是否准备好的结论。可无限次重复。 |
| thaiOnly | การสัมภาษณ์เป็นภาษาไทยทั้งหมด | The interview is entirely in Thai. | 面谈全程使用泰语。 |
| start | เริ่มการสัมภาษณ์ | Start the interview | 开始面谈 |
| resume | สัมภาษณ์ต่อ | Continue the interview | 继续面谈 |
| history | ครั้งที่ผ่านมา | Past interviews | 过往面谈 |
| verdict.ready | พร้อมแล้ว | Ready | 已准备好 |
| verdict.not_ready | ยังไม่พร้อม | Not yet ready | 尚未准备好 |
| verdict.abandoned | ไม่ได้จบการสัมภาษณ์ | Not finished | 未完成 |
| chat.placeholder | พิมพ์คำตอบเป็นภาษาไทย… | Type your answer in Thai… | 请用泰语输入回答… |
| chat.send | ส่ง | Send | 发送 |
| chat.end | จบการสัมภาษณ์ | End the interview | 结束面谈 |
| chat.typing | เจ้าหน้าที่กำลังพิมพ์… | The officer is typing… | 专员正在输入… |
| chat.officer | เจ้าหน้าที่ธนาคาร | Bank officer | 银行专员 |
| chat.you | คุณ | You | 你 |
| chat.limit | ตอบได้ไม่เกิน {max} ตัวอักษร | Up to {max} characters | 最多 {max} 个字符 |
| debrief.title | ผลการสัมภาษณ์ | Interview result | 面谈结果 |
| debrief.reasons | คำตอบของคุณทีละข้อ | Your answers, one by one | 你的逐题回答 |
| debrief.correctValue | ข้อมูลตามหนังสือรับรอง: {value} | On the certificate: {value} | 证明文件记载：{value} |
| debrief.review | ทบทวนบทเรียน | Review the card | 复习卡片 |
| debrief.tryAgain | ลองอีกครั้ง | Try again | 再试一次 |
| debrief.toDashboard | หน้าหลัก | Dashboard | 首页 |
| assessment.correct | ถูกต้อง | Correct | 正确 |
| assessment.partial | ถูกบางส่วน | Partly right | 部分正确 |
| assessment.wrong | ไม่ถูกต้อง | Wrong | 错误 |
| assessment.evasive | ไม่ได้ตอบ | Evaded | 回避 |
| assessment.pasted | คัดลอกจากระบบ | Pasted | 复制粘贴 |
| assessment.off_topic | ไม่ตรงคำถาม | Off topic | 答非所问 |
| concept.juristic_id | เลขทะเบียนนิติบุคคล | Registration number | 法人注册号 |
| errors.not_open | ยังไม่สามารถสัมภาษณ์ได้ | The interview is not open yet. | 面谈尚未开放。 |
| errors.not_configured | ยังไม่ได้ตั้งค่าผู้สัมภาษณ์ | The interviewer is not configured. | 尚未配置面谈官。 |
| errors.no_assignment | ยังไม่มีบริษัทที่มอบหมายให้คุณ | No company has been assigned to you. | 尚未为你分配公司。 |
| errors.closed | การสัมภาษณ์นี้จบแล้ว | This interview has ended. | 本次面谈已结束。 |
| errors.too_long | ข้อความยาวเกินไป | The message is too long. | 消息过长。 |
| errors.not_found | ไม่พบการสัมภาษณ์ | Interview not found. | 找不到面谈。 |
| errors.unknown | เกิดข้อผิดพลาด กรุณาลองใหม่ | Something went wrong. Please try again. | 出错了，请重试。 |

The concept names for the debrief come from `BANK_INTERVIEW_CONCEPTS[].question` in the UI language (the question _is_ the label), and `interview.concept.juristic_id` for the extra one.

- [ ] **Step 4: Actions**

`app/[locale]/(learner)/interview/turns.ts` (a plain module: a `'use server'` file may only export async functions):

```ts
/** The concept the officer asks about next, kept on the bubble for the suite and the debrief. */
export function nextConcept(assessment: unknown): string | null {
  const next = (assessment as { next?: { concept?: string } } | null)?.next;
  return next && typeof next.concept === 'string' ? next.concept : null;
}
```

`app/[locale]/(learner)/interview/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { InterviewError, endInterview, startOrResumeInterview, submitLearnerMessage } from '@/lib/db/interviews';
import { nextConcept } from './turns';

export type SendResult =
  | { ok: true; turns: { id: string; role: string; content: string; concept: string | null }[]; closed: boolean }
  | { ok: false; error: string };

function code(e: unknown): string {
  return e instanceof InterviewError ? e.code : 'unknown';
}

/** Creates or resumes the learner's session and lands them in it. */
export async function startInterviewAction(locale: string): Promise<{ error: string } | never> {
  const user = await requireUser(locale);
  let sessionId: string;
  try {
    sessionId = (await startOrResumeInterview(user.id)).session.id;
  } catch (e) {
    return { error: code(e) };
  }
  revalidatePath(`/${locale}/dashboard`);
  redirect(`/${locale}/interview/${sessionId}`);
}

export async function sendMessageAction(locale: string, sessionId: string, content: string): Promise<SendResult> {
  const user = await requireUser(locale);
  try {
    const { turns, closed } = await submitLearnerMessage(user.id, sessionId, content);
    if (closed) revalidatePath(`/${locale}/interview/${sessionId}`);
    return {
      ok: true,
      closed,
      turns: turns.map((t) => ({
        id: t.id,
        role: t.role,
        content: t.content,
        concept: nextConcept(t.assessment),
      })),
    };
  } catch (e) {
    return { ok: false, error: code(e) };
  }
}

export async function endInterviewAction(locale: string, sessionId: string): Promise<{ error: string | null }> {
  const user = await requireUser(locale);
  try {
    await endInterview(user.id, sessionId);
  } catch (e) {
    return { error: code(e) };
  }
  revalidatePath(`/${locale}/interview/${sessionId}`);
  revalidatePath(`/${locale}/dashboard`);
  return { error: null };
}
```

- [ ] **Step 5: The start page**

`app/[locale]/(learner)/interview/page.tsx`:

```tsx
import { getTranslations } from 'next-intl/server';
import { ChevronIcon } from '@/components/icons';
import { LearnerShell } from '@/components/shell/learner-shell';
import { cachedStageStatuses } from '@/components/shell/stage-status';
import { Link } from '@/i18n/navigation';
import { requireUser } from '@/lib/auth/session';
import { listMyInterviews } from '@/lib/db/interviews';
import { createSupabaseServerClient } from '@/lib/db/server';
import { resolveInterviewProvider } from '@/lib/integrations/interview';
import { StartButton } from './start-button';

export default async function InterviewHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireUser(locale);
  const [db, t, ts, stages] = await Promise.all([
    createSupabaseServerClient(),
    getTranslations('interview'),
    getTranslations('stages'),
    cachedStageStatuses(user.id),
  ]);
  const gate = stages.interview;
  const open = gate.status === 'available' || gate.status === 'in_progress' || gate.status === 'done';
  const configured = resolveInterviewProvider() !== 'off';
  const sessions = open ? await listMyInterviews(db, user.id) : [];
  const resume = sessions.some((s) => s.status === 'in_progress');
  return (
    <LearnerShell title={t('title')} intro={t('intro')} step="interview">
      <div className="mx-auto grid max-w-[780px] gap-6">
        <section className="rise rounded-card bg-white px-5 py-6 shadow-raised md:px-8 md:py-7">
          <p className="mb-4 rounded-control bg-brand-50 px-3.5 py-2.5 text-sm font-medium text-brand-700">{t('thaiOnly')}</p>
          {!open && (
            <p data-testid="interview-blocked" className="rounded-control bg-warn-50 px-3.5 py-2.5 text-sm font-medium text-warn-700">
              {gate.reason ? ts(`reasons.${gate.reason}`) : ts(`status.${gate.status}`)}
            </p>
          )}
          {open && !configured && (
            <p data-testid="interview-blocked" className="rounded-control bg-ink-50 px-3.5 py-2.5 text-sm text-ink-700">{t('errors.not_configured')}</p>
          )}
          {open && configured && <StartButton resume={resume} />}
        </section>
        {sessions.length > 0 && (
          <section data-testid="interview-history" className="rise overflow-hidden rounded-card bg-white shadow-raised">
            ...one row per session: date (toLocaleString(locale)), a tag from t(`verdict.${session.verdict ?? 'abandoned'}`) with gold/warn/ink tones,
               data-testid={`interview-session-${session.id}`} data-verdict={session.verdict ?? 'abandoned'}, a Link to `/interview/${session.id}` with ChevronIcon...
          </section>
        )}
      </div>
    </LearnerShell>
  );
}
```

`start-button.tsx` (client) mirrors `quiz/start-button.tsx`: a form with `useActionState` over `startInterviewAction`, `data-testid="interview-start"`, label `resume ? t('resume') : t('start')`, error shown from `t(\`errors.${error}\`)`.

- [ ] **Step 6: The session page, the chat and the debrief**

`app/[locale]/(learner)/interview/[sessionId]/page.tsx`: `requireUser`; `getInterviewWithTurns(db, sessionId)` (RLS: another learner's id is `null` → `notFound()`); if `session.status === 'in_progress'` render `<LearnerShell step="interview" back={{ href: '/interview', label: t('title') }} title={t('title')}><Chat .../></LearnerShell>` with the turns mapped through `nextConcept`; otherwise `<Debrief .../>` with the same shell and `tone={verdict === 'ready' ? 'gold' : 'blue'}`.

`chat.tsx` (client): state `turns`, `pending`, `error`; renders `<ol data-testid="chat-log">` of `<li data-testid="chat-message" data-role data-concept>` bubbles — officer: `bg-brand-50 text-ink-900 rounded-card rounded-tl-sm` with the officer label; learner: `bg-brand-700 text-white rounded-card rounded-tr-sm ml-auto`; a typing bubble `data-testid="chat-typing"` while pending; the input bar (`textarea` `data-testid="chat-input"`, `maxLength={1000}`, Enter sends, Shift+Enter breaks a line), `chat-send` primary button, `chat-end` ghost button calling `endInterviewAction` then `router.refresh()`. On a `closed` result, `router.refresh()` so the server page renders the debrief. The log scrolls to the last bubble on every change (`ref.scrollIntoView`). Mobile: the input bar is `sticky bottom-0` with the glass-strong treatment; the log has `max-h-[60vh] overflow-y-auto` on desktop.

`debrief.tsx` (server): the verdict badge — `data-testid="interview-verdict" data-verdict={verdict}` — in the exam-result treatment (gold medallion when ready, warn circle otherwise) with `t(\`verdict.${verdict}\`)`; the narrative in Thai (`summary.narrative`); `<ol data-testid="verdict-reasons">` with one `<li data-testid={\`verdict-reason-${concept}\`} data-verdict={verdict}>` per reason: the concept's question in the UI language as the label, the assessment tag (`t(\`assessment.${verdict}\`)`), the note, `t('debrief.correctValue', { value })` where `value` is the fact-sheet value for the concept's placeholders (`interviewFacts` on the record: read the assignment server-side as the start does) — shown for every non-correct reason, and a `Link` to `/study/${cardKey}` labelled `t('debrief.review')`; the actions: when ready → `Link` to `/dashboard` (`t('debrief.toDashboard')`), otherwise the primary `Link` to `/interview` named `t('debrief.tryAgain')` and the ghost dashboard link.

- [ ] **Step 7: Run the spec to verify it passes**

Run: `pnpm exec playwright test tests/e2e/interview.spec.ts tests/e2e/learner-shell.spec.ts tests/e2e/dashboard-design.spec.ts`
Expected: PASS. Then `pnpm exec vitest run tests/unit/messages.test.ts && pnpm exec tsc --noEmit -p tsconfig.json && pnpm lint` — clean.

- [ ] **Step 8: Commit**

```bash
git add "app/[locale]/(learner)/interview" messages tests/e2e/interview.spec.ts
git commit -m "feat(interview): the learner's start page, the chat and the debrief"
```

---

### Task 8: The staff review screens

**Files:**
- Create: `app/[locale]/(admin)/admin/interviews/page.tsx`, `app/[locale]/(admin)/admin/interviews/[id]/page.tsx`
- Modify: `app/[locale]/(admin)/admin/page.tsx` (STAFF_LINKS: `['/admin/interviews', 'interviews']` where `calls` was), `messages/*.json` (`admin.nav.interviews`: th ผลสัมภาษณ์ความพร้อม / en Readiness interviews / zh 准备度面谈; and `admin.interviews.*`)
- Modify: `tests/e2e/manager-access.spec.ts` (the interviews page for a manager) and `tests/e2e/interview.spec.ts` (the admin opens the session)

- [ ] **Step 1: Write the failing assertions**

Append to `tests/e2e/interview.spec.ts`'s second test, after the ready verdict:

```ts
  await switchTo(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/interviews');
  const row = page.locator('[data-testid^="admin-interview-"]').filter({ hasText: company }).first();
  await expect(row).toContainText('พร้อมแล้ว');
  await row.getByRole('link').click();
  await expect(page).toHaveURL(/\/th\/admin\/interviews\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('admin-transcript').locator('[data-role="officer"]').first()).toContainText('สวัสดี');
  await expect(page.getByTestId('admin-assessments')).toContainText('ถูกต้อง');
```

(import `E2E_ADMIN` from `./fixtures` and `switchTo` from `./helpers`; `switchTo` clears the cookies and signs in, the way the other specs change user.) In `tests/e2e/manager-access.spec.ts`, the test "typing an admin-only URL does not get a manager in" loops over `['settings', 'notifications', 'managers']`; after that loop add:

```ts
  // Spec §4: a manager reads their own team's interviews, so this door opens.
  await page.goto('/th/admin/interviews');
  await expect(page).toHaveURL(/\/th\/admin\/interviews$/);
```

- [ ] **Step 2: Run to verify they fail** — `pnpm exec playwright test tests/e2e/interview.spec.ts tests/e2e/manager-access.spec.ts` → FAIL (404).

- [ ] **Step 3: Implement**

`admin/interviews/page.tsx` — `requireStaff`; `listInterviewsForStaff(db)`; a table (learner via `displayLoginId`, company, started, status, verdict tag) with `data-testid={\`admin-interview-${s.id}\`}` rows and an `open` link; strings `admin.interviews.{title,empty,learner,company,started,status,verdict,open,detailTitle,transcript,assessments,narrative}` in th/en/zh (th: ผลสัมภาษณ์ความพร้อม / ยังไม่มีการสัมภาษณ์ / ผู้เรียน / บริษัท / เริ่มเมื่อ / สถานะ / ผลสรุป / เปิด / รายละเอียดการสัมภาษณ์ / บทสนทนา / การประเมินรายข้อ / บทสรุป; en and zh accordingly). `admin/interviews/[id]/page.tsx` — `requireStaff`; `getInterviewWithTurns(db, id)` or `notFound()`; the transcript as `<ol data-testid="admin-transcript">` with `data-role` bubbles, each officer bubble followed by its assessment (concept, verdict tag, note) when present; the summary (`data-testid="admin-assessments"`): verdict, narrative, reasons list. Reuse the tokens (no new components needed).

- [ ] **Step 4: Verify** — the two specs PASS; `pnpm lint`, tsc, messages parity clean.

- [ ] **Step 5: Commit** — `git add "app/[locale]/(admin)/admin/interviews" "app/[locale]/(admin)/admin/page.tsx" messages tests/e2e/interview.spec.ts tests/e2e/manager-access.spec.ts && git commit -m "feat(interview): staff review of sessions and verdicts"`.

---

### Task 9: Docs, decisions, the full gate

**Files:**
- Modify: `docs/decisions-log.md` (D64, D65), `docs/security-checklist.md` (a row for interview transcripts: RLS reads, service-role writes, content to Anthropic only), `docs/superpowers/specs/2026-09-28-bank-readiness-interview-and-appointments-design.md` (status: "Implemented — P16a; P16b pending"), `docs/uat-script.md` (the bank step: interview instead of the call), `README.md` if it lists providers/env

- [ ] **Step 1: Decision rows** (insert after the last D-row, same table format):

| Date | # | Decision |
| --- | --- | --- |
| 2026-09-28 | D64 | The bank step is a **readiness interview**: a Thai chat with an AI bank assessor that verifies the learner against their own record, never states a fact, marks each answer correct / partial / wrong / evasive / pasted, and ends with a verdict decided by rules in `lib/domain/interview/verdict.ts` (core identity facts correct, business coherent, at most one evasion, nothing pasted left, plan completed) and a narrative the model writes from those assessments. Sessions and turns are the learner's, their manager's and the admin's (RLS), written only by the service role. The Vapi voice call, its webhook, tables and bucket are deleted. |
| 2026-09-28 | D65 | The dashboard has **six steps**: study, quiz, exam, name card, interview, appointment. The interview opens on exam pass (policy `require_exam_pass_for_interview`, renamed) and is not date-gated; the appointment (P16b) needs a ready learner and the 45-day window. Readiness is one-way. |

- [ ] **Step 2: The full gate**

Run: `pnpm db:reset > /dev/null; echo $?` (expect 0), then `pnpm exec vitest run && pnpm test:integration && pnpm test:e2e && pnpm lint && pnpm format:check && pnpm build && pnpm check:secrets`
Expected: all green; note the counts.

- [ ] **Step 3: Commit, merge, deploy**

```bash
git add docs README.md
git commit -m "docs: D64–D65, the interview in the checklist and the UAT script"
```

Then `finishing-a-development-branch`: fast-forward `main`, push, apply `20260929000000_interview.sql` to staging through the Supabase MCP (`apply_migration`), check `get_advisors`, watch CI, confirm `/api/health` shows the new SHA and `interview: claude` (staging has the Anthropic key), and tell the owner to remove `VAPI_WEBHOOK_SECRET` and any `VAPI_*` values from Vercel.

---

## Self-review

- **Spec coverage.** §3 six steps → Tasks 1–2; §4.1 fact sheet → Task 6 (`interviewFacts`); §4.2 plan and probing → Task 4 (`buildPlan`, `probingItems`) and Task 6 (appended when the last facts item is asked, proven by the "probing phase" integration test); §4.3 turn protocol, pasted, evasive, limits → Tasks 4–6; §4.4 verdict rules and debrief → Tasks 4, 7; §4.5 lifecycle → Task 6; §4.6 models and fake → Task 5; §4.7 privacy → Task 3 RLS + Task 6 service role; §6 removal → Tasks 2–3; §8 routes → Tasks 7–8; §9 screens → Task 7 (chat/debrief in tokens), §10 strings → Tasks 2, 7, 8; §11 tests → each task. §5 and §9's appointment screens are P16b.
- **Interfaces.** `FactSheet`/`InterviewPlan`/`OfficerTurn` (Task 4) are consumed unchanged by Tasks 5–7; `officerTurnSchema` matches `OfficerTurn`; `nextConcept` reads the `next` the db layer stores on officer turns (Task 6 `record(... { ...assessment, next })`).
- **Placeholders.** Two intentionally descriptive steps (Task 7 Steps 5–6 markup for the history rows and the debrief) name every element, test id and string; the implementer writes the JSX in the tokens already used by the exam result and the study list.
- **Review Focus.** 1 → Task 4 verdict test "does not require a core fact the record cannot verify"; 2 → Task 4 pasted tests; 3 → Task 6 "abandons an idle session"; 4 → Task 3 RLS test + Task 6 "refuses another learner's session"; 5 → Task 1 policy tests + Task 7's first e2e.
