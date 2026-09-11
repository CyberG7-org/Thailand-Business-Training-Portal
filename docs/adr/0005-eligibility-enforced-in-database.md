# ADR 0005: Eligibility snapshots are written by the database

**Status:** Accepted (2026-09-11)

**Context.** `available_from = issued_on + 45 days` must hold even if an admin edits `issued_on`
through a tool other than the app, and history must survive as an audit trail.

**Decision.** A Postgres function `compute_eligibility_snapshot()` runs from triggers on assignment
insert and on `issued_on` change, appending to `eligibility_snapshots`. `lib/domain/eligibility.ts`
mirrors the arithmetic for display and tests, and an integration test proves both agree on boundary
dates.

**Consequences.** Two implementations of one rule, guarded by a parity test. Changing the day count is
a `policy_config` update; existing snapshots are not rewritten.
