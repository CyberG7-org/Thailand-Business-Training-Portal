# UAT script — pilot acceptance

Run on the staging deployment with real provider keys. One admin tester and two learner testers (one Thai-first, one Chinese-first). Record pass/fail and notes per line. PRD references are to `Thailand_Business_Training_Portal_PRD_v1.0`.

## A. Admin

| # | Scenario | Steps | Pass criteria | PRD |
|---|---|---|---|---|
| A1 | Provision a learner | Admin → Managers → New: keep the suggested code after `T-` or type one — one letter and two digits, e.g. `A12` (D85). Then Admin → Create learner & DBD → **Create learner**: pick that team, keep or type the code after `T-A12-` — two letters and two digits, e.g. `LA08` (D84), temporary password, name, **company** (a confirmed DBD record) | The manager signs in as T-A12 and the learner as T-A12-LA08 (either case); the learner sees that company; wrong password shows the generic error; unconfirmed records are listed but cannot be chosen | AUTH, ASSIGN |
| A1b | A taken code | Type a code that already exists (another manager's, or a learner's in the same team, in any case), then press Create anyway | The field says "already taken" as it is typed; Create is refused with the same words and nobody is created; ↻ offers a free code | AUTH |
| A2 | Import a DBD pack | Admin (or a manager) → Create learner & DBD → **Create DBD**: choose the PDFs (several at once), fill company email, company phone, what the business does and what it sells → **Create and analyse**; watch the companies list below (reading takes 1–3 min, reload) | Fields fill with confidence/page notes; unmatched fields stay empty (never invented); lists appear in the business profile; admin edits and confirms | DBD-001..004 |
| A2b | Automatic confirmation | Upload a clean pack with the four details as in A2; then upload a pack whose issue date cannot be read | The clean one shows **Confirmed automatically** in the list and on its page, and can be chosen for a learner at once; the other stays **Needs attention** until someone fills the gap and presses Confirm | DBD-004 |
| A2c | Learner contact details | Create a learner with a phone, email, website and Facebook page name; open them from **Learner Record** (their Login ID) | Phone and email are required (a landline or a bad email is refused, named in red); website and Facebook are optional and stored as full addresses; the manager can change them on the learner's page; the learner's name card starts with that phone | AUTH |
| A3 | Issue date & eligibility | Check the "Issued on" date reads as printed (e.g. 5 สิงหาคม 2569); edit it in any printed form; save | The date stays in Thai (พ.ศ.); after assignment the learner's bank date = issued + 45 days (Thai calendar text) | BR-002/003 |
| A4 | Reassign company | Admin → Learner Record → learner's Login ID → Deactivate, then assign another confirmed record | Learner dashboard shows the new company; the old assignment is deactivated | ASSIGN |
| A5 | Study content | Sign in as a learner of a confirmed company and open Study (staff no longer edit cards, D81; a fresh environment runs `pnpm content:starter` once) | The five bank-interview cards show in each language with the learner's own company facts filled in; the staff sidebar has no Study content entry | STUDY |
| A6 | Question bank | Create a personalized question with `{company_name_th}`; approve after all three languages exist | Approval blocked until TH/EN/ZH present; learner sees the company name substituted | QUIZ/EXAM |
| A7 | Policy settings | Change passing mark, counts, exam-pass gates; add Telegram chat ids and emails | Saved with validation errors on bad input; the change is recorded with the admin's login id (no audit screen, D81 — check `audit_logs_with_actor` with SQL) | CONFIG |
| A8 | Notifications | After a learner's exam, open Admin → Notifications | Telegram and email rows `sent`; a failed row can be requeued | NOTIF |
| A9 | Interview review | After a learner's interview, open Admin → Readiness interviews → session | Status `completed` with the verdict; the officer's Thai narrative and each answer's assessment readable; the transcript in Thai | INTERVIEW |
| A10 | Access control | As a learner, open `/admin`, `/admin/users`, another learner's attempt URL | Redirected to dashboard / 404 | SEC |
| A11 | Staff sidebar | Sign in as the admin, then as a manager; open the admin home and a few sections on a laptop and on a phone | The sidebar lists Team / Content / Learners / System with the current section marked; a manager sees no Managers, Notifications or Settings; on a phone the sidebar is one strip that scrolls sideways and no page scrolls sideways as a whole; tables scroll inside their card | UI |
| A12b | Learner Record | Admin (then a manager) → **Learner Record**; for a learner who took the exam twice and the interview twice, click Company, then MCQ, then an attempt's **Review**, then Chatbot and a session's conversation | Columns: Login ID, Company name, DBD issued date, MCQ, Chatbot, Appointment; MCQ and Chatbot read Pass / Fail as the exam rule and the interview verdicts say; Company opens its DBD record; MCQ history lists every attempt with date, result and score, and Review shows every question with the correct answer and the learner's pick; Chatbot history lists every session and opens the whole conversation; a manager sees only their team | UI |
| A12 | Staff forms and pages | Create a learner, edit a DBD record, change a policy setting, open an interview session and the appointments day list | Inputs are solid white and comfortable to tap; primary buttons are navy; errors read in red, success in green; no Back or Home buttons on any staff page (D82): the sidebar reaches every section and each detail page links back to its list | UI |
| A13 | Address and category | Create a record with a real printed address (e.g. เลขที่ 87 หมู่ที่ 9 ตำบลหนองใหญ่ อำเภอโพนทอง จังหวัดร้อยเอ็ด) and write what the business does and sells; then set "Does it already have customers?" to No | The address panel shows the house number, subdistrict, district and province (D89); the category is chosen automatically — the best match, with its confidence (D90) — or a person picks one; the readiness panel counts 29 / 12 company-level concepts and names what is still missing; the customer questions relabel to the "expected" wording at once | DBD-001..004 |
| A14 | Training versions | Open a confirmed record, note *Version n — active*; change an answer and save; open one of its learners | The record shows the next version active and "1 learner on an older version"; the learner page still says the old version and offers *Move to version n*; the move is refused while that learner has a quiz open, and succeeds after; *Confirm role* turns 29/12 into 30/13 | DBD-001..004 |
| A15 | Validation and exceptions | Create a record with a wrong check digit and the four answers; then fix the number; then open Admin → Exceptions | The record lists *Invalid — registration number* under *Blocking acceptance* and stays unaccepted; after the fix it is accepted at once and lists what still blocks the version; the queue shows the open exceptions of your companies only | DBD-001..004 |
| A16 | The MCQ bank | Admin → Question bank → *Add starter drafts*; open *Registered capital* and its variant; choose a real company in *Preview*; *Approve*; change the Thai question and save; open *Check a company* for that company; sign in as a manager | The preview shows the company’s own capital first and three different wrong amounts, the same in Thai, English and Chinese; *Approve* turns the status to Approved and the changed question returns it to Draft; *Check a company* lists thirty concepts with the approved ones marked *can be asked*; the manager has no Question bank in the sidebar and its address sends them home | — |
| A17 | Level 4 asks five questions | Create a company with its pack and the four details; open *Bank interview*; write the five answers with the two amounts in digits and save; then write one amount in words only ("สามแสนบาท") and save | Before anything is typed, *Filled automatically* already shows the place of business (the office address), why the company was established, the source of funds, the first money and the two account answers; after the five answers it also shows main customers (the kind of customers) and the transactions per month, and the record counts 29 and 10 and gets its version with nobody confirming; with the amount in words the record lists *Transactions per month* as missing and nothing else; no company-status question appears anywhere; a learner with a confirmed role counts 30 and 11 | DBD-001..004 |
| A18 | Thai marks survive the reading | Upload a real certificate whose address has หมู่ and a name with a low mark (วังใหญ่); on a record read before 2026-10-02, press *Read the document again* | The address panel says *Resolved to the subdistrict*; the head office address, the objectives and the shareholder list read ผู้ถือหุ้น, หมู่, ใหญ่ with their marks; on the older record the same words get their marks back and nothing typed by a person changes | DBD-001..004 |
| A19 | The learner’s role needs no typing | Assign a learner to a company with one director; open the learner’s page; sign in as the learner and open study cards 2/5 and 4/5; then do the same with a company that has two directors | The role box already shows the director’s name (“filled in automatically”) and, read-only, กรรมการ / ดูแลการดำเนินงานของบริษัท / เพื่อน; the learner’s cards show the name, the position, the responsibilities, the relationship and the shares with their percentage; with two directors the name waits for a manager to pick one from the list, and a name that is not in the documents cannot be saved | — |

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
| B11 | Appointment booking | After a ready interview and past the date, open Appointment; pick a free slot two weeks out | The slot books; the dashboard shows the date, time and the manager's name; the manager's Bank appointments page lists it under the day with the company | APPT |
| B12 | One learner per slot | A teammate opens the same week | The taken slot shows as taken and cannot be pressed; after the first learner cancels, it is free again | APPT |
| B13 | Blocks and holidays | The manager blocks an afternoon; the admin checks the holiday list in Settings | Blocked hours and bank holidays show as unavailable; the 2026 list matches the Bank of Thailand announcement and next year is added each December | APPT |

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
