# P13 — The bank's 16 interview concepts

| | |
|---|---|
| Builds on | P3 study cards, P4/P5 assessments, P8 call training, P11 AI authoring, P12 three-level DBD |
| Requested by | owner (2026-09-18): the lawyers' list of questions a Thai bank asks when a company opens an account — "study materials, quiz and exam are built around these concepts; the wording may vary, the concepts do not" |
| Status | Implemented |

## 1. The concepts

`lib/domain/bank-interview.ts` holds the 16 questions (TH/EN/ZH) in four groups, each mapped to the template placeholders that answer it:

| Group | Concepts | Placeholders |
|---|---|---|
| identity | company name; incorporation date; number of directors; registered address | `company_name_th/en`, `registration_date`, `directors_count`, `head_office_address`, `province` |
| ownership | number of shareholders; my shares / percentage; registered capital and total shares; other shareholders and my relationship to them | `shareholders_count`, `my_shares`, `my_share_percent`, `registered_capital`, `total_shares`, `par_value`, `shareholders`, `my_relationship` |
| business plan | primary activity; why open an account; projected monthly inflows/outflows; where clients and suppliers are; source of funds | `objectives`, `business_categories`, `account_purpose`, `monthly_volume`, `clients_location`, `suppliers_location`, `source_of_funds` |
| personal | my position and responsibilities; actual place of business; commenced operations? | `my_name`, `my_position`, `my_responsibilities`, `business_address`, `operations_status` |

## 2. Where the answers come from

| Source | Fields | Entered where |
|---|---|---|
| DBD documents (Levels 1–3, P12) | identity, capital, shares, directors, shareholders, objectives | extracted / edited on the record |
| **Level 4 — interview answers** (new) | account purpose, monthly volume, clients, suppliers, source of funds, actual place of business, operations status | record page → "Level 4" form (`structured_data.interview`), editable even after confirmation |
| **Learner role** (new) | name as in the DBD, position, responsibilities, relationship to other shareholders | user page → role form on the active assignment (`user_dbd_assignments.holder_name …`, migration 0014) |
| Derived | `directors_count`, `shareholders_count`, `my_shares`, `my_share_percent` (name match against Level 2 shareholders) | `toTemplateRecord(record, role)` |

## 3. Where the concepts are used

- **Study**: five starter cards (`lib/content/bank-interview-cards.ts`, one per group + tips) loadable from Admin → Study content; bodies use placeholders, rendered leniently (`—` for unknown facts) with the learner's own record and role.
- **Quiz / exam**: the AI generator's reference text lists all 16 concepts and the new placeholders; batches are asked to cover the concepts rather than the certificate layout. Existing validation (D34/D36) still applies.
- **Call training**: `BANK_OFFICER_SCRIPT` walks the 16 questions in Thai; the assistant receives the record + role facts as variables (missing facts are "-", never invented).

## 4. Decisions

- **D39** (see decisions log).
- Interview answers are company facts, so they live on the record, not on the assignment; the learner's role is per person, so it lives on the assignment.
- Placeholders never expose another shareholder's numbers to a learner: `my_*` resolves only from the learner's own `holder_name` match.

## 5. Tests

Unit: 16 concepts, every placeholder known to the template engine, starter cards only use known placeholders, `myShareholding`. Integration: role update, interview save. E2E: load starter cards → Level 4 answers → learner role → personalised ownership/business/role cards.
