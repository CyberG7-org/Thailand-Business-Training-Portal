# Foundation P1.5 + P2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the foundation: derived progression with stage cards on the learner dashboard and an admin progression column (P2), a language switcher with persisted preference and a proper Thai font (P2), and AI extraction of DBD certificates with admin review (P1.5).

**Architecture:** Progression is a pure function over facts (ADR 0003); a facts loader reads what exists today (assignment, eligibility, policy) and returns zeros for tables later slices add. Extraction sits behind a `DbdExtractor` interface with a Claude implementation (`client.messages.parse` + `zodOutputFormat`, PDF as a base64 document block) and a fake for tests/dev; results are stored in `dbd_records.extraction_raw` and only pre-fill the admin form — nothing is written to record columns until the admin saves and confirms (spec §11).

**Tech Stack:** as Plan A, plus `@anthropic-ai/sdk`, `next/font/google` (Noto Sans Thai).

**Spec:** `docs/superpowers/specs/2026-09-11-thailand-training-portal-foundation-design.md` §6.2, §7, §11, §12, §15 (P1.5, P2). Prior plan: `docs/superpowers/plans/2026-09-11-foundation-p0-p1.md` (all 15 tasks merged into `main`).

## Global Constraints

- Everything in Plan A's Global Constraints still applies (locales, Bangkok "today", `issued_on` semantics, service-role usage, RLS + negative tests, no fabricated DBD data, PII never in the repo).
- Claude API usage follows the `claude-api` skill: `@anthropic-ai/sdk`, zero-arg client, model `claude-opus-5`, `max_tokens: 16000`, structured output via `output_config.format` — never string-parse free text.
- Extraction never auto-commits: `extraction_raw` is the only thing written by the extractor; record columns change only through the admin's Save.
- Extraction provider selection: `EXTRACTION_PROVIDER=claude|fake|off`; default `claude` when `ANTHROPIC_API_KEY` is set, otherwise `fake` outside production and `off` in production.
- `deriveProgression` returns the PRD §8 states plus `UNASSIGNED` for accounts without an active assignment (PRD's list starts at "assigned").

---

## File structure

```
lib/domain/progression.ts              deriveProgression, stageStatuses (pure)
lib/db/progression.ts                  loadProgressionFacts(db, userId)
lib/domain/extraction-merge.ts         extractionToFormValues (pure)
lib/integrations/extraction/types.ts   DbdExtraction, DbdExtractor, ExtractionError
lib/integrations/extraction/schema.ts  zod schema for the model's structured output
lib/integrations/extraction/claude.ts  ClaudeDbdExtractor
lib/integrations/extraction/fake.ts    FakeDbdExtractor + SAMPLE_EXTRACTION
lib/integrations/extraction/index.ts   getDbdExtractor() by provider
lib/db/extraction.ts                   runExtraction(db, recordId, extractor)
supabase/migrations/20260911000004_preferred_language.sql   set_my_preferred_language()
components/language-switcher.tsx, components/stage-card.tsx
app/[locale]/layout.tsx                Noto Sans Thai via next/font
app/[locale]/(learner)/dashboard/page.tsx   stage cards
app/[locale]/(admin)/admin/users/page.tsx   progression column
app/[locale]/(admin)/admin/dbd-records/[id]/{page,record-tools,extraction-review}.tsx
app/[locale]/(admin)/admin/dbd-records/actions.ts   extractDocumentAction
scripts/spike-extract.mjs              S4: run the real extractor on a PDF path
tests/unit/domain/{progression,extraction-merge}.test.ts
tests/integration/{extraction,preferred-language}.test.ts
tests/e2e/{dashboard-stages,language,extraction}.spec.ts
```

---

### Task 1: Progression domain (TDD)

**Files:** Create `lib/domain/progression.ts`, `tests/unit/domain/progression.test.ts`.

**Interfaces:**
- `type ProgressionState = 'UNASSIGNED' | 'PROVISIONED' | 'LEARNING' | 'EXAM_PENDING' | 'EXAM_PASSED' | 'WAITING_BANK_ELIGIBILITY' | 'BANK_ELIGIBLE' | 'CALL_TRAINING_STARTED' | 'CALL_TRAINING_COMPLETED'`
- `type ProgressionFacts = { hasActiveAssignment; studyOpened; quizAttempts; examSubmitted; examPassed; nameCardCreated; eligibility: EligibilityWindow | null; today: ISODate; callSessions; callsCompleted; policy: { requireExamPassForBankCall; requireExamPassForNameCard } }`
- `deriveProgression(facts): ProgressionState`
- `type StageKey = 'study' | 'quiz' | 'exam' | 'nameCard' | 'bank'`; `type StageStatus = 'locked' | 'pending' | 'available' | 'in_progress' | 'done'`; `type StageReason = 'no_assignment' | 'exam_required' | 'before_available_from' | 'expired' | 'missing_issue_date'`
- `stageStatuses(facts): Record<StageKey, { status: StageStatus; reason?: StageReason }>`

- [ ] Write the failing tests (scenario table: unassigned; assigned/no activity → PROVISIONED; study opened → LEARNING; exam submitted not passed → EXAM_PENDING; passed + date in future → WAITING_BANK_ELIGIBILITY; passed + date reached → BANK_ELIGIBLE; passed + missing eligibility → EXAM_PASSED; bank open without exam when policy doesn't require it; call started/completed; stage statuses incl. exam_required, before_available_from, expired, missing_issue_date, name card gating).
- [ ] Implement; run `pnpm test:unit`; commit `feat(domain): derived progression state and stage statuses`.

### Task 2: Facts loader, dashboard stage cards, admin progression column

**Files:** Create `lib/db/progression.ts`, `components/stage-card.tsx`, `tests/e2e/dashboard-stages.spec.ts`; modify dashboard page, admin users page, messages.

**Interfaces:** `loadProgressionFacts(db, userId, options?: { today?: ISODate }): Promise<ProgressionFacts>` — reads assignment + latest snapshot (learner client, RLS) and policy (`getPolicy`, service role); study/quiz/exam/card/call facts are constant zeros here and are wired in by P3/P4/P5/P6/P8.

- [ ] Loader; dashboard renders `STAGES` (study, quiz, exam, nameCard, bank) as cards with status badge + reason text; unbuilt stages render without a link; bank card keeps date/pending/available text. Admin users list gets a "Progression" column.
- [ ] Messages `stages.*` in all three catalogs; E2E: seeded learner sees bank `locked` with date, quiz/study `available`; unassigned learner sees all `locked`; admin list shows `BANK_ELIGIBLE` for a seeded past-date learner.
- [ ] Commit `feat(dashboard): stage cards from derived progression; admin progression column`.

### Task 3: Language switcher, persisted preference, Thai font

**Files:** Create `supabase/migrations/20260911000004_preferred_language.sql` (security-definer `set_my_preferred_language(p_lang text)` validating `th|en|zh` and updating only the caller's row), `components/language-switcher.tsx`, `tests/integration/preferred-language.test.ts`, `tests/e2e/language.spec.ts`; modify `app/[locale]/layout.tsx` (Noto Sans Thai + Noto Sans SC subset via `next/font/google`), learner/admin layouts (switcher in header), login action + home page (redirect to the preferred locale).

- [ ] Migration + integration test (learner can set own language; cannot set another's; invalid value rejected).
- [ ] Switcher: client `<select>` → `router.replace(pathname, { locale })` + server action `setPreferredLanguageAction`; E2E: switch to English → English heading; sign out/in → lands on `/en/dashboard`.
- [ ] Commit `feat(i18n): language switcher with persisted preference and Thai web font`.

### Task 4: AI extraction with admin review (P1.5)

**Files:** see structure above.

**Interfaces:**
- `type ExtractedField<T> = { value: T | null; confidence: number; source_text: string | null }`
- `type DbdExtraction = { [K in DbdExtractionField]: ExtractedField<...> }` for the 13 text/number/date fields + `directors: ExtractedField<Director[]>`
- `interface DbdExtractor { extract(pdf: Uint8Array): Promise<DbdExtraction> }`; `class ExtractionError extends Error { code: 'not_configured' | 'provider' | 'invalid_output' }`
- `extractionToFormValues(extraction): { values: Record<string, string>; lowConfidence: string[]; dateNotes: Record<string, { raw: string; iso: string | null; wasBe: boolean }> }` (threshold 0.8; dates normalized with `parseDateInput`)
- `runExtraction(db, recordId, extractor): Promise<DbdRecordRow>` — downloads `document_path` with the caller's client, sets `pending`, calls the extractor, stores `extraction_raw` + `extracted`; on failure resets to the previous status and rethrows.

- [ ] Unit tests for `extractionToFormValues` (BE date normalized + flagged wasBe, low confidence listed, nulls → empty strings); integration test for `runExtraction` with the fake; `ClaudeDbdExtractor` per the claude-api skill (`messages.parse`, `zodOutputFormat`, base64 `document` block, `claude-opus-5`, `max_tokens: 16000`); provider selection; admin "Extract from PDF" button and an extraction-review panel that pre-fills the form (defaultValues from extraction when the column is null), highlights low-confidence fields, shows BE/CE readings; `scripts/spike-extract.mjs`.
- [ ] E2E (fake provider): upload `tests/fixtures/tiny.pdf`, click Extract, see the fake company name pre-filled and a low-confidence highlight, Save, Confirm.
- [ ] Commit `feat(dbd): AI extraction with admin review (Claude structured output, fake for dev/tests)`.

---

## Done criteria

- Dashboard shows five stage cards whose statuses come from `deriveProgression`; admin list shows each learner's state.
- Learners can switch language; the choice persists and login lands on it; Thai renders in Noto Sans Thai.
- Admin can extract a certificate into a reviewable pre-filled form; nothing is committed without Save + Confirm; the real extractor is exercised by `scripts/spike-extract.mjs` once `ANTHROPIC_API_KEY` is present (spike S4).
