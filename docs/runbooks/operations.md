# Operations runbook (pilot)

## Monitoring

| What | Where | Healthy looks like |
|---|---|---|
| App up + DB reachable | `GET /api/health` (poll every 1–5 min from an external uptime monitor) | `200 {"ok":true,"db":"ok"}`; providers show the intended names, not `off` |
| Notification queue | Admin → Notifications | no rows stuck in `failed`; `queued` rows clear within a minute (cron) |
| Webhook deliveries | `select * from webhook_events where error is not null order by received_at desc` | empty; `no matching session` means a call reached the webhook without a session (investigate the client attach step) |
| Call sessions | Admin → Call training | new sessions end in `completed`; `partial` = recording could not be fetched (provider URL kept in `metadata.provider_recording_url`) |
| Vercel | Project → Logs (filter `/api/cron`, `/api/webhooks`) and Runtime errors | no 5xx |
| Supabase | Project → Logs → Postgres / Auth; Reports → Database size, Storage | no RLS errors, storage growth in line with uploads/recordings |

Set the uptime monitor to alert on non-200 from `/api/health` for 3 consecutive checks.

## Routine

- **Daily (pilot weeks):** check the notification and call-session views above; look at Vercel error logs.
- **Weekly:** `pnpm audit --prod`; review `Admin → Audit log` for unexpected admin activity; confirm Supabase backups are running (Pro plan: daily, 7-day PITR optional).
- **Per policy change:** use `/admin/settings` only — direct SQL bypasses validation (the audit trigger still records it, with no actor).

## Incidents

| Symptom | First checks | Fix |
|---|---|---|
| Learners cannot log in | `/api/health` db status; Supabase Auth logs; account `status` in Admin → Users | disabled account → re-enable; Auth outage → wait/escalate to Supabase status |
| Exam results not delivered | Admin → Notifications: `failed` with `last_error` | fix key/chat id (`/admin/settings`), then **Requeue**; cron must be listed under Vercel → Cron Jobs |
| Bank call never connects | browser mic permission; `/api/health` → `vapi` must be `vapi`; Vercel logs for `/api/webhooks/vapi` 401s | 401 → `VAPI_WEBHOOK_SECRET` mismatch; `off` → key missing in Vercel env |
| Call ends but no transcript | `webhook_events` for that call id | `duplicate`/`applied` with `partial`: recording URL unreachable — download from Vapi dashboard manually if needed |
| Wrong bank date for a learner | `eligibility_snapshots` latest row for the user; DBD record `issued_on` | correct `issued_on` on the record (trigger recomputes) or the policy days in `/admin/settings` (recomputes for everyone) |
| Extraction refuses / hallucinates | provider `claude` in health; the review screen highlights unmatched fields | admin corrects fields before confirming — extraction never auto-confirms |

## Data handling

- DBD certificates, recordings and transcripts hold personal data. Buckets are private; access is by signed URL (≤10 min) and admin role only. Learner deletion cascades profiles → assignments/attempts/cards/sessions; storage objects must be removed by an admin (Supabase Storage UI) — retention automation is post-MVP (`retention_days` reserved).
- Never export `dbd_records` or transcripts to chat tools; use the admin UI.

## Rollback

- Vercel: promote the previous deployment (Deployments → ⋯ → Promote to Production). Migrations are additive; no migration in this release requires a down-step.
- Database: Supabase point-in-time restore (if enabled) or the daily backup; expect to lose data written after the restore point.
