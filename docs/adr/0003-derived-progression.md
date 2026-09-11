# ADR 0003: Progression state is derived, never stored

**Status:** Accepted (2026-09-11)

**Context.** PRD §8 asks that eligibility and exam pass be independent conditions so policy changes
do not strand users in an irreversible status.

**Decision.** `deriveProgression(facts)` in `lib/domain` computes the PRD state from stored facts
(assignment, attempts, eligibility snapshot, call sessions, policy) on every read.

**Consequences.** No status column to migrate when rules change; dashboards show each stage's own
status; admin lists compute the summary state at query time.
