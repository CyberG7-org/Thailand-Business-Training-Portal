# P5 — Exam & Notifications (slice spec)

| Field | Value |
|---|---|
| Status | Drafted from the foundation spec; decisions D21–D23 logged |
| Date | 2026-09-11 |
| Builds on | P4 engine and tables; foundation §4.6 (`notifications`), §9 step 5, §10 (queue), §12 |
| PRD | EXAM-001…011, AC-006/007/008, BR-004, §11 Telegram/Email, §16 send failures |

## 1. Scope

The exam reuses the assessment engine with `kind = 'exam'`: no correctness feedback while in progress, pass/fail from the configured passing mark, configurable retry policy, and results sent to Telegram and Email through an idempotent queue drained by a cron route. Admins see delivery status and can requeue.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D21 | After submission the exam result page shows score, pass/fail and which questions were wrong, but **not** the correct answers | Keeps retakes meaningful; owner may relax later |
| D22 | Notification delivery: `TELEGRAM_BOT_TOKEN` enables Telegram, `RESEND_API_KEY` (+ `EMAIL_FROM`) enables email; without keys, `fake` outside production (marks sent) and `off` in production. Destinations come from `policy_config` (`telegram_admin_chat_ids`, `email_admin_recipients`) | Same provider pattern as TTS/extraction; destinations stay configurable (open #11/#12) |
| D23 | The cron route `/api/cron/notifications` requires `Authorization: Bearer $CRON_SECRET`; rows are leased (`next_attempt_at` pushed 5 minutes ahead on claim) so overlapping runs never double-send; up to 5 attempts with exponential backoff, then `failed` and requeueable by an admin | PRD §12 idempotent processing, §16 retryable failures |

## 3. Data (migration `20260911000007_exam_notifications.sql`)

- `notifications` — foundation §4.6 columns plus `channel`, `destination_ref`, `idempotency_key unique`, `status ('pending','sent','failed')`, `attempts`, `next_attempt_at`, `last_error`, `sent_at`. RLS: admins read/update; learners nothing; writes by functions/service role.
- `finalize_attempt(p_attempt_id, p_score, p_max_score, p_result, p_notifications jsonb)` — security definer; checks `count(is_correct) = p_score`, closes the attempt, inserts the notification rows (`on conflict (idempotency_key) do nothing`) in one transaction.
- `claim_notifications(p_limit)` — security definer; `for update skip locked` over pending rows due now, bumps `attempts` and leases `next_attempt_at`, returns the rows.

## 4. Behaviour

- Start: `getOrStartAttempt(kind='exam', count=exam_question_count, passingMarkPercent=exam_passing_mark_percent)` after the retry policy check: `exam_max_attempts` (null = unlimited) and `exam_retry_wait_hours` since the last submission.
- Answering returns `{ saved: true }` only; the card shows "answer saved" and Next.
- Submit: score in TS (`scoreAnswers`, `evaluateResult`), then `finalize_attempt` with two notification rows (`exam_result:<attempt>:telegram`, `exam_result:<attempt>:email`) whose payload holds learner login id, company, score, pass/fail, attempt no. and submitted time.
- Result page: score, pass/fail badge, per-question ✓/✗ (D21). `loadProgressionFacts`: `examSubmitted` = submitted count; `examPassed` per `exam_pass_rule` (`any` or `latest`).
- Cron drain: claim → render message (TH + EN lines) → `Notifier.send` → `sent` or backoff/`failed`.
- Admin `/admin/notifications`: table with status, attempts, last error, requeue button (`pending`, `next_attempt_at = now()`).
- `vercel.json` schedules the cron every minute.

## 5. Tests

Unit: backoff schedule, message rendering, provider resolution. Integration: retry policy, exam answers reveal nothing, `finalize_attempt` atomicity + idempotency (double finalize is a no-op), `claim_notifications` leasing, RLS on notifications. E2E: learner takes the exam (no feedback per answer), sees pass/fail; admin sees two rows; cron call with the secret drains them to `sent`; a call without the secret is rejected.
