# Operations runbook (pilot)

## Monitoring

| What | Where | Healthy looks like |
|---|---|---|
| App up + DB reachable | `GET /api/health` (poll every 1–5 min from an external uptime monitor) | `200 {"ok":true,"db":"ok"}`; providers show the intended names, not `off` |
| Notification queue | Admin → Notifications | no rows stuck in `failed`; `queued` rows clear within a minute (cron) |
| Interview sessions | Admin → Readiness interviews | sessions end `completed` with a verdict; `abandoned` = idle over 30 minutes, no verdict; a run of `not_configured` errors means the provider resolved to `off` |
| Appointments | Admin → Bank appointments | managers see their learners and a month calendar; an eligible learner has one upcoming date, with no time slot; the Owner can review and cancel bookings |
| Vercel | Project → Logs (filter `/api/cron` and the `/interview` server actions) and Runtime errors | no 5xx |
| Supabase | Project → Logs → Postgres / Auth; Reports → Database size, Storage | no RLS errors, storage growth in line with uploads |

Set the uptime monitor to alert on non-200 from `/api/health` for 3 consecutive checks.

## Routine

- **Daily (pilot weeks):** check the notification and call-session views above; look at Vercel error logs.
- **Weekly:** `pnpm audit --prod`; review the audit log for unexpected admin activity — there is no screen (D81): `select created_at, actor_login_id, action, entity_type, entity_id from audit_logs_with_actor order by created_at desc limit 200;` in the Supabase SQL editor; confirm Supabase backups are running (Pro plan: daily, 7-day PITR optional).
- **Per policy change:** use `/admin/settings` only — direct SQL bypasses validation (the audit trigger still records it, with no actor).

## Incidents

| Symptom | First checks | Fix |
|---|---|---|
| Learners cannot log in | `/api/health` db status; Supabase Auth logs; account `status` on the learner's page (Admin → Learner Record → their Login ID) | disabled account → re-enable; Auth outage → wait/escalate to Supabase status |
| Exam results not delivered | Admin → Notifications: `failed` with `last_error` | fix key/chat id (`/admin/settings`), then **Requeue**; cron must be listed under Vercel → Cron Jobs |
| Interview will not start | `/api/health` → `interview` must be `claude` (staging/production) or `fake` (local); Vercel runtime logs for the `/interview` actions | `off` → `ANTHROPIC_API_KEY` missing in Vercel env; a model error surfaces to the learner as "something went wrong" and the session stays resumable for 30 minutes |
| Wrong bank date for a learner | `eligibility_snapshots` latest row for the user; DBD record `issued_on` | correct `issued_on` on the record (trigger recomputes) or the policy days in `/admin/settings` (recomputes for everyone) |
| Extraction refuses / hallucinates | provider `claude` in health; the review screen highlights unmatched fields | admin corrects fields before confirming — extraction never auto-confirms |
| Fields stay empty after an upload | the record page's reading line: *reading in the background* = the `extract` job is queued/running (cron every minute, one model call of up to 140 s); *could not be read (reason)* = the job failed | `not_allowed` = the record is confirmed; `no_document`/`too_large` = fix the files; other reasons retried automatically (1–16 min backoff, 5 attempts) — **Read the document again** queues a fresh job. Query: `select kind, status, attempts, last_error from index_jobs where record_id = … order by created_at desc` |
| Upload fails with "could not be uploaded" | browser console for the PUT to `<supabase>/storage/v1/object/upload/sign/dbd-documents/…`; Supabase Storage logs | 413 from Storage → file over the bucket's 30 MB limit; 400 → not `application/pdf`; the file never passes through Vercel (D45), so a 413 from a Vercel function means a stale deployment |
| A learner’s study card shows “—” for their name or their shares | The learner’s page, *The learner’s role in the company*: the company has several directors and nobody picked which one the learner is, or no director has been read from the documents yet (D95) | pick the person from the list and save; with one director it fills itself. Position, responsibilities and relationship are the same for every learner and need nothing |
| Thai words on a record have lost their marks (หมูที่, ผูถือหุน, a name without its ์) | The record was read before 2026-10-02, when the reader dropped the marks a certificate’s font hides (D92) | **Read the document again** on the record: a value that is the new reading with marks missing is replaced, nothing a person typed is touched. **Check again** alone already repairs the address from the geography tables |
| A learner cannot start the Business Knowledge Quiz: *not ready for your company yet* | The record’s **Exceptions** tab: a *Question could not be made* notice names each concept the quiz could not ask (D100). Either the bank has no approved question for it (Owner → Question bank: the concept reads *no approved variant*), or the company lacks what the question needs — most often the business category, or an amount written in words | approve a question for the concept, or complete the record (set the category; write the amount in digits). *Check a company* on the Question bank page shows what can be asked. The notice closes itself when a quiz starts |
| A name on a record is wrong although the document prints it clearly (a shareholder with a wrong letter) | The shareholder list has no text behind its names; they are read from a picture of the page (D98). `/api/health` → `pdfRender` must be `ok`; `failed` means the deployment cannot draw pages and every pack is read without pictures | correct the name by hand on the record from the document, or delete the record and upload the pack again. **Read the document again** does not replace it: a re-read only restores lost marks |
| Address panel says a part is missing although the address is printed | The head office address on the record: it must hold the whole line (เลขที่ … ตำบล/แขวง … อำเภอ/เขต … จังหวัด …). Text copied from a PDF is put in keyboard spelling on save (D89) | **Check again** on the record page re-reads the address; if a part is still missing, the place name is not in the geography tables as printed — correct the spelling in the head office address and save |
| *Transactions per month* is listed as missing on a record | A record without invoices: monthly revenue and the average amount per transaction on the *Bank interview* tab are typed, and one has no amount in digits ("สามแสนบาท", "3 แสน", "300k") | write it as a number (300,000 บาท) and save; or upload the company's invoices on the *Documents* tab — the figures are then worked out from them and nothing is typed (D101) |
| A zip is refused at upload (*no DBD document*, *too many files*, *a file is too large*, *the zip cannot be opened*) | The browser sorts the zip before anything is sent (D101): it needs at least one PDF outside the invoice and agreement folders, at most 40 files and 200 MB, 30 MB a PDF, and a zip it can open (not password-protected, not a 7z or rar renamed) | fix the zip and choose it again; the preview under the file box says what it found (pack / invoices / agreements / addresses) before *Create* |
| *Check this invoice* on an invoice row of the *Documents* tab | The invoice read set it aside: not an invoice, no date, no total, not in baht, or the items do not add up to the total (D101); the figures are worked out from the rest and an exception says so | open the PDF: a proper invoice the reader misread → **Read the invoices again**; not an invoice → remove it. Fewer than three usable invoices also shows *estimated from N invoices* on the *Bank interview* tab — add more |
| The invoice figures on the *Bank interview* tab look wrong | They are arithmetic on the rows the reader copied (total ÷ days with an invoice × 30, and so on; D101) and cannot be typed over; an invoice missing from the zip, a duplicate, or a misread total moves them | add or remove invoices on the *Documents* tab and **Read the invoices again**; the learner's material follows on the next version |
| The invoices stay *being read in the background* | the `invoices` job on the index queue (cron every minute): `index_jobs` where `kind = 'invoices'` for the record | `failed` with `last_error` → **Read the invoices again** on the *Documents* tab; `queued` for long → the cron is not running (Vercel → Cron Jobs) |
| A manager cannot book a learner's bank appointment | Admin → Learner Record: the Business Knowledge Quiz and Bank Readiness Interview must both read **Pass**; confirm the learner belongs to the signed-in manager and the chosen Bangkok date is today or later | complete the missing evaluation, switch to the learner's owning manager, or choose today/a future date; then open **Bank appointments**, select the learner and date. Choosing a new date replaces the existing booking (D102) |
| Category stays "no category yet" | `/api/health` → `categoryMap` must be `claude` (staging/production) or `fake` (local); the record page's category panel says why (no business text, mapping switched off, empty category list, mapper failed) | choose the category on the record page (it holds until the business text changes) or **Map again**; the best match is always taken (D90), so a wrong mapping is corrected by choosing the category by hand |
| A learner sees old company facts | the record page's *Training versions* panel: which version is active and how many learners are behind; the learner page: *On version n* | *Move to version n* on the learner page (not while a quiz, exam or interview is open); the facts a learner studies never change without that move (D75) |
| A record is not accepted / a company has no training version | the record page's *Exceptions* panel (what blocks acceptance, what blocks the version); the queue at Admin → Exceptions | supply the missing fact, correct the value, or settle the exception with a note; acceptance and the version follow by themselves; the thresholds are in Settings (default 95 / 75) |
| A concept shows *no approved variant*, or a variant *cannot be asked* of a company | Admin → Question bank: the concept row lists its cases; a variant page previews it against any company with a training version; *Check a company* lists all thirty concepts for one company with the reason beside each | write or approve a variant for the missing case; supply the missing fact or map the business category on the company’s record; a variant whose options collide for one company yields to the next approved variant of that concept |

### Index stuck or failed

- Status stays *Queued*: check Vercel → Cron Jobs → `/api/cron/index` runs every minute and returns 200; `CRON_SECRET` must be set.
- *Failed* with `unreadable_pdf`: the file is not a standard PDF (encrypted/corrupt) — re-export and upload again.
- *Failed* with "missing page": the model skipped pages twice; click **Retry**. Persistent failures on scans: set `TRANSCRIPTION_MODEL=claude-opus-5` and retry.
- Pinecone down: jobs back off (1–16 min) and resume by themselves; uploads keep working.
- Index *Ready* but the record's fields stay empty (a pack over 20 pages): the fill is a `transcript` job on the same queue (`index_jobs.kind = 'transcript'`; `next_page` 1 = particulars still to read). It runs a sweep per `TRANSCRIPT_SWEEP_PAGES` pages and caches each batch in `dbd_sweeps`, so a run cut by the 300 s limit continues next minute. Check `select status, attempts, last_error from index_jobs where kind = 'transcript' and record_id = …`; a `failed` one is re-queued by **Read the document again**. A sweep `too_large` error means one batch of rows did not fit the model's output: lower `TRANSCRIPT_SWEEP_PAGES`.
- A record confirmed while the fill runs takes nothing from it; nothing an admin typed is overwritten (each field is written only while still empty).
- Deleting a record with SQL leaves its vectors behind — remove its documents from the record page first.

## Data handling

- DBD certificates and interview transcripts hold personal data. Buckets are private; access is by signed URL (≤10 min) and admin role only. Learner deletion cascades profiles → assignments/attempts/cards/sessions; storage objects must be removed by an admin (Supabase Storage UI) — retention automation is post-MVP (`retention_days` reserved).
- Never export `dbd_records` or transcripts to chat tools; use the admin UI.

## Rollback

- Vercel: promote the previous deployment (Deployments → ⋯ → Promote to Production). Migrations are additive; no migration in this release requires a down-step.
- Database: Supabase point-in-time restore (if enabled) or the daily backup; expect to lose data written after the restore point.
