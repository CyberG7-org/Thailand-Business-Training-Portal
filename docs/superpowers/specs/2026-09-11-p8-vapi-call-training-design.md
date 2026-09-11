# P8 — Bank Call Training with Vapi (slice spec)

| Field | Value |
|---|---|
| Status | Implemented (fake provider verified end-to-end); decisions D26–D29 logged; **spike S1 (Thai on Vapi) still needs a real key** |
| Date | 2026-09-11 |
| Builds on | Foundation §4.5 (`call_sessions`), §4.6 (`webhook_events`), §6 (gate), §10 (webhooks), §12 |
| PRD | CALL-001…009, BR-003/004, AC-010, §16 duplicate callbacks / missing recording |

## 1. Scope

When the bank stage is open (issue date + 45 days, exam passed per policy), the learner starts a Thai-language simulated bank verification call in the browser. The session, provider call id, recording and transcript are stored; admins review them. Scoring is off (open #15); repeat limit from `policy_config.call_max_sessions`.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D26 | **Modality: in-browser call via `@vapi-ai/web`** (transient assistant built server-side from the record; `variableValues` carry the company facts and the session id). Outbound phone calls stay a later option (`modality` column). | Simplest for a pilot; no telephony cost; D11 deferred this — owner may switch |
| D27 | `VAPI_PROVIDER=vapi|fake|off`: fake outside production when no `VAPI_PUBLIC_KEY`, off in production. The fake modality completes a session with a canned Thai transcript so the flow, storage and admin review are testable without the provider. | Same pattern as the other adapters |
| D28 | Webhook `/api/webhooks/vapi` requires header `x-vapi-secret` = `VAPI_WEBHOOK_SECRET`; every message is recorded in `webhook_events` keyed by `(provider, external_id, event_type)`; `end-of-call-report` copies the recording into the private `recordings` bucket when downloadable, else keeps the provider URL in `metadata` (status `partial`). | PRD §12 idempotency, §16 |
| — | The assistant prompt is a **placeholder Thai bank-officer script** (five verification questions) until the owner supplies the real script (open #14). Transcriber/voice providers and language are env-configurable pending spike S1. | |

## 3. Data (migration `20260911000009_calls.sql`)

- `call_sessions` — `user_id`, `dbd_record_id`, `vapi_call_id unique nullable`, `modality ('web','phone','fake')`, `status ('initiated','in_progress','completed','partial','failed')`, `started_at`, `ended_at`, `recording_path`, `transcript`, `metadata jsonb`.
- `webhook_events` — `provider`, `external_id`, `event_type`, `payload`, `received_at`, `processed_at`, `error`; unique `(provider, external_id, event_type)`.
- Bucket `recordings` (private, audio).
- RLS: learners read their own sessions; admins read sessions and events; writes via service role.

## 4. Flow

1. `/bank-call`: server computes the gate (`stageStatuses().bank`); when `available`/`in_progress`, shows Start. `startCallSessionAction` re-checks the gate and `call_max_sessions`, inserts a session, returns the web-call config (public key, transient assistant with the Thai script, `variableValues` with company facts + `session_id`).
2. Client `CallPanel` starts the call; on `call-start` it posts the provider call id (`attachVapiCallAction`); on `call-end` it marks the session `in_progress → awaiting report` and refreshes.
3. Webhook `status-update: ended` and `end-of-call-report` update the session (transcript from `artifact.transcript` or messages; recording copied); status `completed` when both exist, `partial` when only one.
4. Admin `/admin/calls` lists sessions; `/admin/calls/[id]` shows transcript and a signed recording URL.
5. Progression: `callSessions` = sessions, `callsCompleted` = completed/partial sessions.

## 5. Tests

Unit: assistant config builder (variables, script), webhook parsing. Integration: gate enforcement (before date, exam required), session lifecycle, webhook idempotency, report ingestion with/without recording, RLS. E2E (fake): learner with an open bank stage starts and completes a simulated call, sees the transcript; admin reviews it; webhook POST without the secret is rejected, with the secret is accepted and idempotent.
