# Bank readiness interview and appointments (P16) — design

|            |                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| Status     | Approved 2026-09-28. P16a (the six steps and the readiness interview) and P16b (appointments) implemented |
| Date       | 2026-09-28                                                                                                               |
| Supersedes | PRD §5.9 "Bank Verification Call Training" (the Vapi voice call) and the `bank` stage of the foundation spec §6          |
| Reference  | The owner's Telegram transcripts of an AI bank assessor (`../Telegram Bot/6–16.png`): the behaviour to recreate, in chat |
| Decisions  | D64 (the interview), D65 (the six steps), D67 (the appointment calendar) |

## 1. Why

The last step of the curriculum was a simulated phone call with a voice assistant. It never went
live (no provider keys), and it rehearsed the wrong thing: a real bank verification is a
conversation in which an officer checks that the director in front of them actually knows their
own company, and probes when the answers are vague. The owner's reference transcripts show what
works: an assessor that asks, verifies against the company record, refuses pasted answers, presses
on evasions, and closes with a verdict and its reasons.

This spec replaces the voice call with two things:

1. A **readiness interview** — a Thai chat with an AI bank assessor that ends by saying whether
   the learner is ready for the real verification, and why.
2. An **appointment** — once the learner is ready and the 45-day rule allows, they book a slot on
   their team's calendar for the real bank visit, which their manager sees.

## 2. Outcome

When this is done:

- A learner who has passed the exam can open the readiness interview at once, as many times as
  they like, and each session ends with _ready_ or _not yet ready_, the reasons, and what to review.
- The interview is in Thai from the first word to the last, because the banker and the learner
  will speak Thai.
- The officer never states a company fact during the interview. It verifies; the debrief teaches.
- The appointment step opens only when the learner is ready **and** today is on or after the
  eligibility date (DBD issue date + 45 days — the existing engine, unchanged). The learner books
  one free slot; nobody else in the team can take that time; the manager sees the booking.
- The dashboard shows six steps. The voice call, its provider, its webhook and its tables are gone.

## 3. The six steps

| #   | Key           | Opens when                                                         | Done when                        |
| --- | ------------- | ------------------------------------------------------------------ | -------------------------------- |
| 1   | `study`       | assignment                                                         | (never; stays "in progress")     |
| 2   | `quiz`        | assignment                                                         | a quiz submitted                 |
| 3   | `exam`        | assignment                                                         | exam passed (policy rule)        |
| 4   | `nameCard`    | assignment (exam pass if policy says so)                           | a card created                   |
| 5   | `interview`   | exam passed (policy `require_exam_pass_for_interview`, default on) | a session ended _ready_          |
| 6   | `appointment` | `interview` done **and** eligibility window open                   | an upcoming booked appointment   |

Statuses follow the existing vocabulary (`locked`, `pending`, `available`, `in_progress`, `done`)
with these reasons:

- `interview`: `no_assignment`, `exam_required`.
- `appointment`: `no_assignment`, `interview_required` (new), `missing_issue_date` (→ `pending`),
  `before_available_from`, `expired`. A cancelled appointment returns the step to `available`.

"Ready" is one-way: the first session that ends _ready_ makes the learner ready; later sessions are
practice and cannot take it away. `deriveProgression` gains `INTERVIEW_STARTED`, `INTERVIEW_READY`
and `APPOINTMENT_BOOKED` in place of the two call states; the admin's per-learner progression uses
the same words.

The dashboard, the login page's step list, the step segments and the stepper all read
`STAGE_KEYS`; "Step n of 5" becomes "Step {n} of {total}" and the stepper's connecting line is
computed from the number of steps, so six steps cost no per-screen work.

## 4. The readiness interview

### 4.1 What the officer knows

A **fact sheet** is assembled once per session from the learner's own confirmed record, their
assignment role and the manager's business answers — the same `callFacts()` set the voice call
used (company names, registration number, capital, address, directors, registration date,
business categories and objectives, shareholders and shares, the learner's position and
relationship, and the interview profile: account purpose, monthly volume, clients and suppliers,
source of funds, operations status). Indexed passages (Pinecone) are consulted only when the fact
sheet lacks a value the plan wants (objectives, shareholders). The fact sheet is Thai; English names
come from the record's `company_name_en`.

### 4.2 The plan

Each session starts with a **plan**: an ordered list of the concepts the officer must hear,
built from `BANK_INTERVIEW_CONCEPTS` (the lawyers' 16 questions, D39) plus the registration
number, and filtered to what the fact sheet can verify. Two phases:

1. **Facts** — identity first (company name, registration number, registered address, registration
   date, directors), then ownership (capital, shares, shareholders, the learner's own holding),
   then business (nature of business, products/services, purpose of the account, expected monthly
   volume, clients and suppliers, source of funds, where it operates, current status) and the
   learner's own role.
2. **Probing** — the officer revisits anything that was partial, inconsistent with the record, or
   generic ("a wide range of products") and presses for specifics, as a risk officer would.

A plan runs 10–15 exchanges. The plan snapshot is stored with the session, so a resumed session
continues where it stopped.

### 4.3 The turn protocol

Every learner message produces one officer turn through a tool call the model must use:

```
officer_turn({
  say: string,                       // Thai, what the officer says next
  assessment: {                      // of the learner's LAST message; null on the opening turn
    concept: string,                 // plan concept the answer addressed
    verdict: 'correct' | 'partial' | 'wrong' | 'evasive' | 'pasted' | 'off_topic',
    note: string,                    // one line, Thai: what was right or missing
  } | null,
  next: { concept: string } | { close: 'plan_complete' | 'too_many_evasions' | 'off_topic_limit' },
})
```

- **Pasted** — the answer reproduces the record's stored wording verbatim (normalised similarity
  ≥ 0.8 to a fact-sheet string, or twelve consecutive matching tokens) or reads like a system
  summary. Detected in code before the model sees it, then confirmed by the model; the officer asks
  for it again in the learner's own words ("กรุณาตอบด้วยคำพูดของคุณเอง").
- **Evasive** — the same concept asked twice without an answer, or the model's judgement that the
  answer avoids the question. The third evasion closes the interview.
- The officer's Thai stays polite and formal (ค่ะ/ครับ per a fixed officer persona), never
  reveals a fact, never confirms a wrong answer, and moves on after at most two attempts per
  concept.
- Learner input is capped at 1,000 characters; a session at 30 learner messages; both are shown,
  not silently cut.

### 4.4 The verdict

The verdict is **rules in code**, the wording is the model's.

_Ready_ when all of the following hold:

- every core identity concept (company name, registration number, registered address, directors)
  ended _correct_ (a _partial_ followed by a _correct_ counts);
- nature of business **and** products/services ended at least _partial_ and consistent with the
  record;
- at most one _evasive_ answer in the session and no _pasted_ answer left uncorrected;
- the plan reached its end (the learner did not close it early).

Otherwise _not yet ready_. The verdict record lists the reasons by concept and links each to the
study card that covers it (`cardConceptGroup`). The closing narrative — the paragraph a banker would
give, like the reference's "the applicant avoided answering questions about customers twice…" — is
written by the model from the stored assessments, in Thai, and never contradicts the rules.

The debrief screen shows: the verdict, the narrative, then every concept with its verdict and note,
the correct value **now** (this is where the teaching happens), and the card to revisit. The UI
chrome is in the learner's language; the officer's words and notes stay Thai.

### 4.5 Session lifecycle

- **Start**: exam passed (policy) and an active assignment; one in-progress session per learner.
  Opening the step with an in-progress session younger than 30 minutes resumes it; older ones are
  marked `abandoned` (no verdict) and a new one starts.
- **Turns**: a server action per learner message; the officer's reply arrives in one piece behind
  a typing indicator (2–5 s). Streaming is a later refinement, not part of this spec.
- **Close**: by the officer (plan complete, or the third evasion, or persistent off-topic input) or
  by the learner ("end the interview", which is _not yet ready_ with reason `incomplete`).
- **Verdict and debrief** are computed at close and stored; the session is immutable after that.

### 4.6 Models, providers, cost

- Turns: **Sonnet 5** with the fact sheet and persona in a cached system prompt (`cache_control`),
  the transcript as messages, and `officer_turn` as the only tool (forced).
- Verdict narrative: **Opus 5.5** from the stored assessments; one call per session.
- Typical session: 15 turns × ~3k cached input + ~250 output, plus the verdict — about
  US$0.10–0.15. Cost stays visible to the admin through the session list.
- `INTERVIEW_PROVIDER=claude | fake` like every other adapter. The fake officer asks the plan's
  Thai questions in order, marks an answer _correct_ when it contains the fact's normalised value,
  _evasive_ when it is shorter than three characters or says "ไม่ทราบ", _pasted_ when it equals the
  stored value, and closes after the plan. The suite drives both outcomes with it.

### 4.7 Privacy and grounding

The session is the learner's own record read for the learner's own benefit: the D36 rule (no
literal values in the shared question bank) does not apply, and nothing crosses a team. Transcripts
and assessments carry company PII and are governed by the same RLS as the record: the learner reads
their own, a manager their team's, the admin everything. Only Anthropic sees the content, as it
already does for extraction and question generation.

## 5. Appointments

### 5.1 Calendar

One calendar **per team** (the manager attends the bank with their learners); learners of admin-
owned records share the admin's calendar. The calendar is open **every day of the week except
Thai public holidays**. Slots come from policy, in Asia/Bangkok time:

| Key                          | Default          |
| ---------------------------- | ---------------- |
| `appointment_holidays`      | The Thai public holidays as ISO dates, including substitution days; seeded with the published list for the current year, kept up to date by the admin in Settings each year (the Bank of Thailand publishes the next year's list in December) |
| `appointment_hours`          | `09:00`–`16:00`  |
| `appointment_slot_minutes`   | `60`             |
| `appointment_notice_hours`   | `24` (book ahead of, and cancel until, this many hours before the slot) |

The manager **blocks** slots they cannot take (`appointment_blocks`). A free slot is one on a day
that is not a public holiday, inside the hours, not blocked, not booked, at least `notice_hours`
away, on or after the learner's `available_from` and, when set, on or before `expires_at`.
Weekends are open days like any other. A holiday added to the list after a booking was made does
not cancel the booking; the manager decides.

### 5.2 Booking rules

- A learner may hold one upcoming appointment at a time; rescheduling is cancel + book.
- A slot holds one learner. The database enforces it: a partial unique index on
  `(coalesce(team_id, <admin sentinel>), starts_at) where status = 'booked'`, so two learners
  clicking together cannot both succeed; the loser is told the slot has just been taken.
- The learner can cancel until `notice_hours` before; the manager can cancel any time; either
  cancellation returns the step to `available`.
- Booking is server-side and re-validates readiness, eligibility, the slot and the team.

### 5.3 Who sees what

- **Learner**: the appointment step on the dashboard (locked with its reason, or the booked
  card: date, time, the manager's name); the appointment page with a week-by-week slot picker.
- **Manager**: `/admin/appointments` — their team's upcoming bookings by day with learner and
  company, block/unblock controls, cancel. The Users list shows each learner's booking.
- **Admin**: the same, across all teams, with a team filter.
- Notifications to managers reuse the queue once notifications are switched on (spec P15 §8);
  until then the booking is visible in-app the moment it is made.

## 6. Removal

Deleted, not hidden:

- `lib/integrations/vapi/*`, `app/api/webhooks/vapi/`, `app/[locale]/(learner)/bank-call/`,
  `app/[locale]/(admin)/admin/calls/`, `lib/db/calls.ts`, `@vapi-ai/web`, the `VAPI_*` env
  keys, the `vapi` line of `/api/health`, `messages.bankCall.*`, and their tests
  (`bank-call.spec.ts`, `calls.test.ts`, `vapi.test.ts`, the call rows in `team-*.test.ts`).
- Tables `call_sessions` and `webhook_events`, the `recordings` bucket and its policies, by
  migration (staging holds no rows).
- Policy key `require_exam_pass_for_bank_call` is renamed to `require_exam_pass_for_interview`
  (value carried over).

`callFacts()` survives as `interviewFacts()` in the new module; `bank-interview.ts` is untouched.

## 7. Data model

```sql
create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  dbd_record_id uuid not null references public.dbd_records (id),
  language text not null default 'th',
  status text not null check (status in ('in_progress', 'completed', 'abandoned')),
  verdict text check (verdict in ('ready', 'not_ready')),
  plan jsonb not null,            -- concepts in order, phase, attempts
  summary jsonb,                  -- reasons by concept, narrative, cards to revisit, cost
  provider text not null,         -- 'claude' | 'fake'
  started_at timestamptz not null default now(),
  last_turn_at timestamptz not null default now(),
  ended_at timestamptz
);
create table public.interview_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions (id) on delete cascade,
  seq integer not null,
  role text not null check (role in ('officer', 'learner')),
  content text not null,
  assessment jsonb,               -- officer turns: the assessment of the learner's last message
  created_at timestamptz not null default now(),
  unique (session_id, seq)
);
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid references public.profiles (id),      -- null = the admin's calendar
  dbd_record_id uuid not null references public.dbd_records (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null check (status in ('booked', 'cancelled')),
  note text,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id)
);
create unique index appointments_one_per_slot
  on public.appointments (coalesce(team_id, '00000000-0000-0000-0000-000000000000'), starts_at)
  where status = 'booked';
create table public.appointment_blocks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.profiles (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid not null references public.profiles (id)
);
```

RLS follows P15: learners read and insert their own sessions, turns and appointments (turns only
through the server action); managers read their team's (`user_id = any (my_team_member_ids())`)
and manage their team's blocks and appointments; admins everything. The service role writes officer
turns, verdicts and status changes.

## 8. Application changes

- `lib/domain/interview/` — `plan.ts` (build the plan from the fact sheet), `pasted.ts`,
  `verdict.ts` (the rules), `types.ts`; pure, unit-tested.
- `lib/integrations/interview/` — the provider interface (`nextTurn`, `closeSession`), the Claude
  implementation with the `officer_turn` tool and the cached system prompt, the fake officer.
- `lib/db/interviews.ts` — session lifecycle, turn storage, readiness facts for progression.
- `lib/db/appointments.ts` — slots, booking, cancellation, blocks.
- `lib/domain/progression.ts` — six stages; facts gain `interviewSessions`, `interviewReady`,
  `appointment`; policy loader renamed.
- Learner routes: `/interview` (start/resume, history with verdict tags), `/interview/[id]` (the
  chat; the debrief once closed), `/appointment`.
- Staff routes: `/admin/interviews` and `/admin/interviews/[id]` (replacing `/admin/calls`),
  `/admin/appointments`. Both team-scoped by RLS, admin sees all.
- The exam result's next step becomes the interview; the dashboard's next-step lines gain the two
  steps.

## 9. Screens

The handoff's screen 07 (call panel) no longer applies. These screens are built on the same tokens
and shell, in this order of detail:

- **Interview start**: the band with the step, an intro on what the officer will ask, the primary
  "เริ่มการสัมภาษณ์" button, and past sessions as rows with a _ready_ (gold) / _not yet ready_
  (warn) tag leading to their debrief.
- **Chat**: a solid conversation card (officer bubbles brand-50 with the officer avatar, learner
  bubbles brand-700 on the right), a typing indicator, a 44px input bar fixed at the bottom on a
  phone, "end the interview" as a ghost action. Glass only on the band and the status bar.
- **Debrief**: the verdict badge in the exam-result treatment (gold medallion when ready, warn
  circle otherwise), the narrative, then the concept list with verdict tags, the notes, the correct
  values, and the card links; the primary action is "book the appointment" when it is open, "try
  again" otherwise.
- **Appointment**: a week view with free slots as 44px buttons, blocked and taken slots shown
  disabled, the booked state as a card with cancel; the manager's page as a day list.

If the owner supplies mocks later, the screens are restyled the way the other screens were; the
engine and data do not wait for them.

## 10. i18n

New namespaces `interview.*`, `appointment.*`, `admin.interviews.*`, `admin.appointments.*`; new
stage titles and short labels for `interview` and `appointment`; `stages.stepOf` takes `{total}`;
`progression.*` gains the three new states; `bankCall.*` is removed. All in th/en/zh. The officer's
Thai comes from the model and the fake officer's from the concepts' existing Thai questions.

## 11. Tests

- **Unit**: plan building from a fact sheet (missing values skipped, order, phases); pasted
  detection (verbatim, near-verbatim, legitimately similar short answers such as a 13-digit number
  are _not_ pasted); the verdict rules (each condition alone flips the verdict); six-stage
  progression derivation; slot generation across hours, weekdays, blocks, notice hours and the
  eligibility window; public holidays (including substitution days) yield no slots while the days
  around them do; the Thai persona prompt contains no fact-sheet value in the `say` of the fake
  officer.
- **Integration**: RLS — a manager reads their team's sessions and appointments and none of another
  team's; a learner reads only their own; the service-role gates; the one-per-slot index under two
  concurrent bookings; cancellation reopens the slot.
- **End to end** (fake officer): exam → interview → answers that fail → _not yet ready_ with
  reasons → retry with good answers → _ready_ → appointment locked by date → clock past the date →
  a slot booked → the manager sees it → a second learner in the team cannot take the slot → the
  learner cancels → the slot is free again. Plus the dashboard's six steps and the login list.

## 12. Slices

1. **P16a — the six steps and the readiness interview.** Progression, tables, the engine with the
   fake and Claude providers, the three learner screens, the staff review screens, the exam-result
   link, and the removal of the voice call. Shippable: the interview works end to end and the
   appointment step shows as locked.
2. **P16b — appointments.** Tables, policy, slot logic, the learner's calendar, the manager's and
   admin's pages, the dashboard card.

Each slice gets its own implementation plan.

## 13. Out of scope

- Voice or phone rehearsal (deleted; a future spec if wanted).
- Any channel other than the portal (the Telegram transcripts were reference only).
- Notification routing to managers (deferred by P15 §8; the queue is reused when it arrives).
- Integration with a bank's own booking system; the appointment is the team's internal calendar.
- A certificate number or an operations flow after the appointment.
