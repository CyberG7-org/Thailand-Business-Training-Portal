# Business Knowledge Quiz (P17e) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The learner's Business Knowledge Quiz asks 30 questions — one per concept, written under the bank's controlled rules — tells the learner right or wrong after each answer, and ends in Pass, Retest or Fail by the Owner's rule (D71). The names it asks about are the names printed on the documents.

**Architecture:** The quiz stops drawing from the old AI-written pool. Starting an attempt picks one approved variant for each of the 30 concepts of the registry, renders it for the learner's pinned training version with the P17d renderer, and freezes the rendered text on the answer rows the attempt already uses. Answering reads that frozen row, so feedback is immediate and an answer cannot be changed. The result rule is one pure function. Separately, the document reader is given a sharp picture of every page whose text it cannot read, because that — not the quiz — is why a shareholder's name was wrong.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, next-intl (th / en / zh), Supabase Postgres (one migration), pdfjs-dist + @napi-rs/canvas (page pictures), Vitest, Playwright.

**Base:** branch `p17e/business-knowledge-quiz` from main f6aed70. Worktree `../portal-p17a`.

---

## The Owner's six points (2026-10-02) and where each is handled

| # | Point | Handled in |
|---|---|---|
| 1 | Add a description to the quiz | Task B7: the quiz page says what it is, how many questions, that each answer is marked at once and cannot be changed, and the pass rule |
| 2 | Show right or wrong, not "Answer saved" | Tasks B6, B7 |
| 3 | After choosing, another option cannot be chosen | Stays, on purpose: once the right answer is shown, the answer is locked (D71). Decision 1 below |
| 4 | 30 questions, not 10 | Tasks B4–B6: one question per concept |
| 5 | Questions and options that ask accurately | Task B4: 30 questions written under the bank's rules; the table below is every one of them |
| 6 | Question 8 "a bit funny"; validate 4, 5, 7 | Validated below; Part A fixes the cause |

## Validation against the certificate (SIRAPHAT SIAM pack, read page by page)

| Question | Checked against | Result |
|---|---|---|
| 4 — head office address | Certificate item 5 | **Correct** |
| 5 — signing authority | Certificate item 3 | **Correct** |
| 7 — shareholders | Shareholder list (บอจ.5), page 16 | Count correct (2). **Both names on the record are wrong**: the second shareholder's name has two wrong letters; the first is missing its ์ |
| 8 — directors | Certificate item 2 | Count correct (1). The name is missing its ์ |
| 10 — registration number, objectives | Certificate header, item 6 | **Correct** |

**Why the names are wrong.** The record was read before D92, which explains the missing ์. The second shareholder's name is a different problem: the shareholder page has no readable text for the names, so the reader reads them from the picture of the page, and at the size it is given the small print is misread. Measured with the real reader on this page: sent as the app sends it, both names wrong in 5 of 5 readings; sent as a sharp picture, the first name right 5 of 5 and the second 4 of 5.

**One more thing the documents themselves do.** The certificate prints the director's surname without a ์ and the shareholder list prints the same person's surname with one. Read perfectly, the two would not match and the learner's shares would show "—". Part A makes that match ignore marks.

**What the Owner can do today,** before any of this ships: on the company record, correct the director's name and the two shareholder lines by hand from the documents, and save.

## Decisions to confirm with the approval

| # | Decision | Proposed |
|---|---|---|
| 1 | An answer is locked once given, because the correct answer is shown at once (D71). The alternative — change answers freely and see right or wrong only after submitting — cannot be combined with point 2 | Locked, with immediate feedback |
| 2 | Result rule, unchanged from D71: any of the nine critical concepts wrong → Fail; otherwise 27 or more → Pass; 23–26 → Retest; fewer → Fail. Retest and Fail both allow a full new attempt at once; Fail tells the learner to review the study material first | As D71 |
| 3 | I write the 21 missing questions (the table below) in Thai, English and Chinese. They are loaded as drafts; the Owner approves them — one button approves every draft that passes the bank's checks | Bulk approve |
| 4 | The old question pool stays only for the practice round at `/quiz`; the Business Knowledge Quiz never draws from it again. Earlier attempts stay in the history | — |
| 5 | Grandfathering of learners cleared under the old flow (D79) is not built: production holds only test learners | Skip |
| 6 | Part A (reader) ships first, on its own pull request, so the names are right before learners are tested on them | Part A first |

## The 30 questions

Correct option first. "Varied" options are produced by the bank's recipes from the company's own facts, so they are close to the truth; "fixed" options are written text.

| # | Concept | Question (English) | Correct answer | Wrong options |
|---|---|---|---|---|
| 1 | Company name ★ | What is the company's registered name? | the name | the name + "(มหาชน)"; two fixed other names |
| 2 | Registration number ★ | What is the 13-digit registration number? | the number | three numbers one digit apart (existing) |
| 3 | Registration date ★ | When was the company registered? | the date | −1 year, +1 month, −10 days (existing) |
| 4 | Head office location ★ | In which province is the head office? | the province | three other provinces of the same region (existing) |
| 5 | Number of directors ★ | How many directors does the company have? | the count | +1, +2, +3 (existing) |
| 6 | Directors ★ | Who is the company's director, as on the certificate? | the names | "every shareholder"; "the registrar who signed the certificate"; "no director appointed yet" |
| 7 | Signing authority ★ | Who can sign to bind the company? | the wording of item 3 | three fixed other rules (two directors jointly; a shareholder; without the seal). A second variant with other fixed rules covers a company whose own rule is one of these |
| 8 | Registered capital ★ | What is the registered capital? | the amount | ×2, ×0.5, ×10 (existing) |
| 9 | Number of shareholders | How many shareholders are there? | the count | +1, +2, +3 |
| 10 | Your shareholding | How many shares do you hold? | shares and % | varied shares (existing, two wordings) |
| 11 | Main business ★ | What does the company actually do? | the manager's line | three other business categories (existing) |
| 12 | Products or services | What does the company sell? | the manager's line | goods of three other categories |
| 13 | Why established | Why was the company set up? | the standard answer | to hold assets for someone else; to open an account for others to use; no clear purpose |
| 14 | Main customers | Who are the main customers? | the kind of customers | government only; overseas only; none yet (existing, now for every company) |
| 15 | Where customers come from | How does the company find its customers? | the manager's line | does not know; strangers who transfer money in; not thought about |
| 16 | Main suppliers | Who supplies the company? | the manager's line | no supplier; whoever is cheapest that day; does not know |
| 17 | Place of business | Where does the company actually operate? | the office address | a neighbouring district (×2, varied); "no place of business, the accountant's address" |
| 18 | Monthly revenue | About how much does the company take in a month? | the amount | ×3, ×0.5, ×10 |
| 19 | Basis of the revenue figure | What is that figure based on? | the worked-out sentence | a figure the accountant set; a loan to come; a guess |
| 20 | Average transaction | About how much is one sale? | the amount | ×2, ×0.2, ×10 |
| 21 | Transactions per month | About how many sales a month? | the count | ×2, ×0.5, ×10 |
| 22 | Source of start-up funds | Where did the start-up money come from? | the fixed answer | an informal loan; money someone else put in to open the company; does not know |
| 23 | First money into the account | What will the first money into the account be? | the fixed answer | a transfer from someone unknown; a customer's deposit to pass on; does not know |
| 24 | Why a bank account | Why does the company need the account? | the fixed answer | to receive transfers for other people; because someone asked; to hold personal savings |
| 25 | Why PromptPay / QR | Why does the company need PromptPay / QR? | the fixed answer | so others can use it; not needed; to avoid records |
| 26 | Internet banking control | Who controls the company's internet banking? | the director personally | (existing) |
| 27 | OTP control | Who keeps the phone that receives the OTP? | the director personally | the accounting office; whoever helped open the company; anyone who asks |
| 28 | Explaining a transaction | The bank asks about a transfer. What must you do? | explain where it came from and what it was for | say it is confidential; say you do not know; ask someone else to answer |
| 29 | Supporting documents | What should you have for a business payment? | an invoice, receipt or contract | nothing, a transfer is enough; a chat message; papers made afterwards |
| 30 | Consistency | How should your answers compare with the documents? | the same as the registration documents and the real business | whatever sounds best; different each time; whatever the officer suggests |

★ = critical concept (D72). Thai and Chinese texts are written in the task; the Owner approves on the Thai.

## File structure

| File | Responsibility |
|---|---|
| `lib/pdf/render-pages.ts` (new) | A sharp PNG of chosen pages of a PDF |
| `lib/integrations/extraction/claude.ts` | Adds those pictures to the reading |
| `lib/domain/bank-interview.ts` | The director–shareholder name match ignores marks |
| `supabase/migrations/20261006010000_mcq_evaluation.sql` (new) | `retest` result, the rule and the concept kept on the attempt, two settings |
| `lib/domain/mcq/result.ts` (new) | Pass / Retest / Fail |
| `lib/domain/mcq/tokens.ts`, `render.ts` | Three amount placeholders for varied money and count options |
| `lib/content/mcq-starter.ts` | 31 starter variants: every concept |
| `lib/db/mcq-bank.ts`, `app/…/admin/questions/` | Approve every checked draft at once |
| `lib/db/mcq-attempt.ts` (new), `lib/db/exam.ts`, `lib/db/assessment.ts` | Start, answer and submit a 30-concept attempt |
| `app/[locale]/(learner)/exam/` | Description, immediate feedback, the three results |
| `messages/{th,en,zh}.json`, `docs/…` | Wording; decisions; UAT |

---

# Part A — the names are read right

### Task A1: A sharp picture of a page

**Files:** Create `lib/pdf/render-pages.ts`; test `tests/unit/pdf/render-pages.test.ts`; `package.json` (`@napi-rs/canvas` as a direct dependency, the version pdfjs-dist already resolves); `next.config.ts` (`serverExternalPackages` gains `@napi-rs/canvas` and `pdfjs-dist`).

- [ ] **Step 1: Failing test** — renders page 1 of the fixture PDF (`pnpm fixtures:pdf` output) at scale 3 and expects a PNG (signature bytes `89 50 4E 47`) wider than 1500 px; `thinPages` returns the pages whose text layer has fewer than 800 non-space characters.
- [ ] **Step 2: Implement**

```ts
// lib/pdf/render-pages.ts
import 'server-only';
import { createCanvas } from '@napi-rs/canvas';

/** A page whose text layer holds less than this cannot be trusted to carry its own words. */
export const THIN_PAGE_CHARS = 800;
/** Three times the PDF's own size: small Thai print with its marks stays legible. */
export const RENDER_SCALE = 3;
/** A reading never carries more pictures than this. */
export const MAX_PAGE_IMAGES = 8;

async function open(pdf: Uint8Array) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs.getDocument({ data: pdf.slice(), useSystemFonts: false }).promise;
}

/** 1-based numbers of the pages a reader has to read from the picture. */
export async function thinPages(pdf: Uint8Array): Promise<number[]> {
  const doc = await open(pdf);
  const thin: number[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    const chars = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join('')
      .replace(/\s/g, '').length;
    if (chars < THIN_PAGE_CHARS) thin.push(n);
  }
  return thin;
}

/** PNG pictures of the given pages, in order. */
export async function renderPages(pdf: Uint8Array, pages: number[]): Promise<Uint8Array[]> {
  const doc = await open(pdf);
  const out: Uint8Array[] = [];
  for (const n of pages) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({
      canvasContext: canvas.getContext('2d') as never,
      viewport,
      canvas: canvas as never,
    }).promise;
    out.push(new Uint8Array(canvas.toBuffer('image/png')));
  }
  return out;
}
```

- [ ] **Step 3:** `pnpm test:unit tests/unit/pdf` passes. Commit `feat(reading): sharp pictures of pages a reader cannot read as text`.

### Task A2: The reader gets the pictures

**Files:** `lib/integrations/extraction/claude.ts`, `lib/integrations/extraction/schema.ts`; test `tests/unit/integrations/extraction-images.test.ts`.

- [ ] **Step 1: Failing test** — with a stub client, `extract([pdf])` for a PDF with one thin page sends, after the document block, a text block `Page N of document 1, as a sharp picture:` and an image block; a PDF with no thin page sends none; never more than `MAX_PAGE_IMAGES`.
- [ ] **Step 2: Implement** — in `extract`, after each document block: `const thin = (await thinPages(pdf)).slice(0, budget)`, `renderPages(pdf, thin)`, one labelled image block per page. A rendering failure is logged and the reading goes on without pictures. `EXTRACTION_INSTRUCTIONS` gains: "Where a page is also given as a sharp picture, read names, numbers and addresses on that page from the picture."
- [ ] **Step 3: Check with the real reader** (throwaway test, key from the main checkout, never committed): five full readings of the SIRAPHAT pack; both shareholder names equal the printed ones in at least 4 of 5, the director's name in 5 of 5. Record the counts in the commit message. If the counts are not met, stop and report.
- [ ] **Step 4:** `/api/health` gains `pdfRender: 'ok' | 'failed'` from rendering a one-page PDF built with pdf-lib, so the Vercel preview shows the native module loads there.
- [ ] **Step 5:** Commit `feat(reading): pages without readable text are read from a sharp picture`.

### Task A3: The same person under two spellings

**Files:** `lib/domain/bank-interview.ts`; tests `tests/unit/domain/bank-interview.test.ts`.

- [ ] **Step 1: Failing test**

```ts
it('finds the learner on the shareholder list when the documents differ by a mark (D96)', () => {
  const business = {
    ...EMPTY_BUSINESS_PROFILE,
    shareholders: [
      { name: 'นางสาวตัวอย่าง จันท์ทอง', nationality: 'ไทย', shares: 18000, percent: null },
      { name: 'นายสมชาย ใจดี', nationality: 'ไทย', shares: 2000, percent: null },
    ],
    share_structure: { ...EMPTY_BUSINESS_PROFILE.share_structure, total_shares: 20000 },
  };
  // The certificate prints the surname without the mark the shareholder list prints.
  expect(isShareholder(business, 'นางสาวตัวอย่าง จันททอง')).toBe(true);
  expect(myShareholding(business, 'นางสาวตัวอย่าง จันททอง')).toEqual({ shares: 18000, percent: 90 });
  // A different person is still a different person.
  expect(isShareholder(business, 'นางสาวตัวอย่าง จันทร์ทอง')).toBe(false);
});
```

- [ ] **Step 2: Implement** — one helper used by both functions:

```ts
/** The holder a name refers to: the same name, or the only one that differs from it by marks. */
function holderNamed<T extends { name: string }>(holders: readonly T[], name: string): T | null {
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  const exact = holders.find((h) => norm(h.name) === norm(name));
  if (exact) return exact;
  const near = holders.filter(
    (h) => lostOnlyMarks(norm(h.name), norm(name)) || lostOnlyMarks(norm(name), norm(h.name)),
  );
  return near.length === 1 ? near[0] : null;
}
```

- [ ] **Step 3:** unit tests pass. Commit `fix(role): a name that differs from the shareholder list only by a mark is the same person (D96)`.

### Task A4: Gate, docs, report

- [ ] D96 in the decisions log; runbook row "a name on a record is wrong although the document prints it clearly → correct it by hand, or delete the record and upload the pack again; a re-read replaces only values that lost marks".
- [ ] Full gate: format, lint, typecheck, unit, `db:reset` + integration, build, secrets, e2e as `--shard=1/2` and `--shard=2/2`.
- [ ] Report; push and PR on the Owner's word. On the Vercel preview, `/api/health` must show `pdfRender: ok` before the merge.

---

# Part B — the Business Knowledge Quiz

### Task B1: Migration

**Files:** Create `supabase/migrations/20261006010000_mcq_evaluation.sql`; `pnpm db:types`.

```sql
-- P17e: the Business Knowledge Quiz (spec 2026-09-30 §8, D71, D72).

-- 1. A third result.
alter table public.assessment_attempts
  drop constraint assessment_attempts_result_check,
  add constraint assessment_attempts_result_check
    check (result = any (array['pass'::text, 'retest'::text, 'fail'::text]));

-- 2. The rule an attempt was judged by, frozen when it starts (thresholds and critical concepts).
alter table public.assessment_attempts add column rule_snapshot jsonb;
comment on column public.assessment_attempts.rule_snapshot is
  'P17e: {"passScore": 27, "retestScore": 23, "criticalKeys": [...]}; null on earlier attempts.';

-- 3. The concept each answer row stands for; null on earlier attempts.
alter table public.assessment_answers add column concept_key text;

-- 4. The thresholds, as settings the Owner can see (D71).
insert into public.policy_config (key, value) values
  ('mcq_pass_score', '27'::jsonb),
  ('mcq_retest_score', '23'::jsonb)
on conflict (key) do nothing;
```

- [ ] Apply with `pnpm db:reset`, regenerate types, add both keys to `lib/config/policy-defaults.ts` and `policy-schema.ts` (integers 1–30, `mcq_retest_score` ≤ `mcq_pass_score`), commit `feat(db): the quiz result has three outcomes and remembers its rule`.

### Task B2: The result rule

**Files:** Create `lib/domain/mcq/result.ts`; test `tests/unit/domain/mcq/result.test.ts`.

```ts
// lib/domain/mcq/result.ts
import { CRITICAL_CONCEPT_KEYS } from '@/lib/domain/concepts/registry';

export type McqResult = 'pass' | 'retest' | 'fail';
/** What an attempt is judged by, frozen on it when it starts (D71). */
export type McqRule = { passScore: number; retestScore: number; criticalKeys: string[] };
export type McqAnswer = { conceptKey: string; isCorrect: boolean };

export function mcqRule(passScore: number, retestScore: number): McqRule {
  return { passScore, retestScore, criticalKeys: [...CRITICAL_CONCEPT_KEYS] };
}

/** Any critical concept wrong → fail; else the score against the two thresholds (D71). */
export function mcqResult(
  answers: readonly McqAnswer[],
  rule: McqRule,
): { result: McqResult; score: number; criticalWrong: string[] } {
  const score = answers.filter((a) => a.isCorrect).length;
  const criticalWrong = answers
    .filter((a) => !a.isCorrect && rule.criticalKeys.includes(a.conceptKey))
    .map((a) => a.conceptKey);
  const result: McqResult =
    criticalWrong.length > 0
      ? 'fail'
      : score >= rule.passScore
        ? 'pass'
        : score >= rule.retestScore
          ? 'retest'
          : 'fail';
  return { result, score, criticalWrong };
}
```

Tests: 30 right → pass; 27 right, none critical wrong → pass; 26 → retest; 23 → retest; 22 → fail; 29 right with the one wrong critical → fail and `criticalWrong` names it; the rule lists exactly the nine keys of D72. Commit `feat(quiz): pass, retest or fail by the Owner's rule (D71)`.

### Task B3: Amount placeholders

**Files:** `lib/domain/mcq/tokens.ts`, `lib/domain/mcq/render.ts`; tests `tests/unit/domain/mcq/render.test.ts`.

- [ ] `TOKENS` gains `monthly_revenue_amount` (`money`, facts `['monthly_revenue']`), `average_transaction_amount` (`money`, `['average_transaction']`), `monthly_transactions_count` (`number`, `['monthly_transactions']`). `numberOf` reads each with `firstAmount` (`lib/domain/standard-answers.ts`) from the fact's text; no digits → the placeholder has no value and the variant yields, as any missing fact does.
- [ ] Tests: `{monthly_revenue_amount}` renders `300,000 บาท` from "ประมาณ 300,000 บาท"; `{monthly_revenue_amount|numeric(x3)}` renders `900,000 บาท`; a revenue written in words fails with `missing_fact`. Commit `feat(bank): amounts a manager typed can be varied`.

### Task B4: A question for every concept

**Files:** `lib/content/mcq-starter.ts`; tests `tests/unit/domain/mcq/starter.test.ts`.

- [ ] Write the 21 missing starter variants and the second signing-authority variant exactly as the table above, in Thai, English and Chinese, each with an explanation that states the correct answer and where it comes from. `mcq-main-clients-1` keeps its wording.
- [ ] Tests (replace the count test): every MCQ concept has at least one starter; `learner_shareholding` has both wordings; every starter validates with no issue and passes preflight for the sample company in all three languages; no two starters share a key; the Thai prompt of no starter contains "(s)" or a placeholder for a fact outside its concept except the company name.
- [ ] Commit `feat(bank): a starter question for each of the 30 concepts`.

### Task B5: Approve every checked draft

**Files:** `lib/db/mcq-bank.ts` (`approveCheckedDrafts`), `app/[locale]/(admin)/admin/questions/bank-actions.ts`, `bank-forms.tsx`, `page.tsx`, messages; tests `tests/integration/mcq-bank.test.ts`, `tests/e2e/mcq-bank.spec.ts`.

- [ ] `approveCheckedDrafts(db)`: for each draft variant with Thai text and no validation issue, `setVariantStatus(db, id, 'approved')` under the Owner's own client (so the audit names them); returns `{ approved, skipped }`. Owner only.
- [ ] The bank page shows *Approve N checked drafts* beside *Add starter drafts*, with a confirm step naming the count; after it, the page's readiness line reads "30 of 30 concepts ready".
- [ ] Integration: a manager is refused; a draft with an issue is skipped; the audit rows name the Owner. E2E: load starters, approve all, every concept shows covered.
- [ ] Commit `feat(bank): the Owner approves every checked draft at once`.

### Task B6: The attempt

**Files:** Create `lib/db/mcq-attempt.ts`; modify `lib/db/exam.ts` (`startExam`, `finalizeExam`), `lib/db/assessment.ts` (`answerQuestion`, `localizeAttemptAnswers` for variant rows); tests `tests/integration/mcq-attempt.test.ts`.

- [ ] `startMcqAttempt({ userId, language })`:
  1. the pinned facts (`pinnedFactsFor`) and their render context (`contextForRecord`);
  2. the approved variants (`listVariants`), unseen ones first: a variant the learner's earlier attempts already used sorts after the others of its concept;
  3. for each of `MCQ_CONCEPTS`, `pickVariant` with seed `${userId}:mcq:${now}`; a concept with none → raise a `render_failure` exception on the record (kind exists since P17c) and throw `AssessmentError('not_ready')`;
  4. question order and option order shuffled from the seed (`shuffleOptions`), then one `assessment_attempts` row (`kind: 'exam'`, `rule_snapshot: mcqRule(pass, retest)`, pinned version and role as today) and 30 `assessment_answers` rows carrying `concept_key`, the rendered prompt and options in the attempt's language.
- [ ] `answerQuestion`: for a row with `concept_key`, the correct key is the variant's `correct_option_key` and the explanation is the variant's explanation rendered with the same seed; "already answered" is refused as today. Returns the feedback.
- [ ] `localizeAttemptAnswers`: a row with `concept_key` is rendered again in the page's language from the same seed (the bank guarantees the same draws in every language).
- [ ] `finalizeExam`: for an attempt with `rule_snapshot`, `mcqResult(answers, rule)` → `result`, `score`, `max_score`.
- [ ] Integration tests: 30 rows in a fresh attempt, one per concept, each with four distinct options; answering twice is refused; all right → pass; one critical wrong with 29 right → fail; 25 right → retest; a bank missing one concept → `not_ready` and one open `render_failure` exception; a second attempt prefers a variant not used in the first.
- [ ] Commit `feat(quiz): an attempt asks one question for each of the 30 concepts`.

### Task B7: The learner's pages

**Files:** `app/[locale]/(learner)/exam/page.tsx`, `actions.ts`, `[attemptId]/page.tsx`, `[attemptId]/result/page.tsx`; `messages/{th,en,zh}.json`.

No new component is needed: the question card already draws right, wrong and the explanation for the practice round. The 21st.dev MCP server is not signed in on this machine.

- [ ] **Description (point 1)** on the quiz page, above Start, as a short list: 30 questions, one for each thing the bank asks about your company; each answer is marked at once and cannot be changed; pass with 27 or more and none of the nine key facts wrong; 23–26 means take it again; below that, review the study material and take it again. Three languages.
- [ ] **Feedback (point 2):** `answerExamAction` returns the feedback for an attempt with a rule; the attempt page passes `instantFeedback` and `revealed` for answered questions, as the practice round does. Earlier attempts without a rule keep "Answer saved".
- [ ] **Result:** Pass / Retest / Fail with the score, and on a fail caused by a critical concept, which ones; a *Take it again* button on Retest and Fail, and *Study material* first on Fail. The review of every question stays (D51).
- [ ] `not_ready` on Start: "The quiz is not ready for your company yet. Your manager has been told."
- [ ] Screenshots of the quiz page, an answered question (right and wrong), and each result, to the Owner.
- [ ] Commit `feat(learner): the quiz says what it is, marks each answer and ends in pass, retest or fail`.

### Task B8: Staff views and settings

- [ ] Learner Record: the quiz column shows Pass / Retest / Fail; history lists the three results.
- [ ] Settings: `mcq_pass_score`, `mcq_retest_score` shown with labels in three languages; `exam_question_count` and `exam_passing_mark_percent` leave the screen (the practice round keeps `quiz_question_count`).
- [ ] Commit `feat(staff): the quiz's three results and its two thresholds`.

### Task B9: End-to-end

- [ ] `tests/e2e/exam.spec.ts` rewritten: the Owner loads and approves the starters; a learner with a complete company starts the quiz, sees the description, answers a question right (green, explanation hidden) and one wrong (red, correct answer and explanation shown), cannot change either, answers the rest, submits and sees the result; the interview opens only after a pass.
- [ ] Specs that seeded old exam questions for a pass (`interview`, `appointment`, `learner-record`, `learner-dashboard`, `exam-result-design`) use a seed helper `seedMcqPass(learner)`.
- [ ] Commit `test(e2e): the Business Knowledge Quiz from start to result`.

### Task B10: Docs, gate, report

- [ ] D97 in the decisions log; P17 spec §8 marked implemented with the two simplifications (no review-required flag: the result page is the review; no grandfathering); UAT A20; runbook row "the quiz says it is not ready".
- [ ] Full gate as in A4. Report the six items; the migration needs a production push on the Owner's word; push, PR and merge on the Owner's word.

## Self-review

- **Each of the six points has a task** (table at the top). Point 3 is a decision, not a change.
- **Names agree across tasks:** `thinPages`, `renderPages`, `holderNamed`, `mcqRule`, `mcqResult`, `startMcqAttempt`, `approveCheckedDrafts`, `rule_snapshot`, `concept_key`.
- **Known limits:** packs over 20 pages are read in the background and do not get pictures yet; standard answers and questions are approved on their Thai text; the practice round keeps the old pool until P17i.
