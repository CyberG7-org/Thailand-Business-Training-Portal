# P9 — Admin settings, audit views, hardening

| | |
|---|---|
| Builds on | Foundation spec §4.6 (policy_config), §13 (security checklist), P1–P8 slices |
| Status | Implemented |

## 1. Scope

1. **Policy settings UI** (`/admin/settings`): every `policy_config` key editable with a typed control; server-side validation; changes audited (existing trigger) and, for the two bank keys, eligibility snapshots recomputed for every active assignment.
2. **Audit log view** (`/admin/audit`): newest-first list with entity/actor filters and a before/after diff; deep links from record and user pages.
3. **Security hardening**: response headers, an IDOR sweep (integration + E2E), a written checklist with the verdict per item.
4. Admin screens completion: nothing else was missing after P8 (users: create/reset/disable/assign; records; content; questions; notifications requeue; calls).

## 2. Decisions

- **D30** Policy edits go through the admin's own session (RLS `policy: admins do everything`) so the audit trigger records the real actor — not the service role.
- **D31** Changing `bank_eligibility_days` or `bank_access_expiry_days` appends a new `eligibility_snapshots` row (`reason = 'policy_changed'`) for every active assignment; history is never rewritten.
- **D32** Settings validation lives in `lib/config/policy-schema.ts` (zod) and is the single source for types, defaults, and form controls.

## 3. Data (migration `20260911000010_policy_recompute.sql`)

- `recompute_eligibility_snapshots(p_reason text)` — security definer; loops over active assignments and calls `compute_eligibility_snapshot`.
- Trigger `policy_config_eligibility_recompute` after update of `value` on `policy_config` for keys `bank_eligibility_days` / `bank_access_expiry_days` when the value changed.
- `audit_logs` gains an index on `(actor_id, created_at desc)`; `audit_logs_with_actor` view (security invoker) joins the actor's `login_id`.

## 4. Flow

1. `/admin/settings` renders one form per key (number, nullable number, boolean, enum select, list textarea). `updatePolicyAction(key, raw)` parses with the key's zod schema, upserts with the cookie client, `revalidatePath` on admin + dashboard.
2. `/admin/audit?entity=&id=&actor=` lists 100 rows; each row expands to a JSON diff (changed keys only).
3. `next.config.ts` sets `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), geolocation=(), microphone=(self)` (microphone stays available for the bank call).

## 5. Tests

- Unit: policy schema parses/rejects per key.
- Integration: learner cannot read/write `policy_config`; policy change recomputes snapshots; audit rows carry the admin actor.
- E2E: admin changes `require_exam_pass_for_bank_call` → learner dashboard unlocks; audit page shows the change; learner cannot open another learner's quiz attempt, exam result, or call session (404), nor admin routes.

## 6. Security checklist (verdicts in `docs/security-checklist.md`)
