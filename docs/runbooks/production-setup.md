# Production setup runbook

Target: Vercel (Next.js) + Supabase (Postgres, Auth, Storage) + external providers. Everything below is done once per environment (staging, production). Keep secrets in the platform's secret store — never in git.

## 1. Supabase project

1. Create the project (region: Singapore `ap-southeast-1` — closest to Thailand). Note the project ref.
2. Link and push the schema from a machine with the repo:
   ```bash
   pnpm exec supabase link --project-ref <ref>
   pnpm exec supabase db push
   ```
   All ten migrations apply in order; buckets (`dbd-documents`, `study-materials`, `tts-cache`, `name-cards`, `recordings`) are created private by the migrations.
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
   | `NEXT_PUBLIC_APP_URL` | `https://<your-domain>` | builds the Vapi webhook URL |
   | `CRON_SECRET` | long random string | Vercel Cron sends it automatically as a bearer token |
   | `ANTHROPIC_API_KEY` | Anthropic key | DBD extraction and AI question authoring; `EXTRACTION_PROVIDER=off` / `QUESTION_GEN_PROVIDER=off` to disable either |
   | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | ElevenLabs | Thai read-aloud; `TTS_PROVIDER=off` to disable |
   | `TELEGRAM_BOT_TOKEN` | BotFather token | exam results + name cards to admin chats |
   | `RESEND_API_KEY`, `EMAIL_FROM` | Resend | exam result emails; sender domain must be verified in Resend |
   | `VAPI_PUBLIC_KEY` | Vapi *public* key | sent to the browser per call |
   | `VAPI_WEBHOOK_SECRET` | long random string | Vapi sends it as `x-vapi-secret` |
   | `VAPI_*` overrides | optional | transcriber/voice/LLM (see `.env.example`) |

   In production every adapter is **off** unless its key is present (never "fake"). The `/api/health` endpoint reports which provider each adapter resolved to.
3. Cron: `vercel.json` already schedules `/api/cron/notifications` every minute. Confirm it appears under Project → Settings → Cron Jobs after the first deploy.
4. Domain: attach `<your-domain>`; Supabase Site URL must match.
5. Deploy, then open `https://<your-domain>/api/health` — expect `ok: true`, `db: "ok"`, and the intended provider names.

## 3. External providers

### Anthropic (DBD extraction)
- Create a key with a monthly spend limit. Run the accuracy spike once on a real (non-committed) certificate: `node scripts/spike-extract.mts <pdf>` and record the result in `docs/decisions-log.md` (spike S4).

### ElevenLabs (Thai read-aloud)
- Pick a Thai-capable voice (`eleven_multilingual_v2`); set `ELEVENLABS_VOICE_ID`. Listen to one card via `/study/<key>` before opening to learners (spike S2).

### Telegram
- Create the bot with @BotFather; add it to the admin group; obtain the chat id (e.g. via `https://api.telegram.org/bot<token>/getUpdates` after a message in the group); put the ids into **Admin → Policy settings → Admin Telegram chat ids**.

### Resend
- Verify the sending domain; set `EMAIL_FROM` (e.g. `Portal <portal@<your-domain>>`); put recipients into **Admin → Policy settings → Admin notification emails**.

### Vapi (bank-call training)
- Create the account, copy the **public** key. The assistant is transient (built per call by the app), so no dashboard assistant is required; the webhook URL and `x-vapi-secret` header travel with each call config.
- Validate Thai end-to-end on a staging deploy before the pilot (spike S1): transcription language `th`, a Thai voice (defaults: Deepgram nova-2 + ElevenLabs multilingual; Azure `th-TH-PremwadeeNeural` is the fallback via `VAPI_VOICE_PROVIDER=azure`).
- Replace `PLACEHOLDER_BANK_OFFICER_SCRIPT` in `lib/integrations/vapi/config.ts` with the owner's approved script (open item #14).

## 4. Content before go-live

- Study cards in TH/EN/ZH (Admin → Study content), PDFs uploaded where used, Thai TTS enabled per card after review.
- Question bank: at least `quiz_question_count` + `exam_question_count` approved questions per pool, each with all three languages (the approval trigger enforces it). Fastest route: **Admin → Question bank → Generate with AI** from the study cards or your draft document, then review/approve the batch; Thai-only drafts get EN/ZH via **Fill missing languages**.
- Policy settings reviewed (`/admin/settings`): eligibility days, passing mark, counts, exam-pass gates, chat ids/emails.
- Name-card template: replace `placeholder-v1` in `lib/integrations/pdf/name-card.tsx` with the owner's design (open item #13) — one Thai layout, Sarabun font already embedded.

## 5. Smoke test after each deploy

1. `/api/health` → 200.
2. Admin login → create a test learner → create+confirm a DBD record with an issue date 46+ days ago → assign.
3. Learner login → dashboard shows the company and the bank date → open a study card → quiz → exam → name card PDF → bank call (real provider) → hang up → recording and transcript appear under Admin → Call training.
4. Admin → Notifications shows the exam-result rows as `sent`; Telegram/email received.
5. Delete the test learner (Admin → Users → disable, or SQL).
