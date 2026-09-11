# P4 — Evaluation Quiz (slice spec)

| Field | Value |
|---|---|
| Status | Drafted from the foundation spec; decisions D17–D20 logged |
| Date | 2026-09-11 |
| Builds on | Foundation §4.3 (questions), §4.4 (attempts), §5, §9 (assessment engine) |
| PRD | QUIZ-001…011, BR-005/006, AC-004/005, §16 (no content in language, mid-attempt close) |

## 1. Scope

Learners practise with randomized multiple-choice questions personalized from their assigned DBD record, get immediate feedback (green/red, correct option, explanation) and a final review. Admins author questions in three languages and approve them. The same tables and engine serve the Exam (P5), which differs only in feedback timing, passing mark and notifications.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D17 | Personalization uses **placeholders in prompt/option text**: `{field}` inserts the record value; `{field\|x2}`, `{field\|x0.5}`, `{field\|x10}` make numeric distractors; `{field\|+1m}`, `{field\|-1y}` make date distractors; `{juristic_id\|shuffle}` permutes digits. All deterministic per attempt seed. | Expressive enough for real distractors that never collide with the correct value, while keeping options a simple `[{key,text}]` list the owner can author |
| D18 | Learners have **no write access** to attempts/answers and **no read access** to questions. A server action starts an attempt (service role picks approved questions, renders text, snapshots options in presented order) and records answers (server computes `is_correct` from the stored key). | Tamper-proof scoring for the exam; correct keys never reach the client early (spec §5) |
| D19 | A question is selectable only when `approval_status = 'approved'`, `active`, in the requested pool, and every `{field}` it references exists on the confirmed record; otherwise it is skipped (BR-008). | Never fabricate DBD data |
| D20 | One `in_progress` attempt per learner per kind; reopening resumes it (autosave per answer). Quiz retries unlimited (policy seam exists). | PRD §16 recommendation |

## 3. Data (migration `20260911000006_assessment.sql`)

- `questions` — `question_key unique`, `kind ('generic','dbd_template')`, `dbd_field_dependencies text[]` (derived from placeholders on save), `source ('manual','ai_generated')`, `approval_status ('draft','approved','retired')`, `pools text[]` (subset of `{quiz,exam}`), `active`, audit.
- `question_localizations` — `question_id`, `language`, `prompt`, `options jsonb` (`[{key:'A'|'B'|'C'|'D', text}]`, 2–6 options), `correct_key`, `explanation`, `tts_enabled`; unique `(question_id, language)`; audit.
- `assessment_attempts` — as foundation §4.4 (`kind`, `attempt_no`, `status`, `question_ids[]`, `shuffle_seed`, `passing_mark_snapshot`, `score`, `max_score`, `result`, timestamps); unique `(user_id, kind, attempt_no)`; partial unique `(user_id, kind) where status = 'in_progress'`.
- `assessment_answers` — `attempt_id`, `question_id`, `position`, `presented_option_order text[]`, `rendered_prompt`, `rendered_options jsonb`, `selected_key`, `is_correct`, `answered_at`; unique `(attempt_id, question_id)`.
- RLS: admins everything on questions/localizations; learners nothing on them. Attempts/answers: learners `select` their own only; all writes through server actions using the service role after verifying the session user owns the attempt.
- Seed: six approved sample questions (3 generic, 3 templates) in th/en/zh in both pools.

## 4. Engine (`lib/domain/assessment/`)

- `renderTemplate(text, record, seed, locale)` — placeholder substitution + variant strategies; throws `MissingFieldError` when a referenced field is null.
- `placeholderFields(text)` — the set of record fields a localization references (stored as `dbd_field_dependencies`).
- `selectQuestions({ pool, count, seed, questions, record })` — filters per D19, seeded shuffle, first `count`.
- `shuffleOptions(options, seed, questionId)` — deterministic permutation; invariant: same keys, correct key preserved.
- `scoreAnswers(answers)` — `{ score, maxScore }`; `evaluateResult(score, maxScore, passingMarkPercent)` for the exam.
- Seeded PRNG: mulberry32 over a string hash — pure, testable.

## 5. Server actions (learner) and admin

- `startAttempt(kind)` → resumes `in_progress` or creates one: policy count, approved questions via service role, `selectQuestions`, render + shuffle, insert attempt + answer rows. Requires an active assignment (questions are personalized) and, for `quiz`, nothing else.
- `answerQuestion(attemptId, questionId, key)` → verifies ownership + in_progress + unanswered; computes `is_correct` from the localization's `correct_key`; for `quiz` returns `{ isCorrect, correctKey, explanation }`, for `exam` returns `{ saved: true }`.
- `submitAttempt(attemptId)` → all answered; score; status `submitted`; (exam extras in P5).
- Admin `/admin/questions`: list; editor with question settings (kind, pools, status) and three language forms (prompt, options A–D, correct key, explanation, Thai TTS flag). Approve requires all three languages; placeholders are validated against the known field list; `dbd_field_dependencies` recomputed on save.

## 6. Learner UI

`/quiz` — start/resume button, past attempts with scores. `/quiz/[attemptId]` — question `i/n`, options as buttons; after answering: selected option green or red, correct option highlighted, explanation shown, Next. Last question → Submit → `/quiz/[attemptId]/review` with score and per-question review. Thai read-aloud on prompts where `tts_enabled` (reuses `/api/tts` with `question=<id>`; the route gains that second source).

Dashboard: `STAGE_ROUTES.quiz = '/quiz'`; `loadProgressionFacts.quizAttempts` = submitted quiz attempts.

## 7. Tests

Unit: rendering + variants + missing-field error, selection filters and determinism, shuffle invariants, scoring. Integration: RLS (learner cannot read questions, cannot write attempts; sees own attempts only), attempt lifecycle via the actions' underlying functions, resume, answer idempotency. E2E: admin authors + approves a template question → learner starts quiz, sees the company's capital in a prompt, answers wrong (red + explanation + correct shown), answers next right (green), submits, reviews score; reopening `/quiz` mid-attempt resumes at the next unanswered question.
