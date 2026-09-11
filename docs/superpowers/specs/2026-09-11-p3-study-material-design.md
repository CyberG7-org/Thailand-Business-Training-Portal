# P3 — Study Material & Thai Read-Aloud (slice spec)

| Field | Value |
|---|---|
| Status | Drafted from the foundation spec; decisions logged in `docs/decisions-log.md` (D13–D16) |
| Date | 2026-09-11 |
| Builds on | Foundation spec §4.3 (content tables), §7 (localization), §8 (Thai read-aloud), §12, §13 |
| PRD | STUDY-001…005, QUIZ/EXAM read-aloud precedent, §6 language matrix, DASH-001 |

## 1. Scope

Learners open study material in their language (cards written in Markdown, or PDFs), the portal records viewed/completed status, and Thai content can be read aloud. Admins manage the content in all three languages without code changes.

Out of scope: quiz/exam (P4/P5), content import tooling beyond the seed convention below (the owner's drafts are imported by hand or by a follow-up script once their format is known).

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D13 | Card bodies are **Markdown** rendered with `react-markdown` (no raw HTML) | Owner-editable without code; safe by default |
| D14 | PDFs live in a private `study-materials` bucket, served by short-lived signed URLs after an assignment/active check | Spec §5, §13 |
| D15 | TTS provider default: **ElevenLabs** (`eleven_multilingual_v2`) when `ELEVENLABS_API_KEY` is set, otherwise `fake` outside production and `off` in production (`TTS_PROVIDER` overrides) | Same pattern as extraction; spike S2 decides ElevenLabs vs Google once a key exists |
| D16 | Progress: `viewed` is recorded on first open; `completed` is a learner action shown only when `policy_config.study_completion_tracking = "completed"` | STUDY-004 "configurable" |

## 3. Data (migration `20260911000005_study_material.sql`)

- `study_materials` — `id`, `content_key text unique`, `type text ('card','pdf')`, `sort_order int`, `active bool`, timestamps; audit trigger.
- `study_material_localizations` — `material_id`, `language`, `title`, `body` (markdown; cards), `file_path` (pdf), `tts_enabled bool default false`; unique `(material_id, language)`; audit trigger.
- `study_progress` — `user_id`, `material_id`, `first_viewed_at`, `last_viewed_at`, `completed_at nullable`; unique `(user_id, material_id)`.
- Buckets `study-materials` (private, PDF, 20 MB) and `tts-cache` (private, audio/mpeg).
- RLS: learners `select` active materials and their localizations; `select/insert/update` own `study_progress`; no writes to materials. Admins everything. Storage: admins full on both buckets; learners nothing direct (signed URLs from the server).
- Seed (`supabase/seed.sql`): three fictional sample cards in th/en/zh with `tts_enabled` on the Thai rows, clearly titled as samples, so the pilot UI has content on day one.

## 4. Admin (`/admin/content`)

List (key, type, sort, active, languages present); create/edit page with a tab per language: title, body (textarea) or PDF upload, `tts_enabled` (Thai row only). Active toggle. Missing languages are shown as such; a material with a missing translation renders a controlled "not available in this language" state for learners (spec §7) — no silent fallback.

## 5. Learner (`/study`, `/study/[key]`)

Dashboard stage card links to `/study`. The list shows active materials in the current locale (title; "not available in this language" where the localization is missing). Opening a material upserts `study_progress` (first/last viewed). Cards render Markdown; PDFs open via signed URL in an `<iframe>` with a download link. Thai locale + `tts_enabled` shows the read-aloud player. When completion tracking is `completed`, a "Mark as completed" button sets `completed_at`.

`loadProgressionFacts.studyOpened` becomes "any `study_progress` row".

## 6. Thai read-aloud

`GET /api/tts?material=<id>` (server route): requires a signed-in user; loads the Thai localization; refuses unless `active && tts_enabled`; computes `sha256(text + voiceId)`; if `tts-cache/<hash>.mp3` exists returns a 5-minute signed URL, else synthesizes via `TtsProvider.synthesize(text)`, uploads, then returns the URL. Only approved Thai text is ever synthesized (spec §6). Response `{ url }` or `{ error: 'not_available' | 'not_configured' | 'provider' }`.

`TtsProvider` — `{ name; synthesize(text: string): Promise<Uint8Array> }`. `ElevenLabsTts` (REST `POST /v1/text-to-speech/{voice}`, `eleven_multilingual_v2`, `ELEVENLABS_VOICE_ID`), `FakeTts` (returns a short valid MP3 frame sequence). Player component: play/pause/loading/error states with ARIA labels.

## 7. Tests

Unit: markdown-safe rendering is the library's job; test the TTS cache key and provider resolution. Integration: RLS on the three tables + two buckets; progress upsert; `tts-cache` write/read via the fake provider. E2E: admin creates a card in three languages → learner opens it (progress recorded, stage shows in progress) → Thai read-aloud button requests `/api/tts` and receives a URL → missing-language state for a card without `zh`.
