# P11 — AI question authoring (generate + translate into the bank)

| | |
|---|---|
| Builds on | P4 question bank (`questions`, `question_localizations`, approval trigger), extraction adapter pattern (P1.5) |
| Inspiration | CourseCred `/admin/generate` + editor "AI add" (CyberG7-org/CourseCred): topic + knowledge base → structured output → review status → publish |
| Status | Implemented |

## 1. Scope

1. **Batch generation** (`/admin/questions/generate`): admin picks source material (existing study cards, pasted text, an uploaded PDF/DOCX/TXT/MD), a count, how many should be DBD-template questions, pools and difficulty. One model call returns every question in **TH, EN and ZH at once**. Everything is inserted as `approval_status = 'draft'`, `source = 'ai_generated'`, grouped by a `question_generation_batches` row.
2. **Fill missing languages** on a question: translates the existing localization(s) into the missing ones, preserving `{placeholders|variants}` and option keys.
3. **Review ergonomics**: the list can be filtered by batch and status and has an inline Approve action for drafts.

Nothing generated becomes servable without the existing approval step (D19); the approval trigger still demands three languages.

## 2. Decisions

- **D33** Generation and translation share one adapter (`lib/integrations/question-gen`), provider `QUESTION_GEN_PROVIDER=claude|fake|off` with the standard default (claude when `ANTHROPIC_API_KEY` is set, fake outside production, off in production). Model `claude-opus-5`, zod structured output via `messages.parse`.
- **D34** Generated questions are validated in code before insert: 4 options A–D, correct key present, placeholders only from `TEMPLATE_FIELDS` (unknown placeholder → the question is dropped and counted as rejected), template questions must reference at least one field. Rejections are reported to the admin, never silently fixed.
- **D35** Source material sent to the model: study-card text (Thai body preferred, any language as fallback) + pasted text + extracted DOCX/TXT/MD text, capped at 60k characters; a PDF travels as a document block. The batch stores a short material summary, not the material itself.

## 3. Data (migration `20260911000011_question_generation.sql`)

- `question_generation_batches(id, created_by, provider, model, material_summary, requested, produced, rejected, created_at)` — admin-only RLS, audited.
- `questions.generation_batch_id uuid null references question_generation_batches`.

## 4. Flow

1. `generateQuestionsAction` → `generateQuestionsIntoBank(db, adminId, input)`: builds the material bundle, calls `generator.generate`, validates, inserts batch + questions (keys `ai-<batch8>-<n>`) + 3 localizations each (`upsertQuestionLocalization` recomputes kind/dependencies), returns `{ batchId, produced, rejected }`; redirect to `/admin/questions?batch=<id>`.
2. `fillMissingLanguagesAction` → `fillMissingLanguages(db, questionId)`: source = Thai if present else any; `generator.translate` for the missing languages; upsert.
3. List page: filters `?batch=&status=`; Approve button per draft row (reuses `setApprovalStatus`).

## 5. Tests

- Unit: output validation (drops unknown placeholders, wrong option shapes), fake generator determinism, provider resolution.
- Integration: generation inserts drafts with three localizations and correct kind/dependencies; fill-missing adds only the missing languages; learners cannot read batches.
- E2E: admin generates a batch from a study card (fake) → filtered list → approve one → status approved; Thai-only question → fill missing → three languages.
