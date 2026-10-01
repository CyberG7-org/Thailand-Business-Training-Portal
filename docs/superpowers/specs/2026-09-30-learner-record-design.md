# Learner Record (D82) — design

|          |                                                                                        |
| -------- | -------------------------------------------------------------------------------------- |
| Status   | Approved by the Owner 2026-09-30; implemented on `feat/learner-record`                  |
| Replaces | The Learners list of D80 (Login ID, name, company, team, role, status, progression, appointment) and the staff Back/Home pills of D68 |
| Decision | D82                                                                                    |

## 1. What the Owner asked for

The staff Learners page becomes **Learner Record**: one row per learner, with

| Column | Shows | Click |
| --- | --- | --- |
| Login ID | the code (T-G4-L8) | the learner's account page (suspend, password, contact, company, role) — kept a link at the Owner's choice |
| Company name | the active assignment's company | its DBD record page |
| DBD issued date | as printed (พ.ศ. in Thai) | — |
| MCQ | Pass / Fail | the learner's MCQ history |
| Chatbot | Pass / Fail (In progress while a first session is open) | the learner's Chatbot history |
| Appointment | the next booked date and time | — |

and no Back or Home buttons on any staff page.

## 2. MCQ and Chatbot before P17

P17's two evaluations (spec `2026-09-30-p17-evaluation-architecture-design.md`) are not built. Until they
ship, the columns read today's data — the Owner's choice:

- **MCQ = the exam.** Pass or Fail by the policy `exam_pass_rule` (`any`: one pass is enough;
  `latest`: the most recent submitted attempt decides); "—" before any submitted attempt.
- **Chatbot = the readiness interview.** Pass once any session ended *ready* (one-way, D64); Fail
  when sessions ended and none was ready; In progress while one is open and none has ended.

When P17's MCQ and chatbot evaluations ship, the same columns and history pages switch to them.

## 3. Pages

- `/admin/learners` — the table (learners only; staff accounts are not listed).
- `/admin/learners/<id>/mcq` — every exam attempt, newest first: attempt number, date and time
  (Bangkok), result, score, **Review**.
- `/admin/learners/<id>/mcq/<attempt>` — the full review: every question, its options, the correct
  one marked and the learner's pick struck through when wrong, with the explanation — the review
  the learner sees (D51, `components/answer-review.tsx`).
- `/admin/learners/<id>/chatbot` — every interview session, newest first: number (by start), date
  and time, Pass / Fail / In progress / Abandoned, **Conversation**.
- `/admin/learners/<id>/chatbot/<session>` — the verdict, the officer's narrative, every assessment
  and the whole conversation: the Readiness interviews view, extracted to
  `app/[locale]/(admin)/admin/interviews/session-view.tsx` and shared by both routes.

Each history page names the learner and their company and links back one level.

## 4. Data and security

- `lib/domain/learner-record.ts` holds the rules (pure, unit-tested); `lib/db/learner-record.ts`
  the reads.
- Every read runs under the caller's client, so RLS narrows it to the caller's team (all teams for
  the Owner). A foreign attempt or session put under a learner's address is a 404 (the attempt's
  and session's `user_id` must match the learner in the URL). The review's question texts are
  read from the bank after that RLS-backed read, as on the learner's own result page.
- The table reads each list in full, 1,000 rows a page (`allRows`), ordered on a unique column; it
  never lists ids in a URL (the "URI too long" failure of D80's fix).

## 5. Out of scope

- A separate account-page design (the Login ID keeps linking to today's page).
- Any change to how the exam or the interview are taken.
- P17's evaluations themselves.
