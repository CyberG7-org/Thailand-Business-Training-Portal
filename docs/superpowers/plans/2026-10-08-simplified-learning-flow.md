# Simplified learning flow implementation plan

## Goal

Make Study, the 30-question Business Knowledge Quiz, and the 11-question Bank Readiness Interview use one plain-language syllabus. New quiz attempts pass at 27/30 with no critical-question override. New readiness sessions pass at 9/11 with no mandatory concept or early punitive failure. Existing attempts, sessions, transcripts, results, passes, and appointments remain valid.

## Product decisions

- Five study cheat sheets cover every assessed concept.
- The quiz always covers the same 30 concepts.
- Each quiz concept has three simple approved variants; unseen variants are preferred, then variants cycle.
- New quiz attempts have only `pass` and `fail`: 27–30 passes, 0–26 keeps practising.
- No new quiz attempt has critical concepts or a retest band.
- Readiness asks 11 fixed concepts, gives one friendly follow-up for an incomplete answer, and passes at 9/11.
- Readiness always reaches the end of the 11-question plan unless the learner explicitly ends or the technical turn limit is reached.
- Website wording is conditional: a missing website is omitted, never shown as a blank.
- Existing historical rows are never rewritten.

## Global constraints

- Keep Thai, English, and Chinese content aligned.
- Preserve RLS and service-role write boundaries.
- Freeze the rule and rendered questions on every new attempt/session.
- Use additive/versioned migrations. Do not delete historic variants or records.
- Follow TDD for behavior changes.
- Do not push or deploy without a separate user request.

## Task 1 — Shared syllabus and complete study facts

### Produces

- One content registry mapping all 30 quiz concepts to five study cards and three simple prompts.
- Template rendering support for the full current fact sheet, including invoice-derived money facts and conditional customer channels.
- Five rewritten study cheat sheets in Thai, English, and Chinese.

### Steps

1. RED: add unit tests proving all 30 concepts are covered once, have three variants, and map to cards 1–5.
2. RED: add tests for customer-channel wording with and without a website and for money placeholders.
3. GREEN: implement the shared syllabus and fact projection used by study rendering.
4. GREEN: rewrite the five starter cards around the approved cheat-sheet structure.
5. Verify targeted unit tests, typecheck, lint, and formatting.

## Task 2 — Versioned quiz result rule

### Produces

- A v2 quiz rule for new attempts: pass score 27, no critical override, no retest outcome.
- Backward-compatible reading of v1 rule snapshots and results.
- Result/home copy with one transparent threshold.

### Steps

1. RED: update unit tests so v2 passes 27, fails 26, and passes 29 even when a formerly critical concept is wrong.
2. RED: retain tests proving v1 snapshots still use their frozen critical/retest behavior.
3. GREEN: implement the versioned rule union and result calculation.
4. GREEN: freeze v2 on new attempts and simplify learner-facing copy/results.
5. Verify unit and exam E2E tests.

## Task 3 — Ninety approved quiz variants

### Produces

- Three simple variants for each of 30 concepts, with four options and an explanation in all three locales.
- Rotation that prefers unseen variants and cycles after exhaustion.
- An additive migration that inserts v2 variants and retires superseded variants without deletion.

### Steps

1. RED: add tests requiring exactly three renderable approved-v2 variants per concept and unique options.
2. RED: add rotation tests for attempts 1–4.
3. GREEN: add the 90 variants and localized answer material.
4. GREEN: add safe migration/upsert SQL and rollback notes.
5. Verify variant rendering, preflight, integration, and migration shape.

## Task 4 — Versioned 11-question readiness plan

### Produces

- A v2 plan containing the approved 11 questions and a frozen 9/11 threshold.
- Simple per-question assessment: ready, follow-up, or review.
- No mandatory concepts and no evasion/paste automatic failure for v2.
- Legacy v1 sessions continue under the old plan and verdict logic.

### Steps

1. RED: add unit tests for the exact 11 concepts, 9/11 ready, 8/11 not ready, no mandatory concept, and later correction winning.
2. RED: add tests proving a v1 plan still uses the legacy verdict.
3. GREEN: introduce a versioned plan type and v2 builder/verdict.
4. GREEN: update fake and Claude interview providers to ask the v2 wording and give one friendly follow-up.
5. GREEN: remove v2 early closure for evasions/off-topic/pasted while retaining technical and explicit-end safeguards.
6. Verify unit and integration interview tests.

## Task 5 — Readiness home and learner feedback

### Produces

- A motivating readiness landing page explaining 11 questions, 9 required, Thai language, and unlimited practice.
- `Ready` / `Keep practising` language and a focused review of missed concepts.
- Matching Thai, English, and Chinese copy.

### Steps

1. RED: add E2E assertions for the instructions and transparent threshold.
2. GREEN: implement the readiness overview and updated outcome/debrief copy.
3. Verify mobile and desktop rendering and learner navigation.

## Task 6 — Migration, compatibility, and full verification

### Produces

- `20261008010000_simplified_learning_flow.sql` with additive/versioned data changes and rollback instructions.
- Updated decision log and production application path.
- Full automated and visual verification.

### Steps

1. Verify the migration takes only short row/table metadata locks, performs no destructive rewrite, is idempotent where practical, and has a documented rollback.
2. Run unit, integration, E2E, lint, typecheck, format, and diff checks.
3. Capture mobile screenshots for Study, Quiz, and Readiness and record design QA.
4. Run a fresh whole-branch review, fix Important/Critical findings once with RED→GREEN tests, and record deferred minors.

## Shared interfaces / pre-flight

- Task 1 syllabus is consumed by Tasks 3 and 5; concept keys must remain the registry keys already stored in assessment rows.
- Task 1 fact projection is consumed by Task 4; readiness expected answers must come from the same frozen training snapshot as quiz questions.
- Task 2 v2 rule is stored in `assessment_attempts.rule_snapshot`; Task 3 changes question content but must not change the rule snapshot shape after attempts start.
- Task 4 plan version is stored inside `interview_sessions.plan`; legacy rows without a version are v1.
- Task 6 migration activates only data understood by the deployed code; inserts are additive and historic rows remain readable.

## Review focus

- A formerly critical quiz answer must never override a v2 score.
- Retake rotation must not make a concept unrenderable after its variants are exhausted.
- Website omission must not leave broken grammar.
- Invoice arithmetic must still divide by distinct invoice dates.
- A v2 readiness interview must not close early from evasive/off-topic/pasted labels.
- Existing v1 attempts and sessions must render and retain their original result.
