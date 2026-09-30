# Production setup runbook

Target: Vercel (Next.js) + Supabase (Postgres, Auth, Storage) + external providers. Everything below is done once per environment (staging, production). Keep secrets in the platform's secret store — never in git.

## 1. Supabase project

1. Create the project (region: Singapore `ap-southeast-1` — closest to Thailand). Note the project ref.
2. Link and push the schema from a machine with the repo:
   ```bash
   pnpm exec supabase link --project-ref <ref>
   pnpm exec supabase db push
   ```
   All migrations apply in order; buckets (`dbd-documents`, `study-materials`, `tts-cache`, `name-cards`) are created private by the migrations. A project that ran the voice call keeps an empty `recordings` bucket: delete it in the dashboard (Storage → recordings), since SQL may not remove storage rows.

   **Thai geography (P17a).** Migration `20261001010000_thai_geography.sql` is about 0.7 MB — the whole country (6 regions, 77 provinces, 930 districts, 7,436 subdistricts) from the pinned `kongvut/thai-province-data` dataset. It runs once and takes a few seconds longer than the others; regenerate it only with `pnpm geo:migration` when the pin changes.

   **Numbered accounts are renamed (D69).** On a project that already has managers and learners with the old codes, migration `20260930000000_typed_login_ids.sql` renames them as it applies: `T01` → `T-01`, `T01-01` → `T-01-01` (sign-in email included). The old code stops working at that moment. Before pushing, list who will be affected and tell each person their new login ID:
   ```sql
   select login_id as old_code, 't-' || substring(login_id from 2) as new_code, role, display_name
     from public.profiles
    where role in ('manager', 'learner') and login_id ~ '^t[0-9]+(-[0-9]+)?$'
    order by login_id;
   ```
3. **Do not** run `seed.sql` / `seed_questions.sql` in production (they hold sample content only). Load real content through the admin UI.
4. Auth settings (Dashboard → Authentication):
   - Providers → Email: enabled; **Confirm email: off** (accounts are provisioned by admins with `email_confirm`).
   - **Disable sign-ups** (Settings → "Allow new users to sign up" = off). Accounts are created only through `/admin/users`.
   - Site URL = `https://<your-domain>`; no redirect URLs are needed (password login only).
   - Password minimum length ≥ 10 (matches the admin form).
5. Create the first admin (SQL editor or CLI), then log in and use `/admin/users` for everyone else:
   ```sql
   -- run once; replace values
   select auth.admin_create_user(...) -- or use the dashboard "Add user" with
   -- app_metadata {"role":"admin"} and user_metadata {"login_id":"owner","display_name":"Owner","preferred_language":"th"}
   ```
   The `sync_profile_role_from_app_metadata` trigger promotes the profile as soon as `app_metadata.role = 'admin'` is set.
6. Copy from Settings → API: project URL, anon key, service-role key.

## 2. Vercel project

1. Import the repo; framework preset Next.js; install command `pnpm install --frozen-lockfile`; build `pnpm build`.
2. Environment variables (Production, and Preview if you run a staging copy):

   | Variable | Value | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | public |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key | public |
   | `SUPABASE_SERVICE_ROLE_KEY` | service-role key | **server only** — `pnpm check:secrets` guards the bundle |
   | `APP_INTERNAL_EMAIL_DOMAIN` | e.g. `learner.<your-domain>` | maps login ids to auth emails; never receives mail |
   | `CRON_SECRET` | long random string | Vercel Cron sends it automatically as a bearer token |
   | `ANTHROPIC_API_KEY` | Anthropic key | DBD extraction and AI question authoring; `EXTRACTION_PROVIDER=off` / `QUESTION_GEN_PROVIDER=off` to disable either |
   | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | ElevenLabs | Thai read-aloud; `TTS_PROVIDER=off` to disable |
   | `TELEGRAM_BOT_TOKEN` | BotFather token | exam results + name cards to admin chats |
   | `RESEND_API_KEY`, `EMAIL_FROM` | Resend | exam result emails; sender domain must be verified in Resend |
   | `INTERVIEW_PROVIDER` | `claude` | the AI bank officer of the readiness interview (Sonnet 5 turns, Opus 5 narrative) on the same `ANTHROPIC_API_KEY` |
   | `CATEGORY_MAP_PROVIDER` | `claude` (or unset with the Anthropic key) | maps `nature_of_business` to a business category (P17a) on the same `ANTHROPIC_API_KEY`; `off` to disable — the record page then asks a person to choose |
   | `PINECONE_API_KEY`, `PINECONE_NAMESPACE` | Pinecone key; namespace `production` (staging: `staging`) | DBD retrieval index (P14); `VECTOR_PROVIDER=off` to disable; optional `PINECONE_INDEX`, `PINECONE_REGION`, `TRANSCRIPTION_MODEL`, `TRANSCRIBE_SLICE_PAGES` |
   | `DIRECT_READ_MAX_PAGES` | optional, default 20 | documents with more pages are never sent whole to the model; they fill in from their transcripts once indexed (P14c); with `VECTOR_PROVIDER=off` documents travel whole up to 100 pages instead |
   | `TRANSCRIPT_SWEEP_PAGES` | optional, default 10 | transcript pages per list-sweep call when filling a record from an oversized document (P14c); lower it if sweeps report `too_large` |

   In production every adapter is **off** unless its key is present (never "fake"). The `/api/health` endpoint reports which provider each adapter resolved to.
3. Cron: `vercel.json` schedules `/api/cron/notifications` and `/api/cron/index` every minute. Confirm both appear under Project → Settings → Cron Jobs after the first deploy.
4. Node.js: Project → Settings → General → Node.js Version = **22.x** (the Pinecone SDK requires Node ≥ 22).
5. Domain: attach `<your-domain>`; Supabase Site URL must match.
6. Deploy, then open `https://<your-domain>/api/health` — expect `ok: true`, `db: "ok"`, and the intended provider names.

## 3. External providers

### Anthropic (DBD extraction)
- Create a key with a monthly spend limit. Run the accuracy spike once on a real (non-committed) certificate: `node scripts/spike-extract.mts <pdf>` and record the result in `docs/decisions-log.md` (spike S4).

### ElevenLabs (Thai read-aloud)
- Pick a Thai-capable voice (`eleven_multilingual_v2`); set `ELEVENLABS_VOICE_ID`. Listen to one card via `/study/<key>` before opening to learners (spike S2).

### Telegram
- Create the bot with @BotFather; add it to the admin group; obtain the chat id (e.g. via `https://api.telegram.org/bot<token>/getUpdates` after a message in the group); put the ids into **Admin → Policy settings → Admin Telegram chat ids**.

### Resend
- Verify the sending domain; set `EMAIL_FROM` (e.g. `Portal <portal@<your-domain>>`); put recipients into **Admin → Policy settings → Admin notification emails**.

### Pinecone (DBD retrieval index)

1. Create a Pinecone project; note the API key. Starter plan = AWS us-east-1 only; Singapore (ap-southeast-1) needs the Builder plan.
2. Locally: put `PINECONE_API_KEY=…` in `.env.local` and run `pnpm vector:setup` once (creates `thai-portal-dbd` with integrated embedding; idempotent). `pnpm vector:smoke` proves search + rerank work.
3. Vercel env vars: `PINECONE_API_KEY`, `PINECONE_NAMESPACE=production` (staging uses `staging`), optionally `PINECONE_INDEX`, `PINECONE_REGION`, `TRANSCRIPTION_MODEL`, `TRANSCRIBE_SLICE_PAGES`. Redeploy; `/api/health` shows `vector: "pinecone"`.
4. Every document uploaded before this step shows *Not indexed*; open its record and click **Re-index**.
5. After an upload the fields fill in within about 1–3 minutes (D46: the cron reads the pack; reload the record page) — the page says *reading in the background* meanwhile.
6. Uploads never pass through Vercel (D45): the browser sends each PDF straight to the `dbd-documents` bucket, so the `NEXT_PUBLIC_SUPABASE_URL` must be reachable from admins' browsers (it is, by design) and the bucket's `file_size_limit` (30 MB) is the only size cap.

### Readiness interview (the AI bank assessor)
- No extra account: the interview runs on the Anthropic key already set for extraction. Set `INTERVIEW_PROVIDER=claude` (or leave it unset with the key present); the suites force `fake`.
- On a project that ran the voice call, delete the `VAPI_*` and `NEXT_PUBLIC_APP_URL` variables in Vercel and the empty `recordings` bucket in Supabase — the call is gone (D64).
- Have the owner read a real session's transcript on staging (Admin → Readiness interviews) before the pilot: the persona lives in `lib/integrations/interview/claude.ts`.

## 4. Content before go-live

- Study cards in TH/EN/ZH: run `pnpm content:starter` once with the environment's `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (five cards built around the 16 questions the bank asks; safe to run again — existing cards are left alone). There is no staff screen for study cards (D81).
- Per DBD record: fill the **Level 4 — interview answers** form (why the account, monthly volume, clients, suppliers, source of funds, actual place of business, operations status). Per learner (Admin → Learner Record → their Login ID): fill the **role** form (name exactly as in the DBD documents, position, responsibilities, relationship to the other shareholders) so `{my_shares}`, `{my_position}` … resolve on cards, questions and the call script.
- Question bank: at least `quiz_question_count` + `exam_question_count` approved questions per pool, each with all three languages (the approval trigger enforces it). Fastest route: **Admin → Question bank → Generate with AI** — pick one of your confirmed DBD records as the reference (upload the certificate plus the objectives sheet / บอจ.5 / บอจ.2 on the record first so Level 2 facts are available), generate a personalised batch, then review/approve; Thai-only drafts get EN/ZH via **Fill missing languages**. When the reference record's documents show *Ready*, the batch is grounded in retrieved passages and each draft lists its source pages; index the record first (Re-index on the record page) for big packs.
- Packs over 20 pages fill in after the index is ready (about a minute per 5 pages, then a sweep per 10 pages of each typed document); the record page says so and the fields appear on reload. **Read the document again** re-reads the small documents now and queues the oversized ones for the background.
- Policy settings reviewed (`/admin/settings`): eligibility days, passing mark, counts, exam-pass gates, chat ids/emails.
- Name-card template: replace `placeholder-v1` in `lib/integrations/pdf/name-card.tsx` with the owner's design (open item #13) — one Thai layout, Sarabun font already embedded.

## 5. Smoke test after each deploy

1. `/api/health` → 200.
2. Admin login → create a test learner → create+confirm a DBD record with an issue date 46+ days ago → assign.
3. Learner login → dashboard shows the company and the bank date → open a study card → quiz → exam → name card PDF → readiness interview (real officer) → a verdict and its debrief → the session appears under Admin → Readiness interviews.
4. Admin → Notifications shows the exam-result rows as `sent`; Telegram/email received.
5. Upload a multi-page PDF to a record → the document shows *Queued* → within two minutes *Ready (N pages)* → **Ask the documents** returns a page-cited answer.
6. Delete the test learner (Admin → Learner Record → their Login ID → disable, or SQL).
