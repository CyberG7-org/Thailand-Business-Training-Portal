# UAT script — pilot acceptance

Run on the staging deployment with real provider keys. One admin tester and two learner testers (one Thai-first, one Chinese-first). Record pass/fail and notes per line. PRD references are to `Thailand_Business_Training_Portal_PRD_v1.0`.

## A. Admin

| # | Scenario | Steps | Pass criteria | PRD |
|---|---|---|---|---|
| A1 | Provision a learner | Admin → Users → New: login id, temporary password, display name, **company** (a confirmed DBD record) | Learner can log in with those credentials and sees that company; wrong password shows the generic error; unconfirmed records are listed but cannot be chosen | AUTH, ASSIGN |
| A2 | Import a DBD pack | Admin → DBD records → New → upload the PDFs (several at once) → wait for "reading in the background" to finish (1–3 min, reload) | Fields fill with confidence/page notes; unmatched fields stay empty (never invented); lists appear in the business profile; admin edits and confirms | DBD-001..004 |
| A3 | Issue date & eligibility | Check the "Issued on" date reads as printed (e.g. 5 สิงหาคม 2569); edit it in any printed form; save | The date stays in Thai (พ.ศ.); after assignment the learner's bank date = issued + 45 days (Thai calendar text) | BR-002/003 |
| A4 | Reassign company | Admin → Users → learner → Deactivate, then assign another confirmed record | Learner dashboard shows the new company; the old assignment is deactivated | ASSIGN |
| A5 | Study content | Create a card in TH/EN/ZH, upload a PDF, enable Thai TTS | Learner sees the card in each language; read-aloud plays Thai audio | STUDY |
| A6 | Question bank | Create a personalized question with `{company_name_th}`; approve after all three languages exist | Approval blocked until TH/EN/ZH present; learner sees the company name substituted | QUIZ/EXAM |
| A7 | Policy settings | Change passing mark, counts, exam-pass gates; add Telegram chat ids and emails | Saved with validation errors on bad input; Audit log shows the change with the admin's login id | CONFIG |
| A8 | Notifications | After a learner's exam, open Admin → Notifications | Telegram and email rows `sent`; a failed row can be requeued | NOTIF |
| A9 | Interview review | After a learner's interview, open Admin → Readiness interviews → session | Status `completed` with the verdict; the officer's Thai narrative and each answer's assessment readable; the transcript in Thai | INTERVIEW |
| A10 | Access control | As a learner, open `/admin`, `/admin/users`, another learner's attempt URL | Redirected to dashboard / 404 | SEC |

## B. Learner

| # | Scenario | Steps | Pass criteria | PRD |
|---|---|---|---|---|
| B1 | First login & language | Log in; switch TH → EN → ZH; log out and in again | UI fully translated; the chosen language persists across sessions | I18N |
| B2 | Dashboard | Observe stage cards | Study/Quiz/Exam available; Name card per policy; Interview shows "locked: exam required" (default); Appointment shows "locked: interview required" | DASH |
| B3 | Study | Open each card; play Thai read-aloud; open the PDF | Progress recorded (card marked viewed/completed per policy) | STUDY |
| B4 | Quiz | Start; answer; leave mid-way; come back; finish; review | Instant feedback per question; resume works; review shows wrong answers with correct ones | QUIZ |
| B5 | Exam | Start; answer all; submit | No feedback during the exam; result page shows score and pass/fail without revealing correct answers | EXAM |
| B6 | Retake rules | Retake after fail / after pass, per policy | Attempt limits and wait time enforced as configured | EXAM |
| B7 | Name card | Enter mobile number; generate; preview; download; send to Telegram | Thai PDF with company facts; phone formatted 08X-XXX-XXXX; admin Telegram receives the PDF | CARD |
| B8 | Appointment gating | After a ready interview, before the +45-day date | Appointment locked with "bookable from" and the Thai date; the interview itself opens on exam pass whatever the date (test by setting the policy days on staging) | BR-003/004 |
| B9 | Readiness interview | Start the interview; answer the officer in Thai — first evade ("ไม่ทราบ") three times, then start again and answer from the certificate | The officer never states a company fact; the evasions end "not yet ready" with the reasons and the correct values in the debrief; the retry ends "ready"; the dashboard marks the interview done and the appointment follows the date | INTERVIEW |
| B10 | Isolation | Try another learner's quiz/exam/interview URLs | 404 | SEC |

## C. Thai QA (language reviewer)

| # | Check | Pass criteria |
|---|---|---|
| C1 | UI Thai copy (`messages/th.json`) | Natural, polite register; no untranslated keys; dates in Thai format |
| C2 | Name card | Thai text renders with Sarabun, correct line breaks (no broken clusters), Thai company name and address correct |
| C3 | Read-aloud | Pronunciation acceptable for the study cards; numbers and abbreviations read sensibly |
| C4 | Officer persona | The AI officer's Thai is formal and polite, one question at a time, never reveals a fact, presses on vague answers — reviewed on a real session's transcript on staging |
| C5 | Chinese (Simplified) copy | Reviewed by a native reader; terminology consistent with the Thai source |

## Sign-off

| Role | Name | Date | Result |
|---|---|---|---|
| Product owner | | | |
| Thai QA | | | |
| Learner tester 1 | | | |
| Learner tester 2 | | | |
