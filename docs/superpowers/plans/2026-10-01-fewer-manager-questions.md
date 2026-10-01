# Fewer Manager Questions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A company record asks a manager only the questions nothing else can answer — nine instead of twenty-four — and everything else the bank asks is filled automatically. The quiz keeps its 30 questions.

**Architecture:** One pure function, `withStandardAnswers`, turns the stored Level 4 answers into the answers the learner is taught: it fills what the DBD, another answer, the two money amounts or a fixed wording can supply, and sets the four company status facts to yes. `buildFactSheet` is the single place every reader builds the facts, so the function is applied there and nowhere needs its own copy. The quiz registry keeps all 30 concepts in their order; the interview loses its two repeated customer questions and closes up to 11 slots, in code and table together.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, next-intl (th / en / zh), Supabase Postgres (one migration), Vitest, Playwright.

**Base:** branch `feat/fewer-manager-questions`, from `fix/address-and-category` (f218cca) plus the two proposal commits. Worktree `../portal-p17a`, its own local stack.

---

## Owner decisions this plan carries out (2026-10-01)

| # | Decision |
|---|---|
| 1 | **Only the questions that cannot be removed or avoided stay.** At upload, unchanged: company email, company phone, what the business does, what it sells. On the record, five: where and how customers are found, what kind of customers, main suppliers, monthly revenue, average amount per transaction. |
| 2 | **Main customers and examples of real customers are no longer asked of the manager**; they repeat other questions. Main suppliers stays because nothing else covers suppliers. |
| 3 | **The quiz keeps its 30 questions as they are.** Question 14, main customers, stays and is answered from "what kind of customers". |
| 4 | **Company status is always yes** and is not asked. The "expected…" wordings are removed. |
| 5 | **Actual place of business is always the office address.** |
| 6 | **Why a bank account and why PromptPay / QR are fixed answers** for every company. |
| 7 | Money is minimised: transactions per month, the basis of the revenue figure and how sales are paid are worked out from the two amounts. Source of funds and the first money into the account are fixed answers. Why the company was established is built from what the business does. |

## Consequences to confirm with the approval

| # | Consequence | Proposed |
|---|---|---|
| A | The quiz is unchanged: 30 questions, the nine critical concepts, pass at 27, retest at 23. | — |
| B | The interview has 11 questions: main customers and examples of real customers leave it, and "what kind of customers" stays. Its pass mark keeps the proportion (P17g builds it; today it is only in the spec). | Pass 9 of 11 |
| C | A standard answer is always used. Anything a manager typed earlier for those questions stays stored but is no longer read. | — |
| D | Fixed wording, in Thai as the facts are: see Task 1. | Confirm or correct |
| E | The two amounts must contain digits ("300,000 บาท"). An amount written only in words cannot be divided, and the record then lists transactions per month as missing. | — |
| F | Existing training versions are untouched. A record gets a new version the next time it is checked; learners stay on their version until moved (D75). | — |
| G | Migration `20261005010000_fewer_questions.sql` must reach production before the merge. Production push only on the Owner's word. | — |

## File structure

| File | Responsibility |
|---|---|
| `lib/domain/standard-answers.ts` (new) | Which Level 4 questions are asked, which are filled, and the function that fills them |
| `lib/domain/concepts/registry.ts` | 36 concepts: the 30 of the quiz unchanged, 11 interview slots, one alternate wording |
| `supabase/migrations/20261005010000_fewer_questions.sql` (new) | The same change in `evaluation_concepts`; variants worded for a status that is now always yes |
| `lib/domain/facts/fact-sheet.ts`, `lib/domain/facts/snapshot.ts` | Read the filled answers |
| `lib/domain/validation/validators.ts` | Never report a filled answer whose source is already reported |
| `lib/content/mcq-starter.ts`, `lib/domain/mcq/sample.ts` | One main-customers draft for every company; the sample shows the standard answers |
| `app/[locale]/(admin)/admin/dbd-records/[id]/interview-form.tsx`, `page.tsx` | Five questions and a read-only list of what is filled |
| `messages/{th,en,zh}.json` | New wording; the status and "expected…" wording removed |
| `docs/…` | D91, spec amendment, UAT A17, runbook |

---

### Task 1: Standard answers

**Files:**

- Create: `lib/domain/standard-answers.ts`
- Test: `tests/unit/domain/standard-answers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/domain/standard-answers.test.ts
import { describe, expect, it } from 'vitest';
import { EMPTY_INTERVIEW_PROFILE } from '@/lib/domain/bank-interview';
import {
  ASKED_INTERVIEW_FIELDS,
  FIXED_ANSWERS,
  STANDARD_ANSWER_FIELDS,
  firstAmount,
  withStandardAnswers,
} from '@/lib/domain/standard-answers';

const ADDRESS = 'เลขที่ 87 หมู่ที่ 9 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด';
const typed = {
  ...EMPTY_INTERVIEW_PROFILE,
  nature_of_business: 'ค้าส่งและค้าปลีกเสื้อผ้าสตรี',
  monthly_revenue: 'ประมาณ 300,000 บาท',
  average_transaction: 'ประมาณ 10,000 บาท',
};

describe('firstAmount', () => {
  it('reads the first number, with separators, decimals or Thai digits', () => {
    expect(firstAmount('ประมาณ 300,000 บาท')).toBe(300000);
    expect(firstAmount('1,250.50')).toBe(1250.5);
    expect(firstAmount('๓๐๐,๐๐๐ บาท')).toBe(300000);
  });

  it('refuses what it cannot divide by: no digits, zero, or a number scaled by a word', () => {
    expect(firstAmount('สามแสนบาท')).toBeNull();
    expect(firstAmount('0 บาท')).toBeNull();
    expect(firstAmount('3 แสนบาท')).toBeNull();
    expect(firstAmount('300k')).toBeNull();
    expect(firstAmount('30 万')).toBeNull();
    expect(firstAmount(null)).toBeNull();
  });
});

describe('withStandardAnswers', () => {
  it('asks five questions and fills ten, and no field is both', () => {
    expect(ASKED_INTERVIEW_FIELDS).toEqual([
      'client_origin',
      'customer_profile',
      'main_suppliers',
      'monthly_revenue',
      'average_transaction',
    ]);
    expect(STANDARD_ANSWER_FIELDS).toHaveLength(10);
    for (const f of STANDARD_ANSWER_FIELDS) expect(ASKED_INTERVIEW_FIELDS).not.toContain(f);
  });

  it('answers "main customers" with what kind of customers they are (quiz question 14)', () => {
    const p = withStandardAnswers(
      { ...typed, customer_profile: 'ร้านค้าปลีกในประเทศ', main_clients: 'คำตอบเดิม' },
      { address: ADDRESS },
    );
    expect(p.main_clients).toBe('ร้านค้าปลีกในประเทศ');
    expect(withStandardAnswers(typed, { address: ADDRESS }).main_clients).toBeNull();
  });

  it('fills the place of business, the fixed answers and the purpose', () => {
    const p = withStandardAnswers(typed, { address: ADDRESS });
    expect(p.business_address).toBe(ADDRESS);
    expect(p.business_purpose).toBe('จัดตั้งขึ้นเพื่อประกอบธุรกิจ ค้าส่งและค้าปลีกเสื้อผ้าสตรี');
    expect(p.account_purpose).toBe(FIXED_ANSWERS.account_purpose);
    expect(p.promptpay_qr_purpose).toBe(FIXED_ANSWERS.promptpay_qr_purpose);
    expect(p.source_of_funds).toBe(FIXED_ANSWERS.source_of_funds);
    expect(p.first_incoming_funds).toBe(FIXED_ANSWERS.first_incoming_funds);
  });

  it('works the money answers out from the two amounts', () => {
    const p = withStandardAnswers(typed, { address: ADDRESS });
    expect(p.monthly_transactions).toBe('ประมาณ 30 รายการต่อเดือน');
    expect(p.revenue_basis).toBe('ยอดขายประมาณ 30 รายการต่อเดือน เฉลี่ยรายการละ 10,000 บาท');
    expect(p.transaction_details).toBe(
      'ลูกค้าชำระด้วยการโอนเงินผ่านธนาคารและ PromptPay / QR เฉลี่ยรายการละประมาณ 10,000 บาท',
    );
    // Never fewer than one sale a month.
    const small = withStandardAnswers(
      { ...typed, monthly_revenue: '5,000', average_transaction: '20,000' },
      { address: ADDRESS },
    );
    expect(small.monthly_transactions).toBe('ประมาณ 1 รายการต่อเดือน');
  });

  it('leaves a computed answer empty when an amount is missing or not a number', () => {
    const p = withStandardAnswers({ ...typed, monthly_revenue: 'สามแสนบาท' }, { address: null });
    expect(p.monthly_transactions).toBeNull();
    expect(p.revenue_basis).toBeNull();
    expect(p.business_address).toBeNull();
    // How sales are paid is always answered; the amount is added when there is one.
    expect(p.transaction_details).toContain('เฉลี่ยรายการละประมาณ 10,000 บาท');
    expect(
      withStandardAnswers({ ...typed, average_transaction: null }, { address: null })
        .transaction_details,
    ).toBe('ลูกค้าชำระด้วยการโอนเงินผ่านธนาคารและ PromptPay / QR');
    expect(
      withStandardAnswers({ ...typed, nature_of_business: null }, { address: null })
        .business_purpose,
    ).toBeNull();
  });

  it('always answers yes to the company status, and ignores an earlier typed answer (D91)', () => {
    const p = withStandardAnswers(
      {
        ...typed,
        has_existing_customers: 'no',
        operations_started: null,
        account_purpose: 'คำตอบเดิมของผู้จัดการ',
        business_address: 'ที่อยู่เดิม',
      },
      { address: ADDRESS },
    );
    expect(p.operations_started).toBe('yes');
    expect(p.has_existing_customers).toBe('yes');
    expect(p.has_completed_transactions).toBe('yes');
    expect(p.has_regular_suppliers).toBe('yes');
    expect(p.account_purpose).toBe(FIXED_ANSWERS.account_purpose);
    expect(p.business_address).toBe(ADDRESS);
  });

  it('keeps what the manager is still asked exactly as typed', () => {
    const asked = {
      ...typed,
      client_origin: 'หน้าร้านและออนไลน์',
      customer_profile: 'ร้านค้าปลีกในประเทศ',
      main_suppliers: 'โรงงานในกรุงเทพมหานคร',
    };
    const p = withStandardAnswers(asked, { address: ADDRESS });
    for (const f of ASKED_INTERVIEW_FIELDS) expect(p[f]).toBe(asked[f]);
    expect(p.nature_of_business).toBe(asked.nature_of_business);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test:unit tests/unit/domain/standard-answers.test.ts`
Expected: FAIL — cannot resolve `@/lib/domain/standard-answers`.

- [ ] **Step 3: Write the module**

```ts
// lib/domain/standard-answers.ts
import type { InterviewProfile } from './bank-interview';

/**
 * The Level 4 questions a manager is still asked (D91): the ones no document, no other answer
 * and no fixed wording can supply. Shown in this order.
 */
export const ASKED_INTERVIEW_FIELDS = [
  'client_origin',
  'customer_profile',
  'main_suppliers',
  'monthly_revenue',
  'average_transaction',
] as const;
export type AskedInterviewField = (typeof ASKED_INTERVIEW_FIELDS)[number];

/** The Level 4 answers nobody types any more, in the order the record lists them. */
export const STANDARD_ANSWER_FIELDS = [
  'main_clients',
  'business_purpose',
  'business_address',
  'monthly_transactions',
  'revenue_basis',
  'transaction_details',
  'source_of_funds',
  'first_incoming_funds',
  'account_purpose',
  'promptpay_qr_purpose',
] as const;
export type StandardAnswerField = (typeof STANDARD_ANSWER_FIELDS)[number];

/** The same answer for every company (Owner, 2026-10-01). Thai, as every fact is. */
export const FIXED_ANSWERS = {
  account_purpose:
    'เพื่อใช้ทำธุรกรรมทางการเงินของบริษัท รับเงินจากลูกค้าและจ่ายค่าใช้จ่ายของกิจการ',
  promptpay_qr_purpose:
    'ลูกค้านิยมชำระเงินแบบไม่ใช้เงินสด บริษัทจึงต้องมี PromptPay / QR ไว้รับชำระเงิน',
  source_of_funds: 'เงินลงทุนของผู้ถือหุ้นตามทุนจดทะเบียนของบริษัท',
  first_incoming_funds:
    'เงินค่าหุ้นที่ผู้ถือหุ้นชำระ เพื่อใช้เป็นเงินทุนเริ่มต้นและเงินหมุนเวียนของกิจการ',
} as const satisfies Partial<Record<StandardAnswerField, string>>;

const PAYMENT = 'ลูกค้าชำระด้วยการโอนเงินผ่านธนาคารและ PromptPay / QR';

/**
 * What a filled answer is worked out from. When one of these is missing the filled answer is
 * missing too, and only the source is reported (`validators.ts`).
 */
export const STANDARD_ANSWER_SOURCES: Partial<Record<StandardAnswerField, readonly string[]>> = {
  main_clients: ['customer_profile'],
  business_purpose: ['nature_of_business'],
  business_address: ['address'],
  monthly_transactions: ['monthly_revenue', 'average_transaction'],
  revenue_basis: ['monthly_revenue', 'average_transaction', 'monthly_transactions'],
};

const THAI_DIGITS = /[๐-๙]/g;
const NUMBER = /\d[\d,]*(?:\.\d+)?/;
/** "3 แสน", "300k", "30 万": the digits are not the amount, so nothing is computed from them. */
const SCALED = /^\s*(พัน|หมื่น|แสน|ล้าน|k|m|thousand|million|千|万|百万)/i;

/** The first amount written in digits, or null when there is none to divide by. */
export function firstAmount(text: string | null | undefined): number | null {
  const plain = (text ?? '').replace(THAI_DIGITS, (d) => String(d.charCodeAt(0) - 0x0e50));
  const match = NUMBER.exec(plain);
  if (!match) return null;
  if (SCALED.test(plain.slice(match.index + match[0].length))) return null;
  const value = Number(match[0].replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}

const show = (n: number) => n.toLocaleString('en-US');

/**
 * The answers the learner is taught: what the manager typed for the questions still asked, and
 * for every other Level 4 question the standard answer — from the DBD, from another answer,
 * from the two amounts, or the same for every company. A standard answer always wins; what was
 * typed for it earlier stays stored and is not read (D91). The four company status facts are
 * always yes.
 */
export function withStandardAnswers(
  profile: InterviewProfile,
  context: { address: string | null },
): InterviewProfile {
  const revenue = firstAmount(profile.monthly_revenue);
  const average = firstAmount(profile.average_transaction);
  const perMonth =
    revenue !== null && average !== null ? Math.max(1, Math.round(revenue / average)) : null;
  const nature = profile.nature_of_business?.trim() || null;
  return {
    ...profile,
    operations_started: 'yes',
    has_existing_customers: 'yes',
    has_completed_transactions: 'yes',
    has_regular_suppliers: 'yes',
    // "Who are the main customers?" is the kind of customers the manager described.
    main_clients: profile.customer_profile?.trim() || null,
    business_purpose: nature ? `จัดตั้งขึ้นเพื่อประกอบธุรกิจ ${nature}` : null,
    business_address: context.address?.trim() || null,
    monthly_transactions: perMonth !== null ? `ประมาณ ${show(perMonth)} รายการต่อเดือน` : null,
    revenue_basis:
      perMonth !== null && average !== null
        ? `ยอดขายประมาณ ${show(perMonth)} รายการต่อเดือน เฉลี่ยรายการละ ${show(average)} บาท`
        : null,
    transaction_details:
      average !== null ? `${PAYMENT} เฉลี่ยรายการละประมาณ ${show(average)} บาท` : PAYMENT,
    ...FIXED_ANSWERS,
  };
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `pnpm test:unit tests/unit/domain/standard-answers.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/standard-answers.ts tests/unit/domain/standard-answers.test.ts
git commit -m "feat(facts): the standard answers nobody types (D91)"
```

---

### Task 2: The registry — the quiz as it is, the interview without its repeats

**Files:**

- Modify: `lib/domain/concepts/registry.ts`
- Modify: `lib/domain/concepts/resolve.ts` (comment only)
- Test: `tests/unit/domain/concept-registry.test.ts`, `tests/unit/domain/concept-resolve.test.ts`

- [ ] **Step 1: Change the registry test to the new shape**

In `tests/unit/domain/concept-registry.test.ts` the tests "has exactly the 30 MCQ concepts in order 1–30" and "has exactly the nine critical concepts" stay as they are. Replace the other three:

```ts
  it('has 36 distinct concepts (D91 removed the examples of customers)', () => {
    expect(EVALUATION_CONCEPTS).toHaveLength(36);
    expect(new Set(EVALUATION_CONCEPTS.map((c) => c.key)).size).toBe(36);
    expect(EVALUATION_CONCEPTS.map((c) => c.key)).not.toContain('customer_examples');
  });

  it('keeps main customers as quiz question 14 only', () => {
    const main = EVALUATION_CONCEPTS.find((c) => c.key === 'main_clients')!;
    expect([main.mcqOrder, main.interviewSlot, main.interviewMatch]).toEqual([14, null, null]);
  });

  it('has the 11 chatbot slots in the Owner’s order with the Owner’s match types (D78, D91)', () => {
    expect(INTERVIEW_CONCEPTS.map((c) => [c.key, c.interviewMatch])).toEqual([
      ['company_name', 'normalized'],
      ['registration_number', 'exact'],
      ['registered_address', 'structured'],
      ['actual_business', 'semantic'],
      ['products_services', 'semantic'],
      ['authorized_representative', 'structured'],
      ['attendee_identity', 'normalized'],
      ['registration_date', 'normalized'],
      ['account_purpose', 'semantic'],
      ['customer_profile', 'semantic'],
      ['transaction_details', 'semantic'],
    ]);
  });

  it('keeps one alternate wording: whether the learner holds shares (D91)', () => {
    const alt = Object.fromEntries(
      EVALUATION_CONCEPTS.filter((c) => c.alternateWhen.length > 0).map((c) => [
        c.key,
        [...c.alternateWhen],
      ]),
    );
    expect(alt).toEqual({ learner_shareholding: ['learner_is_shareholder'] });
  });
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test:unit tests/unit/domain/concept-registry.test.ts`
Expected: FAIL — 37 concepts; 13 slots; twelve alternates.

- [ ] **Step 3: Change the registry**

In `lib/domain/concepts/registry.ts`:

1. Header comment: "the 30 MCQ concepts are fixed product decisions, the 11 chatbot slots are fixed in the Owner's order (D91 removed two repeated customer questions from the interview)"; `/** 1–11: chatbot slot; null = MCQ only. */`.
2. Delete the `customer_examples` row.
3. `main_clients`: delete its `interviewSlot`, `interviewMatch` and `alternateWhen` lines (it stays `mcqOrder: 14`).
4. Delete every other `alternateWhen: [...]` line except `learner_shareholding`'s.
5. New `interviewSlot` values: `customer_profile` 10, `transaction_details` 11.

No `mcqOrder` changes.

In `lib/domain/concepts/resolve.ts` change the `Scope` comment to "company — … 29 MCQ and 10 chatbot company-level concepts. assignment — one learner: all 30 and 11".

- [ ] **Step 4: Update `tests/unit/domain/concept-resolve.test.ts`**

- Interview counts only: every `total: 13` → `11`, `total: 12` → `10`, and each `ready` beside it by the same step (13→11, 12→10, 11→9). MCQ counts stay.
- Replace the two tests "needs the status fact behind an alternate wording" and "treats a stated "no" as present" with:

```ts
  it('needs no company status fact any more (D91)', () => {
    const c = conceptCoverage(
      { ...complete(), has_existing_customers: null, operations_started: null },
      'company',
    );
    expect(c.missingFacts).toEqual([]);
  });

  it('no longer asks for examples of customers', () => {
    const c = conceptCoverage({ ...complete(), customer_examples: null }, 'company');
    expect(c.missingFacts).toEqual([]);
    expect(c.concepts.map((x) => x.key)).not.toContain('customer_examples');
  });
```

- [ ] **Step 5: Run both and see them pass**

Run: `pnpm test:unit tests/unit/domain/concept-registry.test.ts tests/unit/domain/concept-resolve.test.ts`
Expected: PASS. (`pnpm typecheck` still fails where the starter drafts and MCQ tests word a variant for a company status — Task 6.)

- [ ] **Step 6: Commit**

```bash
git add lib/domain/concepts tests/unit/domain/concept-registry.test.ts tests/unit/domain/concept-resolve.test.ts
git commit -m "feat(concepts): 11 interview slots and one alternate wording; the quiz unchanged (D91)"
```

---

### Task 3: The same change in the database

**Files:**

- Create: `supabase/migrations/20261005010000_fewer_questions.sql`
- Test: `tests/integration/evaluation-concepts.test.ts`, `tests/integration/mcq-bank.db.test.ts`

- [ ] **Step 1: Change the integration tests**

`tests/integration/evaluation-concepts.test.ts`:

- `expect(data).toHaveLength(37)` → `36`;
- the comment "All 13 slots are taken" becomes "Slots 12 and 13 no longer exist (D91)", and add to "refuses rows that break the registry rules":

```ts
    const slotTooHigh = await svc.from('evaluation_concepts').insert({
      ...base,
      key: 'x_slot_12',
      source: 'DBD_FACT',
      facts: ['company_name_th'],
      answer_type: 'name',
      interview_slot: 12,
      interview_match: 'normalized',
    });
    expect(slotTooHigh.error?.code).toBe('23514');
```

`tests/integration/mcq-bank.db.test.ts` (around lines 120–150): the status wording tests use the one alternate that is left. Replace `applies_when: { fact: 'operations_started' … }` with `concept_key: 'learner_shareholding', applies_when: { fact: 'learner_is_shareholder' … }`, replace the accepted example (`main_clients` / `has_existing_customers: false`) with `learner_shareholding` / `learner_is_shareholder: false`, and add:

```ts
  it('refuses a wording for a company status, which is always yes (D91)', async () => {
    const status = await svc.from('questions').insert(
      variant({
        concept_key: 'main_clients',
        applies_when: { fact: 'has_existing_customers', value: false },
      }),
    );
    expect(status.error?.message).toContain('no alternate wording');
    const plain = await svc
      .from('questions')
      .insert(variant({ concept_key: 'main_clients' }))
      .select('id')
      .single();
    expect(plain.error).toBeNull();
  });
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm db:reset && pnpm test:integration tests/integration/evaluation-concepts.test.ts tests/integration/mcq-bank.db.test.ts`
Expected: FAIL — the table still holds 37 rows, 13 slots and the status alternates.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20261005010000_fewer_questions.sql
-- D91 (Owner, 2026-10-01): only the questions that cannot be removed or avoided stay. The quiz
-- keeps its 30 concepts. The interview loses its two repeated customer questions (main
-- customers, examples of real customers) and closes up to 11 slots. The company status is
-- always yes, so no concept has an "expected…" wording any more. Mirrors
-- lib/domain/concepts/registry.ts (tests/integration/evaluation-concepts.test.ts).

-- 1. Variants first, while the guard would still accept them. It is switched off for these two
--    statements only: neither is an edit by a person, and the second must not send an approved
--    variant back to draft for losing a condition that is now always true.
alter table public.questions disable trigger questions_variant_guard;

-- Worded for a status that can no longer be "no": never asked again.
update public.questions
   set approval_status = 'retired'
 where concept_key is not null
   and applies_when ->> 'fact' in
     ('operations_started', 'has_existing_customers', 'has_completed_transactions', 'has_regular_suppliers')
   and (applies_when ->> 'value')::boolean = false;

-- Worded for "yes": now the wording for every company.
update public.questions
   set applies_when = null
 where concept_key is not null
   and applies_when ->> 'fact' in
     ('operations_started', 'has_existing_customers', 'has_completed_transactions', 'has_regular_suppliers')
   and (applies_when ->> 'value')::boolean = true;

alter table public.questions enable trigger questions_variant_guard;

-- 2. Examples of real customers was an interview question only, so no variant points at it.
delete from public.evaluation_concepts where key = 'customer_examples';

-- 3. Main customers stays quiz question 14 and leaves the interview.
update public.evaluation_concepts
   set interview_slot = null, interview_match = null
 where key = 'main_clients';

-- 4. The interview closes up to 1–11.
update public.evaluation_concepts set interview_slot = 10 where key = 'customer_profile';
update public.evaluation_concepts set interview_slot = 11 where key = 'transaction_details';

-- 5. The company status is always yes: only the learner's own shareholding still turns wording.
update public.evaluation_concepts set alternate_when = '{}' where key <> 'learner_shareholding';

alter table public.evaluation_concepts
  drop constraint evaluation_concepts_interview_slot_check,
  add constraint evaluation_concepts_interview_slot_check check (interview_slot between 1 and 11);
```

- [ ] **Step 4: Apply it and see the tests pass**

Run: `pnpm db:reset && pnpm test:integration tests/integration/evaluation-concepts.test.ts tests/integration/mcq-bank.db.test.ts`
Expected: PASS. Then `pnpm db:types && pnpm exec prettier --write lib/db/database.types.ts && git diff --stat lib/db/database.types.ts` — expected: no change (rows and one constraint only).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261005010000_fewer_questions.sql tests/integration/evaluation-concepts.test.ts tests/integration/mcq-bank.db.test.ts
git commit -m "feat(db): the registry table follows D91; variants worded for a status are settled"
```

---

### Task 4: Every reader gets the filled answers

**Files:**

- Modify: `lib/domain/facts/fact-sheet.ts`, `lib/domain/facts/snapshot.ts`
- Test: `tests/unit/domain/fact-sheet.test.ts`, `tests/unit/domain/training-snapshot.test.ts`

- [ ] **Step 1: Change the tests**

`tests/unit/domain/fact-sheet.test.ts` — in "builds the company facts, status facts as booleans, and the derived counts" the fixture says `has_existing_customers: 'no'`; the sheet now says yes to all four:

```ts
      operations_started: true,
      has_existing_customers: true,
      has_completed_transactions: true,
      has_regular_suppliers: true,
```

and add:

```ts
  it('reads the standard answers, never what was typed for them (D91)', () => {
    const address = {
      full: 'เลขที่ 87 หมู่ที่ 9 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด',
      house_no: '87',
      moo: '9',
      road: null,
      subdistrict: 'หนองใหญ่',
      district: 'โพนทอง',
      province: 'ร้อยเอ็ด',
      postcode: '45110',
      province_id: 1,
      district_id: 1,
      subdistrict_id: 1,
      postcode_source: 'geography' as const,
      status: 'resolved' as const,
      issues: [],
    };
    const f = buildFactSheet({
      record,
      structured: {
        ...structured,
        interview: {
          ...structured.interview,
          business_address: 'ที่อยู่ที่พิมพ์ไว้เดิม',
          account_purpose: 'คำตอบเดิม',
          main_clients: 'ลูกค้าที่พิมพ์ไว้เดิม',
          customer_profile: 'ร้านค้าปลีกในประเทศ',
          monthly_revenue: '300,000 บาท',
          average_transaction: '10,000 บาท',
        },
      },
      address,
      role: null,
    });
    expect(f.business_address).toBe(address.full);
    expect(f.account_purpose).toBe(FIXED_ANSWERS.account_purpose);
    expect(f.main_clients).toBe('ร้านค้าปลีกในประเทศ');
    expect(f.monthly_transactions).toBe('ประมาณ 30 รายการต่อเดือน');
    expect(f.business_purpose).toBe('จัดตั้งขึ้นเพื่อประกอบธุรกิจ ค้าส่งและค้าปลีกเสื้อผ้า');
  });
```

(import `FIXED_ANSWERS` from `@/lib/domain/standard-answers`).

`tests/unit/domain/training-snapshot.test.ts` — wherever the expected facts list a Level 4 answer the fixture typed for a standard field, expect the standard answer instead; `has_existing_customers: true` already holds. Run the file after Step 3 and correct each expectation the failure names.

- [ ] **Step 2: Run and see the new test fail**

Run: `pnpm test:unit tests/unit/domain/fact-sheet.test.ts`
Expected: FAIL — `business_address` is the typed one.

- [ ] **Step 3: Apply the function in the one place the sheet is built**

`lib/domain/facts/fact-sheet.ts`:

```ts
import { withStandardAnswers } from '@/lib/domain/standard-answers';
```

and in `buildFactSheet` replace `const p = input.structured.interview ?? EMPTY_INTERVIEW_PROFILE;` with:

```ts
  // What the learner is taught: the manager's answers to the questions still asked, and the
  // standard answer to every other Level 4 question (D91).
  const p = withStandardAnswers(input.structured.interview ?? EMPTY_INTERVIEW_PROFILE, {
    address: input.address?.full ?? null,
  });
```

`lib/domain/facts/snapshot.ts`, in `templateRecordFromRecord` (the live fallback of the old templates) replace `const interview = structured.interview ?? EMPTY_INTERVIEW_PROFILE;` with:

```ts
  const interview = withStandardAnswers(structured.interview ?? EMPTY_INTERVIEW_PROFILE, {
    address: structured.address?.full ?? record.head_office_address,
  });
```

(import `withStandardAnswers`). `buildTrainingSnapshot` needs no change: its facts come from `buildFactSheet` and its extras are fields nobody fills.

- [ ] **Step 4: Run the unit suite**

Run: `pnpm test:unit tests/unit/domain`
Expected: `fact-sheet` and `training-snapshot` PASS; `validation/validators.test.ts` may now fail on findings that no longer exist — Task 5.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/facts tests/unit/domain/fact-sheet.test.ts tests/unit/domain/training-snapshot.test.ts
git commit -m "feat(facts): the fact sheet reads the standard answers (D91)"
```

---

### Task 5: Validation reports a source once, not what follows from it

**Files:**

- Modify: `lib/domain/validation/validators.ts`
- Test: `tests/unit/domain/validation/validators.test.ts`

- [ ] **Step 1: Change the tests**

In `tests/unit/domain/validation/validators.test.ts` replace the case that expects `'missing:has_existing_customers:version'` (around line 225) with:

```ts
  it('never asks for a company status (D91)', () => {
    const f = run({
      structured: {
        interview: {
          ...structured.interview!,
          has_existing_customers: null,
          operations_started: null,
        },
      },
    });
    expect(keys(f).filter((k) => k.includes('has_') || k.includes('operations'))).toEqual([]);
  });

  it('reports a missing amount once, not the answers worked out from it', () => {
    const f = run({
      structured: { interview: { ...structured.interview!, monthly_revenue: null } },
    });
    expect(keys(f).filter((k) => k.startsWith('missing:'))).toEqual([
      'missing:monthly_revenue:version',
    ]);
  });

  it('reports transactions per month when the amounts are there but not in digits', () => {
    const f = run({
      structured: { interview: { ...structured.interview!, monthly_revenue: 'สามแสนบาท' } },
    });
    expect(keys(f).filter((k) => k.startsWith('missing:'))).toEqual([
      'missing:monthly_transactions:version',
    ]);
  });

  it('reports the kind of customers once, not the main customers answered from it', () => {
    const f = run({
      structured: { interview: { ...structured.interview!, customer_profile: null } },
    });
    expect(keys(f).filter((k) => k.startsWith('missing:'))).toEqual([
      'missing:customer_profile:version',
    ]);
  });

  it('reports what the business does once, not the purpose built from it', () => {
    const f = run({
      structured: { interview: { ...structured.interview!, nature_of_business: null } },
    });
    expect(keys(f).filter((k) => k.startsWith('missing:'))).toEqual([
      'missing:nature_of_business:acceptance',
    ]);
  });
```

The fixture's `facts` must be built from the changed interview for these to mean anything: if `run` takes `facts` separately, build them in `run` with `buildFactSheet({ record, structured, address, role: null })` from the merged input (read the helper at the top of the file and follow its shape).

- [ ] **Step 2: Run and see them fail**

Run: `pnpm test:unit tests/unit/domain/validation/validators.test.ts`
Expected: FAIL — `missing:monthly_transactions` and `missing:revenue_basis` beside the amount; `missing:main_clients` beside the kind of customers; `missing:business_purpose` beside the nature.

- [ ] **Step 3: Skip what follows from a reported source**

In `validateFacts`, section 8, the loop becomes:

```ts
  for (const fact of coverage.missingFacts) {
    if (fact === 'address' && addressUnresolved) continue; // already a geo_mismatch
    // A standard answer is worked out from other facts; when one of those is missing, that is
    // what a person can fix, and it is already in this list (D91).
    const sources = STANDARD_ANSWER_SOURCES[fact as StandardAnswerField];
    if (sources?.some((s) => coverage.missingFacts.includes(s as FactKey))) continue;
    const concepts = coverage.concepts.filter((c) => c.missing.includes(fact)).map((c) => c.key);
    push(
      'missing',
      fact,
      ACCEPTANCE_FACTS.has(fact) ? 'acceptance' : 'version',
      { concepts },
      'missing',
    );
  }
```

with `import { STANDARD_ANSWER_SOURCES, type StandardAnswerField } from '@/lib/domain/standard-answers';`.

- [ ] **Step 4: Run and see them pass**

Run: `pnpm test:unit tests/unit/domain/validation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/validation tests/unit/domain/validation
git commit -m "feat(validation): a missing source is reported once, not each answer worked out from it"
```

---

### Task 6: The question bank without company-status wordings

**Files:**

- Modify: `lib/content/mcq-starter.ts`, `lib/domain/mcq/sample.ts`
- Test: `tests/unit/domain/mcq/starter.test.ts`, `rules.test.ts`, `render.test.ts`, `tests/integration/mcq-bank.test.ts`

- [ ] **Step 1: Change the tests**

- `starter.test.ts`: `toHaveLength(11)` → `10`.
- `tests/integration/mcq-bank.test.ts`: `expect(loaded).toHaveLength(11)` → `10`.
- `rules.test.ts`: `expect(checks).toHaveLength(30)` stays. The status-wording rule test (line ~150) uses `conceptKey: 'learner_shareholding', appliesWhen: { fact: 'learner_is_shareholder', value: true }` for the accepted case and keeps `{ fact: 'operations_started', value: true }` as the refused one; the coverage tests (lines ~275–303) use `learner_shareholding` / `learner_is_shareholder` in place of `main_clients` / `has_existing_customers`, and add `expect(coverage.concepts.find((c) => c.conceptKey === 'main_clients')!.cases).toHaveLength(1);`.
- `render.test.ts` line ~190: the variant worded for a status uses `conceptKey: 'learner_shareholding'` and `appliesWhen: { fact: 'learner_is_shareholder', value: false }`, with the sample facts' `learner_is_shareholder` set to match the case the test checks.

- [ ] **Step 2: Run and see them fail**

Run: `pnpm test:unit tests/unit/domain/mcq`
Expected: FAIL — 11 starters; a starter is worded for `has_existing_customers`.

- [ ] **Step 3: Change the bank content**

- `lib/content/mcq-starter.ts`: delete the entry `mcq-main-clients-2` (worded for a company with no customers yet); in `mcq-main-clients-1` set `appliesWhen: null`; the header comment says ten starter drafts.
- `lib/domain/mcq/sample.ts`: the sample company's answers follow the standard ones so the preview shows what a learner will see:

```ts
    main_clients: 'ร้านค้าปลีกในประเทศ',
    business_purpose: 'จัดตั้งขึ้นเพื่อประกอบธุรกิจ ค้าส่งและค้าปลีกเสื้อผ้าสตรี',
    monthly_transactions: 'ประมาณ 30 รายการต่อเดือน',
    revenue_basis: 'ยอดขายประมาณ 30 รายการต่อเดือน เฉลี่ยรายการละ 10,000 บาท',
    source_of_funds: FIXED_ANSWERS.source_of_funds,
    first_incoming_funds: FIXED_ANSWERS.first_incoming_funds,
    account_purpose: FIXED_ANSWERS.account_purpose,
    promptpay_qr_purpose: FIXED_ANSWERS.promptpay_qr_purpose,
    transaction_details:
      'ลูกค้าชำระด้วยการโอนเงินผ่านธนาคารและ PromptPay / QR เฉลี่ยรายการละประมาณ 10,000 บาท',
```

  (`customer_examples` stays in the sample: the fact sheet type still has it. The `{main_clients}` placeholder stays in `tokens.ts`: question 14 still uses it.)

- [ ] **Step 4: Run everything that compiles against the registry**

Run: `pnpm typecheck && pnpm test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/content/mcq-starter.ts lib/domain/mcq tests/unit/domain/mcq tests/integration/mcq-bank.test.ts
git commit -m "feat(bank): ten starter drafts; no wording for a company status"
```

---

### Task 7: The Level 4 form asks five questions

**Files:**

- Modify: `app/[locale]/(admin)/admin/dbd-records/[id]/interview-form.tsx`, `page.tsx`
- Modify: `messages/th.json`, `messages/en.json`, `messages/zh.json`

No new component is needed (a form and a definition list in the existing staff classes), so nothing is sourced from 21st.dev; its MCP server is not signed in on this machine.

- [ ] **Step 1: Messages** (script written with the Write tool into the scratchpad, as before)

Under `admin.dbd` in all three files:

| Key | en | th | zh |
|---|---|---|---|
| `interviewHint` (replace) | Only what no document can answer. Everything else the bank asks is filled in below without anyone typing it. | เฉพาะคำถามที่ไม่มีเอกสารใดตอบได้ คำตอบอื่นที่ธนาคารถามจะถูกเติมให้ด้านล่างโดยไม่ต้องพิมพ์ | 仅需填写任何文件都无法回答的问题。银行会问的其他问题已在下方自动填好，无需输入。 |
| `amountHint` (new) | Write the amount in digits, for example 300,000. Transactions per month are worked out from the two amounts. | พิมพ์จำนวนเงินเป็นตัวเลข เช่น 300,000 ระบบจะคำนวณจำนวนรายการต่อเดือนจากสองจำนวนนี้ | 请用数字填写金额，例如 300,000。每月交易笔数由这两个金额计算得出。 |
| `standardAnswers.title` (new) | Filled automatically | เติมให้อัตโนมัติ | 自动填写 |
| `standardAnswers.hint` (new) | The learner is taught these answers. They come from the DBD, from the answers above, or are the same for every company. | ผู้เรียนจะได้เรียนคำตอบเหล่านี้ ซึ่งมาจากเอกสาร DBD จากคำตอบด้านบน หรือเป็นคำตอบเดียวกันทุกบริษัท | 学员将学习这些答案。它们来自 DBD 文件、上面的回答，或对所有公司都相同。 |
| `standardAnswers.pending` (new) | Fills in once the answer it is worked out from is written | จะเติมให้เมื่อกรอกคำตอบที่ใช้คำนวณแล้ว | 填写其依据的答案后自动生成 |

Remove `admin.dbd.statusFacts`, `admin.dbd.interviewFieldsAlt`, `admin.dbd.legacyHint`, and from `admin.dbd.interviewGroups` the keys `status`, `banking`, `legacy`. Before removing, `grep -rn "statusFacts\|interviewFieldsAlt\|legacyHint\|interviewGroups\." app components lib` must show no reader left after Step 2 (the coverage panel labels its missing facts from another namespace; if it reads `statusFacts.*`, keep those keys).

- [ ] **Step 2: The form**

Replace the body of `interview-form.tsx` with:

```tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import type { InterviewProfile } from '@/lib/domain/bank-interview';
import {
  STANDARD_ANSWER_FIELDS,
  type AskedInterviewField,
  type StandardAnswerField,
} from '@/lib/domain/standard-answers';
import { saveInterviewAnswersAction, type ToolState } from '../actions';

const initial: ToolState = { ok: false, error: null };

/** The questions still asked (D91), grouped as the bank groups them. */
const GROUPS: { key: 'customers' | 'money'; fields: AskedInterviewField[] }[] = [
  { key: 'customers', fields: ['client_origin', 'customer_profile', 'main_suppliers'] },
  { key: 'money', fields: ['monthly_revenue', 'average_transaction'] },
];

/**
 * Level 4 — what the bank asks that no DBD document answers. A manager writes five answers;
 * the rest are standard answers, shown read-only so the manager sees what the learner is taught.
 */
export function InterviewForm({
  recordId,
  answers,
  standard,
}: {
  recordId: string;
  answers: InterviewProfile;
  /** The standard answers as the fact sheet reads them (`withStandardAnswers`). */
  standard: Record<StandardAnswerField, string | null>;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd');
  const [state, formAction, pending] = useActionState(saveInterviewAnswersAction, initial);
  const section = 'grid gap-4 p-4 md:grid-cols-2 md:px-6 md:py-5';
  const heading = 'text-base font-semibold text-ink-900 md:col-span-2';

  return (
    <form
      action={formAction}
      className="staff-card grid divide-y divide-ink-100 p-0 md:p-0"
      data-testid="interview-answers"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={recordId} />
      <div className="grid gap-1 p-4 md:px-6 md:py-5">
        <h2 className="text-base font-semibold text-ink-900">{t('levels.interview')}</h2>
        <p className="text-sm text-ink-500">{t('interviewHint')}</p>
      </div>

      {GROUPS.map((group) => (
        <section key={group.key} className={section}>
          <h3 className={heading}>
            {t(`interviewGroups.${group.key}` as 'interviewGroups.customers')}
          </h3>
          {group.fields.map((field) => (
            <label key={field} className="text-sm">
              <span data-testid={`label-${field}`} className="font-semibold text-ink-900">
                {t(`interviewFields.${field}` as 'interviewFields.client_origin')}
              </span>
              <textarea
                name={`interview_${field}`}
                rows={2}
                defaultValue={answers[field] ?? ''}
                className="staff-input mt-1"
              />
            </label>
          ))}
          {group.key === 'money' && (
            <p className="text-sm text-ink-500 md:col-span-2">{t('amountHint')}</p>
          )}
        </section>
      ))}

      <div className="flex flex-wrap items-center justify-end gap-3 p-4 md:px-6">
        {state.error && (
          <p role="alert" className="mr-auto text-sm text-bad-600">
            {state.error}
          </p>
        )}
        {state.ok && (
          <p role="status" data-testid="interview-saved" className="mr-auto text-sm text-ok-600">
            {t('saved')}
          </p>
        )}
        <button type="submit" disabled={pending} data-testid="save-interview" className="staff-btn">
          {t('saveInterview')}
        </button>
      </div>

      <section className="grid gap-3 p-4 md:px-6 md:py-5" data-testid="standard-answers">
        <div>
          <h3 className="text-base font-semibold text-ink-900">{t('standardAnswers.title')}</h3>
          <p className="text-sm text-ink-500">{t('standardAnswers.hint')}</p>
        </div>
        <dl className="grid gap-x-6 gap-y-3 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          {STANDARD_ANSWER_FIELDS.map((field) => (
            <div key={field} className="contents">
              <dt className="text-ink-500">
                {t(`interviewFields.${field}` as 'interviewFields.account_purpose')}
              </dt>
              <dd data-testid={`standard-${field}`} className="text-ink-900">
                {standard[field] ?? (
                  <span className="text-ink-500">{t('standardAnswers.pending')}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </form>
  );
}
```

`useActionState` resets an uncontrolled form after the action; the page revalidates, so `defaultValue` is the saved value — the same behaviour the form has today.

- [ ] **Step 3: The page passes the standard answers and counts the asked questions**

In `page.tsx`:

```tsx
import {
  ASKED_INTERVIEW_FIELDS,
  STANDARD_ANSWER_FIELDS,
  withStandardAnswers,
  type StandardAnswerField,
} from '@/lib/domain/standard-answers';
```

replace the `answered` count:

```tsx
  const answered = ASKED_INTERVIEW_FIELDS.filter(
    (field) => String(structured.interview?.[field] ?? '').trim() !== '',
  ).length;
```

the badge: `` interview: { text: `${answered}/${ASKED_INTERVIEW_FIELDS.length}` }, ``

and the tab:

```tsx
          interview: (
            <InterviewForm
              recordId={record.id}
              answers={structured.interview ?? EMPTY_INTERVIEW_PROFILE}
              standard={standardAnswers}
            />
          ),
```

with, beside `answered`:

```tsx
  const filled = withStandardAnswers(structured.interview ?? EMPTY_INTERVIEW_PROFILE, {
    address: address.full || null,
  });
  const standardAnswers = Object.fromEntries(
    STANDARD_ANSWER_FIELDS.map((field) => [field, filled[field]]),
  ) as Record<StandardAnswerField, string | null>;
```

(`address` is the resolved address the page already passes to `AddressPanel`.) Remove the `INTERVIEW_FIELDS` import if nothing else on the page uses it.

- [ ] **Step 4: Check**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit tests/unit/messages.test.ts`
Expected: clean; the three locales hold the same keys.

- [ ] **Step 5: Screenshots for the Owner**

Throwaway `tests/e2e/_shots.spec.ts` (never committed): a record with the Roi Et address and the business answers, the Level 4 tab at 1280 px in English and Thai and at 390 px, written to the scratchpad and sent with SendUserFile.

- [ ] **Step 6: Commit**

```bash
git add "app/[locale]/(admin)/admin/dbd-records/[id]" messages
git commit -m "feat(records): Level 4 asks five questions and shows what is filled automatically (D91)"
```

---

### Task 8: End-to-end

**Files:**

- Modify: `tests/e2e/facts-and-concepts.spec.ts`, `tests/e2e/training-versions.spec.ts`, `tests/e2e/mcq-bank.spec.ts`

- [ ] **Step 1: `facts-and-concepts.spec.ts`**

- line 60: the interview total `'12'` → `'10'`. The quiz totals (`'30'` on line 29, `'29'` on line 59) stay.
- From "A status fact relabels its fields at once…" to the end of that test, replace with:

```ts
  // Nothing asks for a company status any more, and the standard answers are already there.
  await expect(
    page.locator('[data-testid="coverage-missing"] [data-fact="has_existing_customers"]'),
  ).toHaveCount(0);
  await openRecordTab(page, 'interview');
  await expect(page.getByTestId('status-facts')).toHaveCount(0);
  await expect(page.getByTestId('label-customer_examples')).toHaveCount(0);
  await expect(page.getByTestId('label-main_clients')).toHaveCount(0);
  await expect(page.getByTestId('standard-business_address')).toHaveText(ROI_ET);
  await expect(page.getByTestId('standard-account_purpose')).toContainText('ธุรกรรมทางการเงิน');
  await expect(page.getByTestId('standard-business_purpose')).toContainText(
    'จัดตั้งขึ้นเพื่อประกอบธุรกิจ',
  );

  // The kind of customers answers "main customers"; the two amounts give the transactions.
  await page.locator('textarea[name="interview_customer_profile"]').fill('ร้านค้าปลีกในประเทศ');
  await page.locator('textarea[name="interview_monthly_revenue"]').fill('ประมาณ 300,000 บาท');
  await page.locator('textarea[name="interview_average_transaction"]').fill('10,000 บาท');
  await page.getByTestId('save-interview').click();
  await expect(page.getByTestId('interview-saved')).toBeVisible();
  await page.reload();
  await openRecordTab(page, 'interview');
  await expect(page.getByTestId('standard-main_clients')).toHaveText('ร้านค้าปลีกในประเทศ');
  await expect(page.getByTestId('standard-monthly_transactions')).toHaveText(
    'ประมาณ 30 รายการต่อเดือน',
  );
```

- [ ] **Step 2: `training-versions.spec.ts`**

Interview counts only: line 27 `'12'` → `'10'`; line 38 `'13'` → `'11'`. The quiz counts (`'29'`, `'30'`) stay.

- [ ] **Step 3: `mcq-bank.spec.ts`**

Line 60's comment says "A concept with two cases is not covered by drafts" about `concept-main_clients`, which now has one case: assert it on `concept-learner_shareholding` instead. Any count of starter drafts on the page (11 → 10) follows; run the spec and correct what it names.

- [ ] **Step 4: Run the affected specs, then every spec**

Run: `PLAYWRIGHT_PORT=3100 pnpm exec playwright test tests/e2e/facts-and-concepts.spec.ts tests/e2e/training-versions.spec.ts tests/e2e/mcq-bank.spec.ts tests/e2e/validation.spec.ts tests/e2e/admin-dbd.spec.ts`
Expected: PASS. Any other spec that typed into a removed field, or expected a `missing` exception for a status fact, is corrected the same way.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e
git commit -m "test(e2e): five questions, standard answers, 11 interview questions"
```

---

### Task 9: Docs

**Files:**

- Modify: `docs/decisions-log.md`, `docs/superpowers/specs/2026-09-30-p17-evaluation-architecture-design.md`, `docs/superpowers/specs/2026-10-01-two-line-company-record-design.md`, `docs/uat-script.md`, `docs/runbooks/operations.md`

- [ ] **Step 1: D91** after D90 in the decisions log:

> **Only the questions that cannot be removed or avoided are asked (Owner).** A manager gives the company email and phone, what the business does and what it sells with the pack (D80), and five answers on the record: where and how customers are found, what kind of customers, main suppliers, monthly revenue, the average amount per transaction. Every other Level 4 answer is a standard answer that nobody types and that always wins over anything typed earlier: main customers is the kind of customers; the actual place of business is the head office address; why the company was established is built from what the business does; transactions per month, the basis of the revenue figure and how sales are paid are worked out from the two amounts (which must be written in digits); the source of funds, the first money into the account, why a bank account and why PromptPay / QR are the same for every company. The four company status facts are always yes and are not asked, so the "expected…" wordings are gone and only the learner's own shareholding still turns a wording. **The Business Knowledge Quiz keeps its 30 questions, its nine critical concepts and its pass marks.** The Bank Readiness Interview loses its two repeated customer questions (main customers, examples of real customers) and has 11; its pass mark keeps the proportion, 9 of 11. Supersedes D58/D80 for the Level 4 form, D78 for the interview's count, D73 for the status facts, and D74's "supplied by a person, never generated" for the standard answers.

Where it lives: `lib/domain/standard-answers.ts`, `lib/domain/concepts/registry.ts`, `supabase/migrations/20261005010000_fewer_questions.sql`, plan `docs/superpowers/plans/2026-10-01-fewer-manager-questions.md`.

Add "(superseded in part by D91)" to the D73, D74 and D78 rows.

- [ ] **Step 2: Spec amendment** — a new last section of the P17 spec, "## 15. Amendment 2026-10-01 — fewer questions (D91)", with the kept questions, the standard answers table, the 11 interview slots and the interview pass mark; §3, §5.4, §7.1 and §9 each get one line pointing at §15 rather than being rewritten. §8 (the quiz) is unchanged.

- [ ] **Step 3: Proposal doc** — status line becomes "Superseded by the plan `2026-10-01-fewer-manager-questions.md`: the Owner kept the unavoidable questions with the manager, kept main suppliers, and kept the quiz at 30 questions".

- [ ] **Step 4: UAT A17** — "Level 4 asks five questions": upload a pack with the four details; open Level 4; see five questions and ten filled answers; type the five; the record reaches 29 / 10 and gets its version with nobody confirming; a learner assigned to it shows 30 / 11 once the role is confirmed.

- [ ] **Step 5: Runbook** — a row "Transactions per month is listed as missing": both amounts are written but one is not in digits; write it as a number (300,000) and save.

- [ ] **Step 6: Commit**

```bash
git add docs
git commit -m "docs: D91 — only the questions that cannot be removed or avoided"
```

---

### Task 10: Full gate and report

- [ ] `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:unit`
- [ ] `pnpm db:reset && pnpm test:integration`
- [ ] `pnpm build && pnpm check:secrets`
- [ ] `PLAYWRIGHT_PORT=3100 pnpm test:e2e` (background, about eleven minutes, log in the scratchpad)
- [ ] Report the six items: commits, the migration (`20261005010000_fewer_questions.sql`, production push on the Owner's word), tests, deviations, debt, UI screenshots. Push, PR and merge only on the Owner's word.

## Self-review

- **Every Owner decision has a task:** kept questions (1, 7), the quiz at 30 with main customers answered from the kind of customers (1, 2, 6), the interview's two repeats removed (2, 3), status always yes (1, 2, 3, 6), office address (1, 4), fixed answers (1), minimised money (1, 5, 7).
- **Types agree across tasks:** `ASKED_INTERVIEW_FIELDS`, `STANDARD_ANSWER_FIELDS`, `STANDARD_ANSWER_SOURCES`, `FIXED_ANSWERS`, `firstAmount` and `withStandardAnswers(profile, { address })` are defined in Task 1 and used under those names in 4–8.
- **Known debt:** stored answers to removed or standard questions stay in `structured_data` unread; the interview profile schema keeps their fields so old versions and old rows still parse. A variant retired by the migration for a "no" wording keeps its condition and cannot be edited again. The upload form is unchanged. Standard answers are Thai only, like every other fact.

## Deviations in the build (2026-10-01)

- **The earlier answers stay on the form** (Task 7 planned to remove them). The bank-interview study card learners read today still prints four of them, so the collapsed *Earlier answers* block is kept, and a blank one follows the new answer (`withStandardAnswers`; `buildTrainingSnapshot` reads the same filled profile). `legacyHint` is reworded instead of removed.
- **The place of business falls back to the printed address** when no resolved address is passed to `buildFactSheet` (`RecordColumns.head_office_address`, optional), so the snapshot and the live template record agree.
- `tests/e2e/bank-interview.spec.ts` typed *why the company needs an account*; it now expects the fixed answer on the study card.
- A variant that names `customer_examples` is refused by the guard ("not an MCQ concept") before the foreign key is checked, so the integration test asserts that message.
- **The missing list is trimmed where it is built** (Task 5 planned it in validation only). Walking UAT A17 showed the coverage panel naming *Main customers* and *Transactions per month* as missing beside their sources, with no field to type them in; `conceptCoverage` now leaves a standard answer out of `missingFacts` when its source is missing, so the coverage panel, the versions panel and validation agree.
