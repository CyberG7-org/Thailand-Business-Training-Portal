# ADR 0004: The notifications table is the job queue

**Status:** Accepted (2026-09-11)

**Context.** Exam results go to Telegram and Email; sends must be idempotent and retryable, and the
exam submission must stay valid when a provider is down (PRD §16). Pilot scale is tiny.

**Decision.** Submissions insert `notifications` rows (unique `idempotency_key`) in the same
transaction as the result. A Vercel Cron route drains pending rows with backoff. No queue service.

**Consequences.** Zero extra infrastructure; retry state is visible in admin. Upgrade path is Inngest
if volume grows.
