# ADR 0002: Row-Level Security is the isolation boundary

**Status:** Accepted (2026-09-11)

**Context.** A learner must never read another learner's DBD data, results, cards or calls, even via
API manipulation (AC-011). App-level checks alone fail silently when a query forgets a filter.

**Decision.** Every table has RLS. Learner-facing pages query with the learner's own session client.
Admins pass `is_admin()`. Admin server actions use the admin's session client so `auth.uid()` reaches
audit triggers; the service-role client is limited to provisioning, config reads, signed URLs, cron and
webhooks. The account role lives in auth `app_metadata` (not user-editable) and is mirrored into
`profiles.role` by trigger.

**Consequences.** Every table and bucket gets a negative test (learner A vs learner B). Cross-user
features must be designed as server routes, never as wider policies.
