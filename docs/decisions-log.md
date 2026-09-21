# Decisions Log

Running log of business and product decisions that the PRD left open (TBD) or that
surfaced during design. Engineering must not invent rules that are not recorded here
or in `policy_config` (PRD section 24).

| Date | # | Decision | Decided by | Where it lives |
|---|---|---|---|---|
| 2026-09-11 | D1 | Product owner decides all TBDs directly (no external client) | Owner | this log |
| 2026-09-11 | D2 | DBD Issue Date = certificate "Issued on" date, not company registration date | Owner | `dbd_records.issued_on`, spec section 6.1 |
| 2026-09-11 | D3 | DBD import = PDF upload + AI extraction + admin review; manual form ships first | Owner | spec section 11 |
| 2026-09-11 | D4 | Questions = hybrid (DBD-slot templates + approved bank); AI-generated needs admin approval | Owner | spec section 4.3 / 9 |
| 2026-09-11 | D5 | Study material + question bank exist as drafts; name card design + call script to be created | Owner | P3/P4 seed, P6/P8 placeholders |
| 2026-09-11 | D6 | Target: ASAP small pilot | Owner | spec section 2 |
| 2026-09-11 | D7 | Stack: Next.js + Supabase + Vercel | Owner | spec section 3 |
| 2026-09-11 | D8 | Chinese = Simplified (zh-CN) | Owner | locale `zh` |
| 2026-09-11 | D9 | Exam pass not required for name card; required for bank-call training (pilot defaults) | Owner | `policy_config` |
| 2026-09-11 | D10 | Notifications: Telegram -> admin chat; Email -> admin recipients via Resend; no learner copies | Owner | `policy_config` |
| 2026-09-11 | D11 | Vapi call modality and configuration deferred to the P8 spec | Owner | P8 spec |
| 2026-09-11 | D12 | Business-facing "today" = Asia/Bangkok; dates stored as `date`, instants as UTC | Design | `lib/domain/thai-date.ts` |

## Still open (safe defaults in `policy_config` until confirmed)

| PRD open item | Default until confirmed | Confirm before |
|---|---|---|
| #4/#5 quiz / exam question counts | 10 / 20 | P4 / P5 UAT |
| #6 exam passing mark | 70% | P5 UAT |
| #7 exam retry policy | unlimited, no wait | P5 UAT |
| #10 name card design + field mapping | placeholder template | P6 |
| #13 bank access expiry | none | P10 |
| #14 bank call script | placeholder script (draft to be proposed) | P8 |
| #15 automatic call scoring | off | post-MVP |
| #16 repeat calls | unlimited | P8 |
| #17 admin roles | single `admin` role | post-MVP |
| #18 retention | none automated; `retention_days` reserved | before production |

## Slice decisions (made by Claude within the foundation guardrails; owner may revise)

| Date | # | Decision | Where it lives |
|---|---|---|---|
| 2026-09-11 | D13 | Study cards are Markdown rendered with react-markdown (no raw HTML) | P3 spec |
| 2026-09-11 | D14 | Study PDFs in a private `study-materials` bucket served by signed URLs | P3 spec |
| 2026-09-11 | D15 | TTS default ElevenLabs when a key exists, otherwise fake (dev) / off (prod); `TTS_PROVIDER` overrides | P3 spec, `lib/integrations/tts` |
| 2026-09-11 | D16 | Study progress: viewed on first open; "completed" only when `study_completion_tracking = "completed"` | P3 spec |
| 2026-09-11 | D17 | Question personalization via `{field}` placeholders with deterministic variant distractors (`|x2`, `|+1m`, `|shuffle`) | P4 spec, `lib/domain/assessment` |
| 2026-09-11 | D18 | Learners never read questions or write attempts/answers directly; server actions do it with the service role after ownership checks | P4 spec, migration 0006 |
| 2026-09-11 | D19 | Only approved, active, pool-matching questions whose placeholders resolve on the confirmed record are selectable | P4 spec |
| 2026-09-11 | D20 | One in-progress attempt per kind, resumed on reopen; quiz retries unlimited (policy seam) | P4 spec |
| 2026-09-11 | D21 | Exam result page shows score, pass/fail and wrong questions, not the correct answers | P5 spec |
| 2026-09-11 | D22 | Telegram/Email enabled by TELEGRAM_BOT_TOKEN / RESEND_API_KEY; fake in dev, off in prod; destinations from policy_config | P5 spec, `lib/integrations/notify` |
| 2026-09-11 | D23 | Cron route guarded by CRON_SECRET; leased claims, 5 attempts with backoff, admin requeue | P5 spec, migration 0007 |
| 2026-09-11 | D24 | Name card placeholder template `placeholder-v1`: company (TH/EN), holder = learner display name or first director, title "กรรมการผู้มีอำนาจลงนาม", address, phone, juristic id; Sarabun font (OFL) embedded; 90×54 mm | `lib/integrations/pdf/name-card.tsx` |
| 2026-09-11 | D25 | Name card requires company_name_th + head_office_address on the record; Telegram delivery goes through the notification queue as a document | P6, `lib/db/name-cards.ts` |
| 2026-09-11 | D26 | Call modality for the pilot: in-browser via @vapi-ai/web with a transient assistant; phone stays a later option | P8 spec |
| 2026-09-11 | D27 | VAPI_PROVIDER=vapi/fake/off; fake modality completes sessions with a canned Thai transcript for tests | P8 spec |
| 2026-09-11 | D28 | Vapi webhook authenticated by x-vapi-secret; events ledgered in webhook_events; recordings copied to a private bucket | P8 spec |
| 2026-09-11 | D29 | A session is `completed` only with both transcript and stored recording; `partial` with one of them (provider URL kept in metadata); the bank stage counts `completed`/`partial` as done | P8, `lib/db/calls.ts` |
| 2026-09-11 | D30 | Policy edits go through the admin's own session (RLS) so the audit trigger records the real actor | P9, `lib/db/settings.ts` |
| 2026-09-11 | D31 | Changing `bank_eligibility_days` / `bank_access_expiry_days` appends a `policy_changed` eligibility snapshot for every active assignment; history is never rewritten | migration 0010 |
| 2026-09-11 | D32 | Settings validation and form controls come from one zod map (`lib/config/policy-schema.ts`); further practice calls stay allowed after the bank stage is done, capped only by `call_max_sessions` | P9 |
| 2026-09-18 | D33 | AI question authoring: one adapter (`lib/integrations/question-gen`) for generation + translation, `QUESTION_GEN_PROVIDER=claude|fake|off`, model `claude-opus-5` with zod structured output; inspired by CourseCred's admin generator | P11 spec |
| 2026-09-18 | D34 | Generated questions are validated in code (4 options A–D, shared correct key, known placeholders identical across languages, template questions must use a field); malformed ones are rejected and counted, never repaired | `lib/integrations/question-gen/validate.ts` |
| 2026-09-18 | D35 | Material = selected study cards (Thai body preferred) + pasted text + DOCX/TXT/MD text (60k chars cap) or a PDF as a document block; batches store a summary, not the material; everything lands as `draft` + `source: ai_generated` | `lib/db/question-gen.ts` |
| 2026-09-18 | D36 | Generated questions are grounded in the DBD certificate: every run receives a PII-free description of the หนังสือรับรอง (header, items 1–6, footer) and, by default, a confirmed record chosen as the reference (its particulars + stored PDF). All questions default to personalised `dbd_template`; any question containing a literal reference value (names, juristic id, address, capital, certificate no.) is rejected so shared questions never carry one learner's data | `lib/integrations/question-gen/dbd-reference.ts` |
| 2026-09-18 | D37 | Uploading a certificate creates the record and fills its empty fields from the extraction automatically (values the admin typed are never overwritten; individually invalid values are dropped and reported); confirmation stays an explicit admin step; re-extract fills empty fields only | `lib/domain/extraction-merge.ts`, `lib/db/extraction.ts` |
| 2026-09-18 | D38 | Three-level DBD extraction (owner's structure): Level 1 identity → columns (+`province`); Level 2 business profile (objectives, categories, share structure, shareholders, promoters) → `structured_data.business`, editable as line lists; Level 3 document metadata → columns + per-field provenance (document, page, confidence) in `structured_data.provenance`. A record holds several DBD PDFs (certificate, objectives sheet, บอจ.5, บอจ.2) read in one model pass; absent documents leave fields empty. New placeholders `{province} {objectives} {business_categories} {shareholders} {promoters} {total_shares} {par_value}` | migration 0013, `lib/integrations/extraction/schema.ts` |
| 2026-09-18 | D39 | The bank interview drives the curriculum: 16 concepts (identity, ownership, business plan, personal role) in `lib/domain/bank-interview.ts` are the shared source for study cards, AI quiz/exam generation and the call script. Facts the DBD cannot supply are Level 4 interview answers on the record (`structured_data.interview`, editable after confirmation) plus the learner role on the assignment (name as in the DBD, position, responsibilities, relationship; migration 0014); `my_shares`/`my_share_percent` derive from the role name matched against Level 2 shareholders. Five starter study cards ship in code and are loaded once from Admin → Study content | P13 spec, `lib/domain/bank-interview.ts` |
| 2026-09-21 | D40 | DBD packs are indexed in Pinecone (integrated embedding `multilingual-e5-large`, rerank `bge-reranker-v2-m3`): one namespace per environment, `record_id` metadata filter, deterministic chunk ids `<document_id>#<page>#<n>` mirrored in `dbd_chunks`; `VECTOR_PROVIDER=pinecone\|fake\|off` with a trigram-scoring fake. Chunk text (names, addresses, ID numbers) therefore lives at Pinecone — a new processor (US region on the Starter plan) | P14 spec, `lib/integrations/vector` |
| 2026-09-21 | D41 | Packs are read once, in 5-page slices, by a cron-driven job (`index_jobs`, leased claims, 5 attempts with backoff); Claude Sonnet 5 transcribes pages to plain text with `=== PAGE n ===` markers; `dbd_pages` is the source of truth and chunks never cross pages | migration 0015, `lib/db/dbd-index.ts` |
| 2026-09-21 | D44 | Admins get "Ask the documents": retrieval over the record's index plus an answer grounded only in the retrieved passages, each cited with document and page; learners will see passages of their own record only (P14b) | `app/[locale]/(admin)/admin/dbd-records/[id]/ask-documents.tsx` |
| 2026-09-21 | D43 | Question generation retrieves passages of the reference record per bank-interview concept group (one query per group, top 4, deduplicated) and sends them instead of the whole PDF; the model cites passage numbers which are stored as `questions.source_refs` (document, page) and shown on the review list. Records without an index keep the old path, attaching the PDF only when its first document is ≤ `DIRECT_READ_MAX_PAGES` (20); learners see the best three passages of their own record under each bank-interview card | migration 0016, `lib/db/passages.ts`, `lib/integrations/question-gen/passages.ts` |
