# Two evaluations on pinned training facts (P17) — design

|            |                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------- |
| Status     | Approved by the Owner 2026-09-30 with five corrections (folded in below). Nothing implemented. P17a is specified in §13 and planned in `docs/superpowers/plans/2026-09-30-p17a-facts-and-concepts.md` |
| Supersedes | The quiz and exam (P4/P5, D17–D21, D50, D51, D57), AI question authoring (D33–D36, D43), the D64 readiness-interview officer, the P15/D54 permission letting managers write and approve the shared question bank, and the "Quiz Question Bank V2" PDF (none of it was built) |
| Keeps      | D64's session history (read-only), the appointment calendar (D67), teams and roles (P15), the staff shell (D68), typed login ids (D69) |
| Decisions  | D70–D79 (§3), recorded in `docs/decisions-log.md` by P17a Task 16                                  |

## 1. Why

The portal teaches a Thai company director to pass a bank's account-opening verification. Today
that is measured three ways that disagree with each other: a quiz and an exam over a free-form
question bank whose distractors can collide, and an AI officer that phrases its own questions and
grades by narrative. The Owner has fixed a different shape: **two evaluations** — a
deterministic 30-concept MCQ and a fixed-script 13-question chatbot interview — both built on the
**same immutable snapshot of the company's facts**, with facts validated automatically and only
exceptions sent to people.

## 2. Outcome

- A learner goes **Study → MCQ Evaluation → Chatbot Bank Interview Evaluation → Name Card → Bank
  Appointment**. Only the two evaluations are scored.
- The MCQ is always the same 30 concepts, one question each, rendered from the learner's pinned
  facts by controlled recipes; the result is PASS, RETEST or FAIL by a fixed rule.
- The chatbot asks the same 13 concepts in the same order, in Thai by default, switchable to
  English or Chinese mid-way; each answer is marked right or wrong at once, a wrong one is
  corrected, a non-answer gets one clarification. 11/13 passes.
- Every fact a question uses comes from an immutable Training Version the learner is pinned to;
  a newer version never reaches a learner without an explicit move.
- Clean DBD records become versions without anyone touching them; people see only exceptions.
- Nothing about a company is ever invented — not by extraction, not by a question, not by grading.

## 3. Owner decisions

| #   | Decision | Decided |
| --- | -------- | ------- |
| D70 | **Flow.** Study → MCQ PASS → Chatbot PASS → Name Card created → Appointment. Two evaluations only. The name card unlocks after both pass; the appointment requires the name card to have been created, and keeps its date window (D67). | O-1, correction 3 |
| D71 | **MCQ result.** 30 fixed questions, one per concept, 1 point each. `any critical wrong → FAIL; else score ≥ 27 → PASS; else score ≥ 23 → RETEST; else FAIL`. PASS opens the chatbot. RETEST allows an immediate full retake. FAIL sends the learner to Study/Review first, then allows a full retake — no cooldown, no manager unlock. Never a retest of only the wrong items. No "suspend account opening" wording or behaviour anywhere. Feedback is immediate; an answer is locked once given; a wrong answer may show the correct one and its explanation. | 1, O-2, O-6 |
| D72 | **Critical concepts** (exactly nine): company_name, registration_number, registration_date, registered_location, registered_capital, director_identity, director_count, actual_business, signing_authority. | O-3 |
| D73 | **Facts.** Training facts include a structured registered address (full text, house no., moo, road, subdistrict, district, province, postcode where present), resolved against controlled Thai administrative geography — never model output. Business categories are an Owner-controlled dictionary; `nature_of_business` is mapped to a category automatically when confidence is sufficient, and a low-confidence mapping is an exception, not routine manager work. The category is **assessment metadata for controlled distractors only**: it never blocks fact extraction, concept resolvability or a training version; a missing or low-confidence category only makes BUSINESS_ALTERNATIVE variants unavailable. Status facts `operations_started`, `has_existing_customers`, `has_completed_transactions`, `has_regular_suppliers`, `learner_is_shareholder` are resolved before an evaluation and select alternate wording; they are never inferred during one. | 7, 8, O-4, O-5, correction 5 |
| D74 | **Validation.** Every one of the 30 MCQ concepts must be *resolvable* for the assignment's training version, from DBD_FACT, BUSINESS_PROFILE, DERIVED, ROLE or KYC_POLICY. KYC_POLICY concepts never raise a missing-company-fact exception. **Readiness has two scopes:** a company record is measured on its 29 MCQ and 12 chatbot company-level concepts (company, policy and derived facts); the ROLE concepts `learner_shareholding` (MCQ) and `attendee_identity` (chatbot) resolve only per assignment, so only an assignment can show 30/30 and 13/13, and only once its role facts resolve. Clean high-confidence records are accepted automatically; exceptions go to the owning manager and the Owner. A missing business fact is supplied by a person, never generated. | brief, validation correction, correction 2 |
| D75 | **Training versions** are immutable. An assignment stays pinned to the version it was given, even when a newer version's answers are identical. Moving a learner to a newer version is an explicit, audited action. | 2 |
| D76 | **One concept registry**, `evaluation_concepts`, shared by both evaluations; the 30 MCQ concepts are approved product decisions, not drafts. `questions` stays MCQ-only; `interview_script_questions` stays chatbot-only. Question variants under a concept use draft → approved → retired. **P17 supersedes P15/D54 for assessment content:** only the Owner (`admin`) writes MCQ concepts and questions, chatbot scripts and business categories; managers read them. Study cards remain shared staff content (D54 unchanged there). | 4, 5, correction 1 |
| D77 | **MCQ rendering.** Controlled recipes only — DIRECT_FACT, NUMERIC_VARIATION, COUNT_VARIATION, DATE_VARIATION, ID_MUTATION, GEOGRAPHY_ALTERNATIVE, BUSINESS_ALTERNATIVE, STATIC, COMPOSITE_TEMPLATE. Placeholders may appear in the prompt and in any option, so a question is static, dynamic or hybrid. No AI produces a distractor at runtime. Every rendered option is non-empty and unique. A business distractor is a controlled category different from the company's own. | 6, 8 |
| D78 | **Chatbot.** 13 fixed concepts in a fixed order; none skipped; status facts pick approved alternate wording (no customers → slot 11 asks about expected target customers; no completed transactions → slot 13 asks about expected purchase/payment behaviour). Pass mark 80% = 11/13. Thai by default; script questions need Thai, English and Chinese before approval; a language switch is a control message — not graded, no cursor move, repeats the current question in the chosen language. Grading: exact / normalized / structured wherever possible, AI semantic grading only for open-text business or relevance slots, always on the learner's original words, never on a translation. IDs, numbers and dates accept Chinese formatting; company and person names need the official Thai or English form. Unlimited full retakes from slot 1, no cooldown, no manager unlock. | 9–11, O-8–O-10 |
| D79 | **Review and history.** A manager reads every conversation of their team, the Owner all. The original transcript is immutable; translations are a separate, regenerable cache. D64 readiness-interview sessions stay readable and auditable and are never dropped unless first migrated and verified. **Transition:** existing booked appointments stay valid; learners fully cleared under the old flow are grandfathered for their current assignment, recorded explicitly; everyone else — and every new learner — takes the new flow; an old exam pass is never counted as a new MCQ pass. | 3, 12, O-7 |

Product term *Owner* is the existing `admin` role; it is not renamed.

## 4. Flow and progression

| # | Step | Opens when | Done when |
| --- | --- | --- | --- |
| 1 | `study` | assignment | never (stays available) |
| 2 | `mcq` | assignment is *ready* (§5.6) | a PASS on the pinned version |
| 3 | `interview` (chatbot) | MCQ PASS on the pinned version | a pass (≥ 11/13) on the pinned version |
| 4 | `nameCard` | both evaluations passed | a card created |
| 5 | `appointment` | name card created **and** the 45-day window (D67) | an upcoming booking |

- Results count only against the assignment's pinned training version (D75). Moving a learner
  to a newer version tells the mover which steps the learner must pass again.
- MCQ FAIL marks the learner `review_required`: the MCQ step shows Study/Review as the way on;
  opening the review page clears the flag and a full new attempt may start at once (D71).
- **Transition (D79).** A one-off, audited grandfathering pass (P17e) records every learner who is
  fully cleared under the old flow (exam passed and a D64 `ready` interview, or an appointment
  booked) in `progression_grandfathering`, pinned to their current assignment; progression treats
  both evaluations as passed for exactly that assignment. Booked appointments are untouched.
  Everyone else starts at the MCQ.

## 5. The shared foundation: facts

### 5.1 Fact sources

| Source | Examples | Written by |
| --- | --- | --- |
| DBD_FACT | names, juristic id, registration date, capital, directors, signing authority, registered address, shareholders | extraction (confidence + provenance) and staff edits |
| BUSINESS_PROFILE | nature of business, products/services, clients, suppliers, revenue, transactions, funds, account/PromptPay purpose, status facts | the manager (never generated) |
| DERIVED | director count, shareholder count, learner is shareholder, learner's shares/percent, postcode from geography | code, deterministically |
| ROLE | the learner's name as in the DBD documents, position | staff on the assignment |
| KYC_POLICY | who controls internet banking / OTP, supporting documents, consistency | the Owner's approved static answer |

### 5.2 Registered address and geography

- Reference tables `geo_regions` (6), `geo_provinces` (77), `geo_districts` (930),
  `geo_subdistricts` (7,436, each with its postcode), generated from
  [kongvut/thai-province-data](https://github.com/kongvut/thai-province-data) pinned at commit
  `7d689e4` (MIT). Written only by migrations; read by any signed-in user.
- The printed `head_office_address` is split deterministically on the printed markers
  (เลขที่, หมู่/หมู่ที่/ม., ถนน/ถ., ตำบล/แขวง/ต., อำเภอ/เขต/อ., จังหวัด/จ., the Bangkok spellings,
  a five-digit postcode) and resolved top-down: province by name, district within that province,
  subdistrict within that district (names repeat across the country — 795 subdistrict names occur
  more than once — so lookups are always scoped to the parent).
- A printed postcode must equal the subdistrict's; when none is printed it is taken from the
  subdistrict (`postcode_source = 'geography'`). Anything that does not resolve is reported as an
  issue, never guessed.
- Geography distractors (P17d) are drawn from these tables only, scoped by recipe (another
  province in the region, another district in the province, another subdistrict in the district).

### 5.3 Business categories

- `business_categories`: an Owner-controlled dictionary (key, Thai/English/Chinese labels,
  active, order), seeded with a draft list the Owner edits.
- After `nature_of_business` or `products_services` change, a mapper (`CATEGORY_MAP_PROVIDER` =
  claude | fake | off) picks one active category and a confidence. At or above
  `business_category_min_confidence_percent` (default 85) it is accepted automatically; below it
  the candidate is kept and flagged for review (an exception from P17c). A person may set the
  category by hand; that choice holds until the business text changes.
- The category is assessment metadata for controlled distractors (D73). A mapping failure never
  fails a save, an extraction or a transcript fill, and the category is not part of any concept's
  resolvability. A missing or low-confidence category makes only BUSINESS_ALTERNATIVE variants
  unavailable (P17d preflight skips them for the next variant).

### 5.4 Business profile and status facts

> Amended by §15 (D91): a manager is asked five of these; the rest are standard answers, and the
> four company status facts are always yes.

The Level 4 profile (manager-written, `structured_data.interview`) gains the fields the 37
registry concepts need: `business_purpose`, `main_clients`, `client_origin`, `main_suppliers`,
`monthly_revenue`, `revenue_basis`, `average_transaction`, `monthly_transactions`,
`first_incoming_funds`, `promptpay_qr_purpose`, `customer_examples`, `customer_profile`,
`transaction_details` (beside the existing `nature_of_business`, `products_services`,
`account_purpose`, `source_of_funds`, `business_address`), and four yes/no status facts
`operations_started`, `has_existing_customers`, `has_completed_transactions`,
`has_regular_suppliers`. A status fact changes what the matching field *means* (for example
`customer_examples` holds expected target customers when `has_existing_customers = no`) and the
form label says so; it never removes the field. The legacy answers `monthly_volume`,
`clients_location`, `suppliers_location`, `operations_status` are kept as written and shown as
earlier answers — nothing is remapped silently.

### 5.5 Validation and exceptions (P17c)

Deterministic validators run after every extraction and every edit: juristic id format and
check digit; registration date ≤ issue date ≤ today; shares reconcile to the total and percents
to 100 where the list is complete; total shares × par value against capital where that
comparison is valid; objectives count; director list against the signing authority; address
resolution; every MCQ concept resolvable (§7.3). A hard-rule failure always beats a high
confidence. Each problem becomes a `training_fact_exceptions` row (missing, low_confidence,
conflict, invalid, geo_mismatch, category_review, render_failure) routed to the owning team's
manager and the Owner. KYC_POLICY concepts never produce one. A `category_review` exception is
**non-blocking**: it never holds back a training version (D73). Resolved exceptions are kept as
labelled data for tuning extraction.

### 5.6 Training versions (P17b)

`company_training_versions` holds the whole fact sheet (§7.2) with provenance, frozen once
active; one active version per record; editing a fact makes a new draft. A version is created
automatically when validation has no open blocking exception (category exceptions never block),
otherwise when the last blocking exception is resolved. A version is complete at company scope
when its 29 MCQ and 12 chatbot company-level concepts resolve. An assignment pins
`training_version_id` plus a `role_snapshot`; it is *ready* — 30/30 and 13/13 — when its two
ROLE concepts resolve as well. Learners never move automatically (D75); the
user page offers "Move to version n", refused while an evaluation is in progress, audited.

## 6. Data model (all phases)

New tables follow the repository conventions (uuid or natural key, RLS on creation, read
policies only, writes by the service role after checks in code or by the Owner through their own
session for audited content, `audit_row_change` on edited content, functions revoked from
`public`/`anon`/`authenticated`).

| Table | Phase | Purpose | Read | Write |
| --- | --- | --- | --- | --- |
| `geo_regions`, `geo_provinces`, `geo_districts`, `geo_subdistricts` | P17a | Thai geography | signed-in users | migrations |
| `business_categories` | P17a | category dictionary | staff | Owner (audited) |
| `evaluation_concepts` | P17a | the 37-row registry (§7) | staff | migrations |
| `dbd_records.structured_data` `.address`, `.category`, expanded `.interview` | P17a | new facts | as the record | as the record |
| `company_training_versions` | P17b | immutable fact snapshots | Owner; owning manager | service role (+ audit row) |
| `user_dbd_assignments` + `training_version_id`, `role_snapshot`, `role_confirmed_*` | P17b | pinning | as today | owning manager / Owner (audited) |
| `training_fact_exceptions` | P17c | exception queue | Owner; owning manager | same, own session (audited) |
| `questions` + `concept_id`, `correct_option_key`, `option_recipes`, `applies_when` | P17d | MCQ variants | staff | Owner |
| `assessment_attempts` + `training_version_id`, rule snapshot, `result` ∈ pass/retest/fail; `assessment_answers` + concept snapshot, `correct_key` (column-revoked) | P17e | MCQ attempts | learner own; team manager; Owner | service role |
| `progression_grandfathering` | P17e | transition record (D79) | Owner; owning manager | service role (+ audit row) |
| `interview_script_questions`, `interview_script_localizations` | P17f | chatbot script | staff | Owner |
| `bank_interview_sessions`, `bank_interview_turns` | P17g | chatbot runs; turns frozen by trigger | learner own; team manager; Owner | service role |
| `bank_interview_turn_translations` | P17h | regenerable review cache | as the session | service role (upsert) |
| `interview_sessions`, `interview_turns` (D64) | P17g | legacy history, now frozen by trigger | unchanged | nobody after cutover |

Policy keys: `business_category_min_confidence_percent` (P17a, 85); `mcq_pass_score` (27),
`mcq_retest_score` (23) (P17e); `interview_passing_mark_percent` (80) (P17g);
`training_auto_accept_confidence_percent` (95), `training_review_confidence_percent` (75) (P17c).
Retired at cutover: `quiz_question_count`, `exam_question_count`, `exam_*`,
`require_exam_pass_for_*`. Every new row is seeded with the code default.

## 7. The concept registry

### 7.1 Rows

> Amended by §15 (D91): `customer_examples` is removed, `main_clients` is MCQ-only, the chatbot
> has 11 slots, and the only `alt` left is `learner_is_shareholder`.

`mcq` is the MCQ order (1–30), `slot` the chatbot slot (1–13), `crit` a critical MCQ concept,
`match` the fixed chatbot grading tier. `alt` lists the status facts that select alternate
wording; it also makes those status facts required for the concept to resolve. The `alt` column
is **confirmed by the Owner** (2026-09-30, correction 4). Alternate wording never removes a
concept or a slot: the MCQ always asks 30 and the chatbot always 13.

| key | domain | source | facts | answer | mcq | crit | slot | match | alt |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| company_name | identity | DBD_FACT | company_name_th | name | 1 | ✓ | 1 | normalized | |
| registration_number | identity | DBD_FACT | juristic_id | id | 2 | ✓ | 2 | exact | |
| registration_date | identity | DBD_FACT | registered_on | date | 3 | ✓ | 8 | normalized | |
| registered_location | identity | DBD_FACT | address | address | 4 | ✓ | | | |
| director_count | authority | DERIVED | directors | count | 5 | ✓ | | | |
| director_identity | authority | DBD_FACT | directors | names | 6 | ✓ | | | |
| signing_authority | authority | DBD_FACT | signing_authority | text | 7 | ✓ | | | |
| registered_capital | ownership | DBD_FACT | registered_capital | money | 8 | ✓ | | | |
| shareholder_count | ownership | DERIVED | shareholders | count | 9 | | | | |
| learner_shareholding | ownership | ROLE | holder_name, shareholders | shareholding | 10 | | | | learner_is_shareholder |
| actual_business | business | BUSINESS_PROFILE | nature_of_business | open_text | 11 | ✓ | 4 | semantic | |
| products_services | business | BUSINESS_PROFILE | products_services | open_text | 12 | | 5 | semantic | |
| business_purpose | business | BUSINESS_PROFILE | business_purpose | open_text | 13 | | | | |
| main_clients | business | BUSINESS_PROFILE | main_clients | open_text | 14 | | 10 | semantic | has_existing_customers |
| client_origin | business | BUSINESS_PROFILE | client_origin | open_text | 15 | | | | has_existing_customers |
| main_suppliers | business | BUSINESS_PROFILE | main_suppliers | open_text | 16 | | | | has_regular_suppliers |
| actual_business_location | business | BUSINESS_PROFILE | business_address | text | 17 | | | | operations_started |
| monthly_revenue | financial | BUSINESS_PROFILE | monthly_revenue | text | 18 | | | | operations_started |
| revenue_basis | financial | BUSINESS_PROFILE | revenue_basis | open_text | 19 | | | | operations_started |
| average_transaction | financial | BUSINESS_PROFILE | average_transaction | text | 20 | | | | has_completed_transactions |
| monthly_transactions | financial | BUSINESS_PROFILE | monthly_transactions | text | 21 | | | | has_completed_transactions |
| startup_source_of_funds | funds | BUSINESS_PROFILE | source_of_funds | open_text | 22 | | | | |
| first_incoming_funds | funds | BUSINESS_PROFILE | first_incoming_funds | open_text | 23 | | | | |
| bank_account_purpose | banking | BUSINESS_PROFILE | account_purpose | open_text | 24 | | | | |
| promptpay_qr_purpose | banking | BUSINESS_PROFILE | promptpay_qr_purpose | open_text | 25 | | | | |
| internet_banking_control | kyc | KYC_POLICY | — | static | 26 | | | | |
| otp_control | kyc | KYC_POLICY | — | static | 27 | | | | |
| transaction_explanation | kyc | KYC_POLICY | — | static | 28 | | | | |
| supporting_documents | kyc | KYC_POLICY | — | static | 29 | | | | |
| answer_consistency | kyc | KYC_POLICY | — | static | 30 | | | | |
| registered_address | identity | DBD_FACT | address | address | | | 3 | structured | |
| authorized_representative | authority | DBD_FACT | directors, signing_authority | names | | | 6 | structured | |
| attendee_identity | attendance | ROLE | holder_name | name | | | 7 | normalized | |
| account_purpose | banking | BUSINESS_PROFILE | account_purpose | open_text | | | 9 | semantic | |
| customer_examples | business | BUSINESS_PROFILE | customer_examples | open_text | | | 11 | semantic | has_existing_customers |
| customer_profile | business | BUSINESS_PROFILE | customer_profile | open_text | | | 12 | semantic | has_existing_customers |
| transaction_details | financial | BUSINESS_PROFILE | transaction_details | open_text | | | 13 | semantic | has_completed_transactions |

Keys that appear in both lists (company_name, registration_number, registration_date,
actual_business, products_services, main_clients) are one shared row; the Owner's two lists
name `registered_location`/`registered_address` and `bank_account_purpose`/`account_purpose`
separately, so they stay separate rows reading the same facts.

### 7.2 Fact sheet

One function builds the canonical fact sheet from a record, its structured data, its address and
(for an assignment) the learner's role; P17b freezes exactly this object into a version. Keys:
the DBD facts, `address`, the business-profile fields, the five status facts as booleans,
`business_category`, `holder_name`, `position`, and the derived `director_count`,
`shareholder_count`, `my_shares`, `my_share_percent`.

### 7.3 Resolvability

A concept is **resolved** when every fact it lists is present (text non-blank, list non-empty,
number set, `address` fully resolved to subdistrict) and every status fact in `alt` is set;
**policy** when its source is KYC_POLICY (always ready, never an exception); otherwise
**missing**, naming the facts. `learner_shareholding` additionally needs an amount (shares or
percent) when the learner is a shareholder.

**Two scopes (D74).** *Company scope* — a record or a training version — counts only the
company-level concepts: **29 of the MCQ** (everything except `learner_shareholding`) and **12 of
the chatbot** (everything except `attendee_identity`); the two ROLE concepts are listed as
"checked per learner", never counted, so a record never shows 30/30 or 13/13. *Assignment
scope* counts all **30** and **13**, the ROLE concepts included, so a learner shows 30/30 and
13/13 only once their role facts resolve.

The category is not part of resolvability (D73); it only feeds BUSINESS_ALTERNATIVE distractors,
and a missing or low-confidence one is a non-blocking exception of its own.

## 8. MCQ evaluation (P17d, P17e)

- **Bank.** Owner-only. A variant belongs to one concept, may carry `applies_when` (a status fact
  and value) so every status has an approved variant, and is approved on its Thai text alone;
  English and Chinese are reference translations with the same placeholders. Editing an approved
  variant returns it to draft; retired variants stay linked from old attempts.
- **Grammar.** `{fact}` is DIRECT_FACT; `{fact|recipe(args)}` applies a recipe, e.g.
  `{registered_capital|numeric(x0.5)}`, `{directors|count(+1)}`, `{registered_on|date(-1y)}`,
  `{juristic_id|id_mutation}`, `{province|geo_alt(region)}`, `{business_category|business_alt}`.
  An option without placeholders is STATIC; several parts make a COMPOSITE_TEMPLATE. Each option
  declares its recipe in `option_recipes`, and the editor checks the text matches.
- **Rendering.** Seeded by attempt, question, option and occurrence; alternates are drawn
  without replacement inside a question; English/Chinese views reuse the seed, so they show the
  same alternates in their own names. **Preflight** requires four non-empty options unique after
  normalisation, the correct option rendered from the concept's facts, and no distractor equal
  to it; a failing variant yields to the next, and a concept with none left blocks the attempt
  and raises a render_failure exception for the Owner. A variant using BUSINESS_ALTERNATIVE is
  unavailable while the record has no mapped category (D73) and yields the same way.
- **Attempt.** One variant per concept (unseen variants first), options shuffled, order
  shuffled, all frozen before the first answer; score and result by D71 with the thresholds and
  critical keys snapshotted on the attempt.

## 9. Chatbot evaluation (P17f–P17h)

> Amended by §15 (D91): 11 slots; pass when `score × 100 ≥ 80 × 11`, that is 9 of 11.

- **Script.** 13 slots, one approved default question per slot plus approved alternates keyed by
  status fact; each with Thai, English and Chinese prompt and clarification prompt. Officer
  feedback lines ("correct", "incorrect — the correct answer is …", the clarification lead-in)
  are fixed per language in the message catalogue and reviewed for tone; no model writes officer
  text.
- **Session.** Snapshots the 13 chosen questions in all three languages with the expected
  answers from the pinned version. Per learner message: a language switch stores a control turn
  and repeats the current prompt; an answer is graded on its original text by the slot's tier —
  correct → next; wrong → reveal (as printed, D47) → next; unclear or non-answer → one
  clarification, then wrong → reveal → next. After slot 13: pass when `score × 100 ≥ 80 × 13`.
- **Grading tiers.** `exact` (after trimming), `normalized` (Thai/English forms of the fact;
  whitespace, punctuation, company suffixes, Buddhist/Common Era and Thai/Chinese/Arabic numerals
  for dates and numbers), `structured` (component match, e.g. address parts, the authorised
  director set), `semantic` (`ANSWER_GRADER_PROVIDER` = claude | fake | off, only on open_text
  slots, constrained to the expected answer, returns correct / wrong / unclear). Names must be the
  official Thai or English form (D78). Every graded turn stores its tier, grader and version.
- **Review.** Managers see their team, the Owner all; "Show in English / Chinese" fills
  `bank_interview_turn_translations` on demand and can be regenerated; grading never reads it.

## 10. Phases

| Phase | Delivers | Needs first |
| --- | --- | --- |
| **P17a Facts and concepts** | geography, structured address, business categories + automatic mapping, expanded profile + status facts, the registry, the fact sheet and resolvability, coverage panels | — (this document) |
| P17b Training versions | immutable versions, pinning, explicit move, all live readers moved to the pinned version | P17a |
| P17c Validation and exceptions | validators, auto-accept, exception queue, confirmation rules replaced | P17b |
| P17d MCQ bank and recipes | Owner-only concept-first bank, recipes, preview, preflight; AI generation hidden | P17a; `alt` confirmed |
| P17e MCQ evaluation | engine, attempts, PASS/RETEST/FAIL, review-required, progression, grandfathering | P17b, P17d |
| P17f Chatbot script bank | 13 slots with alternates, three languages | P17a; `alt` confirmed |
| P17g Chatbot evaluation | sessions, graded turns, language control, grader adapter, 11/13, legacy freeze | P17b, P17f |
| P17h Review and translations | transcript review, translation cache | P17g |
| P17i Cleanup | AI question generation, D64 officer code, old quiz/exam paths and keys removed; D64 data kept | all |

## 11. Reuse and removal

**Reused:** the seeded RNG and shuffles; frozen per-answer snapshots; `finalize_attempt`; the
one-in-progress index; the attempt board, question card and answer review; `toTemplateRecord`
(superseded by the fact sheet); extraction confidence/provenance and the extract cron; the
append-only and freeze-trigger patterns; D64's session/turn RLS, resume and idle logic; the chat
shell; the `claude | fake | off` adapter seam; the question-gen `translate()` pattern.

**Removed in P17i:** `lib/integrations/question-gen/**`, `lib/db/question-gen.ts`,
`lib/domain/generation-limits.ts`, `admin/questions/generate/**`, `question_generation_batches`,
`questions.source_refs`/`generation_batch_id`/`pools`, per-language `correct_key`, the D64 officer
(`lib/integrations/interview/claude.ts`, `lib/domain/interview/*`, the write paths of
`lib/db/interviews.ts`). "Ask the documents" and `/api/health` first get their own provider
resolution; study-card evidence keeps its passage type. **Not removed:** D64 data.

## 12. Risks

1. Fixed 30 with no skipping means a version waits until every company-level concept resolves;
   the coverage panel (P17a) and precise exceptions (P17c) must say exactly what is missing.
2. Thai address printing varies; unresolved parses need a person (they are reported, not
   guessed).
3. Category mapping quality decides how plausible business distractors look; the dictionary's
   labels are the Owner's lever.
4. Pinning without automatic moves can leave learners on stale facts; record and user pages show
   "newer version available".
5. Semantic grading needs calibration on real Thai transcripts before UAT; its version is stored
   on every graded turn.
6. Learners can read their own answer rows, so the MCQ correct key relies on a column privilege
   and its own test.
7. About twenty end-to-end specs assume quiz, exam and the D64 interview; each phase replaces its
   own tests.

## 13. P17a — facts and concepts (slice spec)

**Goal.** Everything the two evaluations will read exists and is visible: the structured address,
the category, the expanded profile with status facts, and a registry that says, for a record and
for an assignment, which of the 30 MCQ and 13 chatbot concepts already resolve. Nothing is gated
on it yet; confirmation still works exactly as today (D58) until P17c.

**In scope**
1. Geography tables and their generator script (§5.2).
2. `lib/domain/geo/`: printed-address parser and resolver; `lib/db/geo.ts` lookup.
3. `structured_data.address` and `.category` read and written through `readStructuredData`, so
   every existing writer (record save, answers save, extraction, transcript fill) keeps them.
4. `refreshDerivedFacts`: re-derives the address when the printed address changed and re-maps the
   category when the business text changed; called after record/answers saves, after an
   extraction, and after a transcript fill that wrote the address.
5. The expanded profile and the four status facts; the answers form grouped and relabelled by
   status; the legacy answers kept and marked as earlier answers.
6. `business_categories` with a draft seed; an Owner-only page to edit it; the mapper adapter
   (`CATEGORY_MAP_PROVIDER`), the confidence policy key, the category panel on the record page
   (automatic, needs review, or chosen by hand; "map again").
7. `evaluation_concepts` seeded with §7.1, mirrored by `lib/domain/concepts/registry.ts` (a test
   holds them equal).
8. `lib/domain/facts/fact-sheet.ts` and `lib/domain/concepts/resolve.ts` (§7.2–7.3).
9. A coverage panel on the record page (company scope) and on the user page (assignment scope).
10. D70–D79 in the decisions log; the security checklist and runbooks updated.

**Out of scope for P17a:** versions, exceptions, confirmation changes, any question or script
content, any learner-facing change.

**Acceptance**
- Nong Yai / Phon Thong / Roi Et resolves with postcode 45110 from geography; a Bangkok address
  with แขวง/เขต and "กรุงเทพฯ" resolves; an unknown district is reported, not guessed.
- Saving the Level 1 or Level 4 form keeps the stored address and category.
- The fake mapper maps "ขายเสื้อผ้าออนไลน์" to the clothing category above the threshold; an
  unrelated text is left for review; a manual choice survives until the text changes.
- A manager cannot write categories or concepts or geography; the Owner can write categories.
- The registry holds exactly 30 MCQ concepts, 13 slots in the Owner's order, 9 critical keys,
  and matches the TypeScript mirror.
- A fully prepared **record** shows 29/29 MCQ and 12/12 chatbot company concepts, with
  `learner_shareholding` and `attendee_identity` listed as checked per learner — never 30/30 or
  13/13. A learner's **assignment** shows 30/30 and 13/13 only once the role facts resolve.
  Blanking one field names it.
- A missing or low-confidence category changes no count and fails no save or extraction.

## 14. Still open (not blocking P17a)

- The draft business-category list seeded by P17a — the Owner edits it in Admin → Business
  categories before any BUSINESS_ALTERNATIVE variant goes live (P17d).

Settled by the Owner's corrections of 2026-09-30: the `alt` conditions (§7.1), the appointment
requiring a created name card (§4), the two readiness scopes (§7.3), category mapping as
non-blocking metadata (§5.3), and Owner-only assessment content superseding D54 (D76).

## 15. Amendment 2026-10-01 — fewer questions (D91)

The Owner: a manager handling many DBD packs cannot write twenty answers for each, so only the
questions that cannot be removed or avoided are asked.

**Asked of the manager.** With the pack (D80, unchanged): company email, company phone, what the
business does, what it sells. On the record: `client_origin`, `customer_profile`,
`main_suppliers`, `monthly_revenue`, `average_transaction`.

**Standard answers** (`lib/domain/standard-answers.ts`, applied in `buildFactSheet`; they always
win over anything typed earlier for the same field):

| Fact | Standard answer |
| --- | --- |
| `main_clients` | `customer_profile` |
| `business_purpose` | built from `nature_of_business` |
| `business_address` | the head office address |
| `monthly_transactions` | `monthly_revenue` ÷ `average_transaction`, at least 1 |
| `revenue_basis` | built from the two amounts |
| `transaction_details` | bank transfer and PromptPay / QR, with the average amount |
| `source_of_funds`, `first_incoming_funds`, `account_purpose`, `promptpay_qr_purpose` | the same Thai answer for every company |
| `operations_started`, `has_existing_customers`, `has_completed_transactions`, `has_regular_suppliers` | always yes |

An amount must be written in digits; one scaled by a word ("3 แสน", "300k") is not divided, and
the record lists transactions per month as missing. A missing source is reported once, not each
answer worked out from it.

**Registry.** The MCQ keeps its 30 concepts in their order; `main_clients` stays concept 14 and
leaves the chatbot. `customer_examples` is removed. Chatbot slots: 1 company_name,
2 registration_number, 3 registered_address, 4 actual_business, 5 products_services,
6 authorized_representative, 7 attendee_identity, 8 registration_date, 9 account_purpose,
10 customer_profile, 11 transaction_details. The only alternate wording left is
`learner_shareholding` on `learner_is_shareholder`. Readiness: a company record counts 29 MCQ and
10 chatbot concepts, an assignment 30 and 11.

**Pass marks.** MCQ unchanged (D71). Chatbot: 9 of 11 (80%).

**Earlier answers.** `monthly_volume`, `clients_location`, `suppliers_location` and
`operations_status` are still printed on the bank-interview study card; they are kept as
written and, left blank, follow `monthly_revenue`, `customer_profile`, `main_suppliers` and
"operations have started".
