# UAT script — pilot acceptance

Run on the staging deployment with real provider keys. One admin tester and two learner testers (one Thai-first, one Chinese-first). Record pass/fail and notes per line. PRD references are to `Thailand_Business_Training_Portal_PRD_v1.0`.

## A. Admin

| # | Scenario | Steps | Pass criteria | PRD |
|---|---|---|---|---|
| A1 | Provision a learner | Admin → Users → New: login id, display name, language, temporary password | Learner can log in with those credentials; wrong password shows the generic error | AUTH |
| A2 | Import a DBD certificate | Admin → DBD records → New → upload PDF → Extract | Suggestions appear with confidence; unmatched fields are empty (never invented); admin edits and confirms | DBD-001..004 |
| A3 | Issue date & eligibility | Enter the certificate "Issued on" date in BE; save | Stored CE date shown; after assignment the learner's bank date = issued + 45 days (Thai calendar text) | BR-002/003 |
| A4 | Assign company | Admin → Users → learner → Assign record | Learner dashboard shows the company; reassigning deactivates the old assignment | ASSIGN |
| A5 | Study content | Create a card in TH/EN/ZH, upload a PDF, enable Thai TTS | Learner sees the card in each language; read-aloud plays Thai audio | STUDY |
| A6 | Question bank | Create a personalized question with `{company_name_th}`; approve after all three languages exist | Approval blocked until TH/EN/ZH present; learner sees the company name substituted | QUIZ/EXAM |
| A7 | Policy settings | Change passing mark, counts, exam-pass gates; add Telegram chat ids and emails | Saved with validation errors on bad input; Audit log shows the change with the admin's login id | CONFIG |
| A8 | Notifications | After a learner's exam, open Admin → Notifications | Telegram and email rows `sent`; a failed row can be requeued | NOTIF |
| A9 | Call review | After a learner's call, open Admin → Call training → session | Status `completed`, recording plays, Thai transcript readable | CALL |
| A10 | Access control | As a learner, open `/admin`, `/admin/users`, another learner's attempt URL | Redirected to dashboard / 404 | SEC |

## B. Learner

| # | Scenario | Steps | Pass criteria | PRD |
|---|---|---|---|---|
| B1 | First login & language | Log in; switch TH → EN → ZH; log out and in again | UI fully translated; the chosen language persists across sessions | I18N |
| B2 | Dashboard | Observe stage cards | Study/Quiz/Exam available; Name card per policy; Bank shows "locked: exam required" (default) and the unlock date | DASH |
| B3 | Study | Open each card; play Thai read-aloud; open the PDF | Progress recorded (card marked viewed/completed per policy) | STUDY |
| B4 | Quiz | Start; answer; leave mid-way; come back; finish; review | Instant feedback per question; resume works; review shows wrong answers with correct ones | QUIZ |
| B5 | Exam | Start; answer all; submit | No feedback during the exam; result page shows score and pass/fail without revealing correct answers | EXAM |
| B6 | Retake rules | Retake after fail / after pass, per policy | Attempt limits and wait time enforced as configured | EXAM |
| B7 | Name card | Enter mobile number; generate; preview; download; send to Telegram | Thai PDF with company facts; phone formatted 08X-XXX-XXXX; admin Telegram receives the PDF | CARD |
| B8 | Bank stage gating | Before the +45-day date and/or before passing the exam | Stage locked with the correct reason; opens automatically on the date (test by setting the policy days on staging) | BR-003/004 |
| B9 | Bank call | Start call; allow microphone; answer the officer in Thai; hang up | Thai voice understandable, latency acceptable (< 2 s turn-taking), session appears in history as completed | CALL |
| B10 | Isolation | Try another learner's quiz/exam/call URLs | 404 | SEC |

## C. Thai QA (language reviewer)

| # | Check | Pass criteria |
|---|---|---|
| C1 | UI Thai copy (`messages/th.json`) | Natural, polite register; no untranslated keys; dates in Thai format |
| C2 | Name card | Thai text renders with Sarabun, correct line breaks (no broken clusters), Thai company name and address correct |
| C3 | Read-aloud | Pronunciation acceptable for the study cards; numbers and abbreviations read sensibly |
| C4 | Bank-officer script | Owner-approved script loaded (not the placeholder); tone matches a real bank KYC call |
| C5 | Chinese (Simplified) copy | Reviewed by a native reader; terminology consistent with the Thai source |

## Sign-off

| Role | Name | Date | Result |
|---|---|---|---|
| Product owner | | | |
| Thai QA | | | |
| Learner tester 1 | | | |
| Learner tester 2 | | | |
