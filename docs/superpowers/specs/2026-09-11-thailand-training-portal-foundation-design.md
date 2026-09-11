# Thailand Business Training & Bank Verification Portal — Foundation Design

| Field | Value |
|---|---|
| Status | Approved in brainstorming session, pending written review |
| Date | 2026-09-11 |
| Source | `Thailand_Business_Training_Portal_PRD_v1.0.pdf` (11 Sep 2026) |
| Scope of this spec | Cross-cutting architecture + phases **P0 (scaffold), P1 (auth + DBD core + eligibility calc), P2 (dashboard + i18n + progression)**. Feature slices P3–P10 get their own short specs built on this one. |
| Decision owner | The product owner (this repo's author) decides all business rules; see `docs/decisions-log.md`. |

## 1. Product summary

A provisioned-login web portal for learners in Thailand. Each learner is linked to one confirmed **DBD company record** (Department of Business Development certificate, หนังสือรับรอง). The portal guides the learner through a gated progression:

1. Login (ID + password issued by an admin; no self-registration)
2. Study material in Thai / English / Simplified Chinese, Thai read-aloud
3. Evaluation Quiz — randomized MCQ, immediate feedback + explanations
4. Exam — same engine, **no feedback until submission**; result stored and sent to Telegram + Email
5. Thai fixed-template name card (DBD data + learner phone number) as PDF
6. Bank Verification stage unlocks **on or after DBD Issue Date + 45 calendar days**
7. Thai-language bank-call training with a Vapi AI assistant; recording + transcript stored
8. Admin dashboard: users, DBD records, attempts, results, calls, notifications, audit

Non-goals for MVP (PRD §1.2): multiple card templates, EN/ZH cards or calls, self-registration, banking integration, real verification, legal advice, guessing missing DBD data.

## 2. Decisions that shape this design

| # | Decision | Consequence |
|---|---|---|
| D1 | Product owner decides all TBDs directly | TBDs are resolved here or become `policy_config` entries with owner-approved defaults |
| D2 | **DBD Issue Date = the certificate's "Issued on" date** (e.g. 2026-07-13 on the sample), not the company registration date | A newly pulled certificate resets the 45-day clock; issue-date changes create a new eligibility snapshot with audit history |
| D3 | DBD import = PDF upload + AI extraction + admin review; manual form ships first | Only admin-**confirmed** records can be assigned; extraction never auto-commits |
| D4 | Questions = hybrid: DBD-slot templates + approved generic bank; AI-generated questions require admin approval | `questions.kind`, `questions.source`, `questions.approval_status` |
| D5 | Existing assets: study material and question bank (drafts). Name card design and bank-call script do not exist yet | P6 and P8 ship with placeholder template/script until real ones are approved |
| D6 | Target: ASAP, small pilot (handful of companies/learners) | Simplest stack; no queue server; defer polish |
| D7 | Stack A: Next.js + Supabase + Vercel | RLS-enforced isolation; provisioning via connected accounts |
| D8 | Chinese variant = **Simplified (zh-CN)** | Locale `zh`, `lang="zh-Hans"` |
| D9 | Gating defaults: exam pass **not** required for name card; exam pass **required** for bank-call training | `policy_config` keys, editable in admin |
| D10 | Notification defaults: Telegram → one admin chat; Email → admin recipients (Resend); learners get no copies (no email on file) | `policy_config` keys |
| D11 | Vapi call modality/configuration deferred to the P8 spec | `VapiClient` interface and `call_sessions` stay neutral to web vs phone calls |
| D12 | Timezone: dates persisted as `date`/UTC timestamps; business-facing "today" = Asia/Bangkok | `todayInBangkok()` helper is the only source of "today" |

## 3. Architecture

### 3.1 Shape

One Next.js application (App Router, TypeScript, Tailwind, shadcn/ui components sourced via 21st.dev), one Supabase project per environment (Postgres + Auth + Storage), deployed on Vercel. Four external services sit behind thin adapters. No job server: a `notifications` table is the queue, drained by a Vercel Cron route.

```
Browser --(server-rendered pages, server actions)--> Next.js on Vercel
                                                       |
   RLS-scoped reads/writes (learner session) ----------+--> Supabase Postgres + Storage
   service-role writes (admin/cron/webhooks) ----------+
                                                       |
   lib/integrations --> ElevenLabs/Google TTS, Resend, Telegram Bot API, Vapi, Claude API (extraction)
```

### 3.2 Repository layout

```
thailand-training-portal/
  app/
    [locale]/
      (auth)/login
      (learner)/dashboard | study | quiz | exam | name-card | bank-call
      (admin)/admin/{users,dbd-records,content,questions,notifications,audit,settings}
    api/
      webhooks/vapi           # signature-verified, idempotent
      cron/notifications      # drains the notifications table (Vercel Cron)
      tts                     # Thai read-aloud, cached
      pdf/name-card
      admin/dbd/extract       # Claude API extraction
  lib/
    domain/                   # PURE functions, no I/O — the TDD core
      eligibility.ts          # availableFrom(issuedOn) = issuedOn + 45 calendar days
      progression.ts          # deriveProgression(facts) -> PRD state
      assessment/             # selectQuestions, shuffle, slotFill, score
      thai-date.ts            # BE <-> CE, Bangkok "today", Thai date formatting
      phone.ts                # Thai mobile validation/normalization
    integrations/
      tts/        { TtsProvider, ElevenLabsTts, GoogleTts, FakeTts }
      pdf/        { PdfRenderer, ReactPdfRenderer, FakePdfRenderer }
      notify/     { Notifier, TelegramNotifier, ResendEmailNotifier, FakeNotifier }
      vapi/       { VapiClient, HttpVapiClient, FakeVapiClient }
      extraction/ { DbdExtractor, ClaudeDbdExtractor, FakeDbdExtractor }
    db/                       # Supabase clients (anon+session, service role), typed queries
    config/                   # policy_config loader with typed keys + defaults
    auth/                     # session helpers, requireAdmin(), requireLearner()
  supabase/
    migrations/               # SQL, including RLS policies and storage policies
    seed/                     # anonymized seed data + import scripts for owner's content
  messages/{th,en,zh}.json    # UI strings (next-intl)
  tests/{unit,integration,e2e}
  docs/
    superpowers/specs/        # this file + slice specs
    adr/                      # architecture decision records
    decisions-log.md          # running log of business decisions
```

### 3.3 Request rules

- Pages render on the server. Learner reads use the learner's Supabase session, so **RLS scopes every query** — a bug in a page cannot leak another learner's rows.
- Every consequential mutation (submit exam, generate card, start call, admin changes) is a server action or route handler that re-validates eligibility, gating and ownership on the server. Hidden UI is never an access control (PRD §13).
- The service-role key exists only in server code paths that need cross-user access: admin provisioning, extraction, cron, webhooks. It is never imported into client components.
- All external credentials are server env vars. `.env.example` documents them; `.env.local` is git-ignored.

### 3.4 Environments and CI

| Env | Supabase | Vercel | Notes |
|---|---|---|---|
| local | Supabase CLI (Docker) | `next dev` | Fakes for all integrations by default |
| staging | project `…-staging` | preview/staging env | Migrations applied by CI on merge to `main` |
| production | project `…-prod` | production env | Migrations applied on release tag, manual approval |

GitHub Actions on every PR: lint, typecheck, unit tests, integration tests against a fresh local Supabase, Playwright E2E on the main journey. Conventional commits; one PR per vertical slice/ticket (PRD §17.1).

## 4. Data model

All tables have `id uuid pk default gen_random_uuid()` unless noted, `created_at timestamptz`, and `updated_at` where rows change. Business dates use the `date` type; instants use `timestamptz` (UTC).

### 4.1 Identity

**`profiles`** — `id` (fk `auth.users.id`), `login_id text unique`, `role text check in ('learner','admin')`, `display_name`, `preferred_language text check in ('th','en','zh') default 'th'`, `status text check in ('active','disabled')`.

Login: Supabase Auth email+password. The admin-facing "user ID" is stored in `login_id` and mapped to an internal email `<login_id>@learner.portal.internal` at provisioning (`auth.admin.createUser`, `email_confirm: true`). Learners never see the email. Password reset is admin-driven (`auth.admin.updateUserById`). Failed logins return one generic message (AUTH-004).

### 4.2 DBD records

**`dbd_records`**

| Column | Type | Notes |
|---|---|---|
| `juristic_id` | text | 13-digit registration number, e.g. `0535569000360` |
| `certificate_no` | text | e.g. `E53001920000346` |
| `document_ref` | text | e.g. `E6953001920000346` |
| `company_name_th`, `company_name_en` | text | |
| `registered_on` | date | company registration date (CE) |
| **`issued_on`** | date | certificate "Issued on" date (CE) — **drives eligibility (D2)** |
| `registered_capital` | numeric(18,2) | THB |
| `head_office_address` | text | |
| `directors` | jsonb | `[{ "name_th": "...", "name_en": "..." }]` |
| `signing_authority` | text | |
| `objectives_count` | int | |
| `issuing_office`, `registrar_name` | text | |
| `structured_data` | jsonb | any extra fields, never used for personalization unless promoted to a column |
| `document_path` | text | Storage path in `dbd-documents` |
| `extraction_status` | text | `none` → `pending` → `extracted` → `confirmed` |
| `extraction_raw` | jsonb | model output with per-field confidence + source snippet |
| `confirmed_by`, `confirmed_at` | uuid, timestamptz | required before assignment |
| `created_by` | uuid | |

Buddhist-Era input: any entered/extracted year ≥ 2400 is converted with −543 and both readings are shown to the admin for confirmation. A check constraint rejects `issued_on < registered_on`.

**`user_dbd_assignments`** — `user_id`, `dbd_record_id`, `assigned_by`, `assigned_at`, `active bool`, `deactivated_at`. Partial unique index `(user_id) where active` — one active assignment per learner. Insert/deactivate writes `audit_logs`. Assignment requires `dbd_records.extraction_status = 'confirmed'` (enforced in the server action and by a trigger).

### 4.3 Content

**`study_materials`** — `content_key text unique`, `type text ('card','pdf')`, `sort_order int`, `active bool`.
**`study_material_localizations`** — `material_id`, `language`, `title`, `body` (markdown, cards), `file_path` (pdf), `tts_enabled bool`; unique `(material_id, language)`.
**`study_progress`** — `user_id`, `material_id`, `first_viewed_at`, `last_viewed_at`, `completed_at nullable`; unique `(user_id, material_id)`.

**`questions`** — `question_key text unique`, `kind text ('generic','dbd_template')`, `dbd_field_dependencies text[]` (e.g. `{registered_capital}`), `source text ('manual','ai_generated')`, `approval_status text ('draft','approved','retired')`, `pools text[]` (subset of `{quiz,exam}`), `active bool`.
**`question_localizations`** — `question_id`, `language`, `prompt` (may contain `{slot}` placeholders), `options jsonb` (`[{ "key": "A", "text": "...", "slot": "registered_capital" | null, "strategy": null | "numeric_variants" | "date_variants" | "curated" }]`), `correct_key text`, `explanation text`, `tts_enabled bool`; unique `(question_id, language)`.

Rules: a question can only become `approved` when all three languages exist; `ai_generated` rows are created as `draft`. Distractor strategies for template questions are specified in the P4 spec; the schema above is forward-compatible.

### 4.4 Assessment

**`assessment_attempts`** — `user_id`, `dbd_record_id`, `kind text ('quiz','exam')`, `language`, `attempt_no int` (per user+kind), `status text ('in_progress','submitted','abandoned')`, `question_ids uuid[]` (presentation order), `shuffle_seed text`, `passing_mark_snapshot numeric nullable` (exam), `score int`, `max_score int`, `result text nullable ('pass','fail')`, `started_at`, `submitted_at`. Unique `(user_id, kind, attempt_no)`. At most one `in_progress` attempt per user+kind (partial unique index).
**`assessment_answers`** — `attempt_id`, `question_id`, `position int`, `presented_option_order text[]`, `rendered_prompt text` (slot-filled snapshot), `rendered_options jsonb`, `selected_key text nullable`, `is_correct bool nullable`, `answered_at`; unique `(attempt_id, question_id)`.

One table with `kind` replaces the PRD's separate quiz/exam tables: the flow is identical except for feedback timing, which is a behavior of the endpoint, not the storage.

### 4.5 Eligibility, cards, calls

**`eligibility_snapshots`** (append-only) — `user_id`, `dbd_record_id`, `issued_on_snapshot date`, `available_from date`, `expires_at date nullable`, `calculated_at`, `reason text ('assignment','issue_date_changed','policy_changed')`. The latest row per `(user_id, dbd_record_id)` is authoritative; older rows are the audit trail.

**`name_cards`** — `user_id`, `dbd_record_id`, `phone_number text` (normalized `0XXXXXXXXX`), `template_version text`, `pdf_path`, `telegram_sent_at nullable`.

**`call_sessions`** — `user_id`, `dbd_record_id`, `vapi_call_id text unique nullable`, `modality text` (set by P8), `status text ('initiated','in_progress','completed','partial','failed')`, `started_at`, `ended_at`, `recording_path nullable`, `transcript text nullable`, `metadata jsonb`.

### 4.6 Operations

**`notifications`** — `event_type text`, `channel text ('telegram','email')`, `destination_ref text`, `payload jsonb`, `idempotency_key text unique`, `status text ('pending','sent','failed')`, `attempts int default 0`, `next_attempt_at timestamptz`, `last_error text`, `sent_at`.
**`webhook_events`** — `provider text`, `external_id text`, `event_type text`, `payload jsonb`, `received_at`, `processed_at nullable`, `error text`; unique `(provider, external_id, event_type)`.
**`audit_logs`** — `actor_id uuid nullable`, `action text`, `entity_type text`, `entity_id uuid`, `before jsonb`, `after jsonb`, `created_at`.
**`policy_config`** — `key text pk`, `value jsonb`, `updated_by`, `updated_at`.

Initial `policy_config` keys and pilot defaults:

| Key | Default | PRD item |
|---|---|---|
| `bank_eligibility_days` | `45` | BR-002 (kept configurable; calendar days) |
| `bank_access_expiry_days` | `null` (no expiry) | open #13 |
| `exam_passing_mark_percent` | `70` (owner may change before UAT) | open #6 |
| `quiz_question_count` / `exam_question_count` | `10` / `20` | open #4/#5 |
| `exam_max_attempts` / `exam_retry_wait_hours` | `null` (unlimited) / `0` | open #7 |
| `exam_pass_rule` | `"any"` (any submitted attempt passing counts) | §8 note |
| `require_exam_pass_for_name_card` | `false` | open #8 (D9) |
| `require_exam_pass_for_bank_call` | `true` | open #9 (D9) |
| `call_max_sessions` | `null` | open #16 |
| `telegram_admin_chat_ids` | `[]` | open #11 (D10) |
| `email_admin_recipients` | `[]` | open #12 (D10) |
| `study_completion_tracking` | `"viewed"` | STUDY-004 |

Admins edit these in `/admin/settings`; every change writes `audit_logs`.

## 5. Authorization

- **RLS on every table.** Learners: `select` where `user_id = auth.uid()` on `study_progress`, `assessment_*`, `eligibility_snapshots`, `name_cards`, `call_sessions`, `user_dbd_assignments`; `select` on their assigned `dbd_records` (via assignment join) and on active `study_materials*`; **no direct access to `questions*`** — quiz/exam server endpoints read questions with the service role and return only prompt/options, so `correct_key` and `explanation` never reach the client before they should; `insert` on their own attempts/answers/progress/name_cards; **no** `update`/`delete` beyond their own in-progress answers; no access to `notifications`, `webhook_events`, `audit_logs`, `policy_config`.
- **Admins:** `is_admin()` (security-definer function reading `profiles.role`) grants full access. Admin routes additionally call `requireAdmin()` in middleware/server actions.
- **Storage:** buckets `dbd-documents`, `name-cards`, `recordings`, `tts-cache` are private. Policies mirror table ownership; files are served through short-lived signed URLs generated server-side after an ownership check.
- **Negative tests are mandatory** per table and per bucket (learner A reading/writing learner B's data must fail) — see §13.

## 6. Progression and eligibility

### 6.1 Eligibility

`availableFrom(issuedOn: ISODate, days = 45): ISODate` — pure date arithmetic on calendar days, no time zone involved. `11 Sep 2026 → 26 Oct 2026` (AC-001). Tests cover month ends, year ends, and leap days.

Snapshot lifecycle: on assignment, and whenever `dbd_records.issued_on` changes for a record with active assignments, a new `eligibility_snapshots` row is inserted (trigger + server action). A missing `issued_on` produces **no** snapshot; the record is flagged in admin and the learner dashboard shows "eligibility date pending" (PRD §16).

Enforcement: `isBankStageOpen(snapshot, today)` = `today >= available_from && (expires_at == null || today <= expires_at)`. `today` is always `todayInBangkok()`. The check runs server-side in every bank-stage endpoint; the UI shows "Available from 26 October 2026" while locked — Thai locale renders the date with the BE year ("26 ตุลาคม 2569"), English and Chinese render CE.

### 6.2 Progression (derived, never stored)

```
deriveProgression({
  hasActiveAssignment, examSubmittedCount, examPassed /* per exam_pass_rule */,
  availableFrom, expiresAt, today, callSessionCount, completedCallCount, policy
}) -> 'PROVISIONED' | 'LEARNING' | 'EXAM_PENDING' | 'EXAM_PASSED'
   | 'WAITING_BANK_ELIGIBILITY' | 'BANK_ELIGIBLE'
   | 'CALL_TRAINING_STARTED' | 'CALL_TRAINING_COMPLETED'
```

The dashboard renders each stage with its own status (study / quiz / exam / name card / bank verification) because exam pass and date eligibility are independent conditions (PRD §8 note); the single derived state is used for admin lists and metrics.

## 7. Localization

- Locales `th`, `en`, `zh` (Simplified). `next-intl` with locale-prefixed routes; `messages/*.json` hold UI strings only. Missing keys fail the build (CI check).
- Content (study material, questions) is localized in the DB with stable `content_key`/`question_key`. Attempts record `language`; results compare across languages via keys.
- Switching language never touches assignment, attempts or progression.
- Thai formatting helpers: dates (CE and BE), currency (`2,000,000.00 บาท`), Thai fonts (Noto Sans Thai / Sarabun) loaded via `next/font`.
- Missing translation → the item shows a controlled "not available in this language" state and is flagged in admin; no silent fallback (PRD §16).

## 8. Thai read-aloud

`GET /api/tts?content=<type:key>&lang=th` → verifies the row exists, is active/approved and `tts_enabled`, and that the caller may read it → computes `sha256(text + voiceId)` → returns a signed URL from `tts-cache` if present, else synthesizes through `TtsProvider`, stores, returns. Only approved Thai text is ever synthesized (PRD §6). Default implementation: ElevenLabs (connected account); Google Cloud TTS is the alternate implementation. Spike S2 confirms the default before P3 starts; switching is a config change. The player component exposes play/pause/loading/error states with ARIA labels.

## 9. Assessment engine (shared by P4 quiz and P5 exam)

1. `selectQuestions(pool, count, record, seed)` — filters `approved && active && pools ∋ pool`; for `dbd_template` questions, checks every `dbd_field_dependencies` field is present on the confirmed record and **excludes** the question otherwise (BR-008); shuffles with a seeded PRNG; returns ordered ids.
2. `slotFill(localization, record)` renders `{slots}` in prompt/options; the rendered text is snapshotted on `assessment_answers`.
3. `shuffleOptions(options, seed, questionId)` — stored as `presented_option_order`; invariant tests: permutation of all keys, correct key preserved, deterministic for a seed.
4. **Quiz answer endpoint** stores the answer and returns `{ isCorrect, correctKey, explanation }` immediately (AC-004/005). **Exam answer endpoint** stores only and returns `{ saved: true }` (AC-006).
5. **Submit** (both kinds): the server action loads the attempt's answers, computes `score/max_score` and (for exams) `result` against `passing_mark_snapshot` (copied from `policy_config` at attempt start) using `lib/domain`, then calls one Postgres function `finalize_attempt(attempt_id, score, max_score, result, notifications[])` that re-checks `score = count(is_correct)`, writes the result, and inserts the `notifications` rows with `idempotency_key = exam_result:<attempt_id>:<channel>` — all in one transaction (AC-007/008). Quiz submit renders the review screen.
6. Answers are autosaved on selection; an `in_progress` attempt is resumed on return (PRD §16 recommendation). Retry/wait/max-attempt rules are read from `policy_config` at attempt start.

## 10. Integrations and jobs

| Adapter | Real impl | Notes |
|---|---|---|
| `TtsProvider` | ElevenLabs / Google | §8 |
| `PdfRenderer` | react-pdf + embedded Thai font + `Intl.Segmenter('th')` for word breaks | spike S3; P6 |
| `Notifier` | Telegram Bot API (`sendMessage`, `sendDocument`), Resend email | templated messages, TH/EN |
| `VapiClient` | Vapi HTTP API | modality set in P8 (D11) |
| `DbdExtractor` | Claude API document input, strict JSON schema | P1.5 |

**Notification queue.** `POST /api/cron/notifications` (Vercel Cron, every minute, protected by a cron secret) selects up to N `pending` rows with `next_attempt_at <= now()` using `for update skip locked`, sends each through `Notifier`, marks `sent`, or increments `attempts`, records `last_error`, sets exponential `next_attempt_at`, and marks `failed` after the max. Admin can requeue a failed row. Duplicate sends are impossible by `idempotency_key`.

**Webhooks.** `POST /api/webhooks/vapi` verifies the provider signature/secret, inserts into `webhook_events` (`on conflict do nothing` → duplicate is a no-op), then applies the event to `call_sessions`. Processing errors are stored on the event row and retried by the same cron.

**Graceful degradation.** Each adapter throws a typed `IntegrationUnavailable`; callers map it to a stored `failed`/`pending` state and a user-safe message. Core pages never depend on a live external call.

## 11. DBD extraction (P1.5)

Flow: admin uploads certificate PDF (validated: PDF, ≤ 10 MB) → stored in `dbd-documents` → `POST /api/admin/dbd/extract` sends the document to the Claude API with a JSON schema `{ field: { value, confidence 0–1, source_text } }` for every column in §4.2 → saved as `extraction_raw`, status `extracted` → the admin form is pre-filled, fields with confidence < 0.8 highlighted, BE/CE readings shown side by side → admin edits and **confirms** → status `confirmed`, `audit_logs` row. The manual form (status `none` → `confirmed`) ships first so the pilot is never blocked on extraction quality (spike S4 measures it on the owner's sample certificate). The `claude-api` skill is consulted before this code is written.

## 12. Error handling (PRD §16 → behavior)

| Scenario | Behavior |
|---|---|
| Missing `issued_on` | No snapshot; admin flag; dashboard "eligibility date pending" |
| `issued_on` changed by admin | New snapshot (`reason = issue_date_changed`), audit row, old snapshot retained |
| No content in selected language | Controlled unavailable state; admin flag; no fallback |
| Telegram / Email send fails | Attempt/result stays valid; row `failed` after retries; visible + requeue in admin |
| Duplicate Vapi callback | Ignored via `webhook_events` unique key |
| Recording missing, transcript present | `call_sessions.status = partial`; later events can complete it |
| Browser closed mid-exam | Answers autosaved; attempt resumes |
| Invalid phone number | Blocked with validation message (Thai mobile format) |
| Missing DBD field for card | Generation blocked with the missing field named; never fabricated |
| Extraction fails or low confidence | Form stays manual; status `none`; admin sees the error |

## 13. Testing strategy

| Layer | Tooling | Minimum coverage |
|---|---|---|
| Unit (`lib/domain`) | Vitest | eligibility (+45 incl. month/year/leap boundaries, AC-001), progression derivation, scoring and pass/fail, shuffle invariants, slot filling and exclusion, BE↔CE, phone validation |
| Integration | Vitest against local Supabase | **RLS negative tests for every table and bucket** (learner A vs B, learner vs admin-only tables), assignment uniqueness, snapshot trigger, notification queue (retry, idempotency), webhook idempotency, extraction fake round-trip |
| E2E | Playwright | login → study → quiz → exam → result; name card; locked vs unlocked bank stage (clock injected); admin provisioning |
| Security | checklist + tests | IDOR on every id-bearing route, no secrets in client bundle, signed-URL expiry, cron/webhook secrets |
| Localization QA | manual + snapshot | TH/EN/ZH UI, Thai fonts in UI and PDF, TTS playback |
| UAT | owner | questions, passing mark, card mapping, call script (P10) |

TDD applies to everything in `lib/domain` and to authorization; fakes exist for every adapter so no test needs a live external service.

## 14. Spikes (throwaway, run before the slice that depends on them)

| Spike | Question | Before |
|---|---|---|
| S1 | Can Vapi run a Thai conversation end-to-end (transcriber + voice) with acceptable latency? | P8 spec |
| S2 | Which TTS provider gives the best Thai voice for the budget? | P3 |
| S3 | Does react-pdf + Noto Sans Thai + `Intl.Segmenter` render the card correctly on Vercel? | P6 |
| S4 | How accurate is Claude extraction on the sample certificate (Thai + translated)? | P1.5 |

## 15. Roadmap

| Slice | Deliverable | Spec |
|---|---|---|
| P0 | Scaffold, Tailwind/shadcn, lint/format/typecheck, Vitest/Playwright, Supabase CLI, CI, env strategy, ADRs | this spec |
| P1 | Auth (provisioned users, admin role), `dbd_records` manual form + upload, assignment, eligibility snapshots, RLS + negative tests | this spec |
| P1.5 | AI extraction with admin review | this spec |
| P2 | Dashboard shell, TH/EN/ZH i18n, stage cards, eligibility date + lock display, progression derivation | this spec |
| P3 | Study cards/PDFs, viewed tracking, Thai TTS | slice spec |
| P4 | Evaluation quiz | slice spec |
| P5 | Exam, notifications queue, Telegram + Email | slice spec |
| P6 | Name card PDF + Telegram send | slice spec |
| P8 | Vapi call training + webhooks + admin review | slice spec |
| P9 | Admin screens completion, audit views, retry UI, security review, E2E | slice spec |
| P10 | UAT, Thai QA, production config, monitoring, release | checklist |

P7 (eligibility engine) is absorbed into P1/P2 because the calculation is pure logic the dashboard needs from day one.

## 16. Out of scope for this spec

Question distractor strategies (P4), notification message templates (P5), the name-card template design (P6), Vapi assistant configuration and call modality (P8), data-retention automation (post-MVP; a `retention_days` config key is reserved), fine-grained admin roles (single `admin` role for MVP; `role` column allows more later).
