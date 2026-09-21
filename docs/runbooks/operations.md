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
| Fields stay empty after an upload | the record page's reading line: *reading in the background* = the `extract` job is queued/running (cron every minute, one model call of up to 140 s); *could not be read (reason)* = the job failed | `not_allowed` = the record is confirmed; `no_document`/`too_large` = fix the files; other reasons retried automatically (1–16 min backoff, 5 attempts) — **Read the document again** queues a fresh job. Query: `select kind, status, attempts, last_error from index_jobs where record_id = … order by created_at desc` |
| Upload fails with "could not be uploaded" | browser console for the PUT to `<supabase>/storage/v1/object/upload/sign/dbd-documents/…`; Supabase Storage logs | 413 from Storage → file over the bucket's 30 MB limit; 400 → not `application/pdf`; the file never passes through Vercel (D45), so a 413 from a Vercel function means a stale deployment |

### Index stuck or failed

- Status stays *Queued*: check Vercel → Cron Jobs → `/api/cron/index` runs every minute and returns 200; `CRON_SECRET` must be set.
- *Failed* with `unreadable_pdf`: the file is not a standard PDF (encrypted/corrupt) — re-export and upload again.
- *Failed* with "missing page": the model skipped pages twice; click **Retry**. Persistent failures on scans: set `TRANSCRIPTION_MODEL=claude-opus-5` and retry.
- Pinecone down: jobs back off (1–16 min) and resume by themselves; uploads keep working.
- Index *Ready* but the record's fields stay empty (a pack over 20 pages): the fill is a `transcript` job on the same queue (`index_jobs.kind = 'transcript'`; `next_page` 1 = particulars still to read). It runs a sweep per `TRANSCRIPT_SWEEP_PAGES` pages and caches each batch in `dbd_sweeps`, so a run cut by the 300 s limit continues next minute. Check `select status, attempts, last_error from index_jobs where kind = 'transcript' and record_id = …`; a `failed` one is re-queued by **Read the document again**. A sweep `too_large` error means one batch of rows did not fit the model's output: lower `TRANSCRIPT_SWEEP_PAGES`.
- A record confirmed while the fill runs takes nothing from it; nothing an admin typed is overwritten (each field is written only while still empty).
- Deleting a record with SQL leaves its vectors behind — remove its documents from the record page first.

## Data handling

- DBD certificates, recordings and transcripts hold personal data. Buckets are private; access is by signed URL (≤10 min) and admin role only. Learner deletion cascades profiles → assignments/attempts/cards/sessions; storage objects must be removed by an admin (Supabase Storage UI) — retention automation is post-MVP (`retention_days` reserved).
- Never export `dbd_records` or transcripts to chat tools; use the admin UI.

## Rollback

- Vercel: promote the previous deployment (Deployments → ⋯ → Promote to Production). Migrations are additive; no migration in this release requires a down-step.
- Database: Supabase point-in-time restore (if enabled) or the daily backup; expect to lose data written after the restore point.
