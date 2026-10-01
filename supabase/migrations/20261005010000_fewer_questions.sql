-- D91 (Owner, 2026-10-01): only the questions that cannot be removed or avoided stay. The quiz
-- keeps its 30 concepts. The interview loses its two repeated customer questions (main
-- customers, examples of real customers) and closes up to 11 slots. The company status is
-- always yes, so no concept has an "expected…" wording any more. Mirrors
-- lib/domain/concepts/registry.ts (tests/integration/evaluation-concepts.test.ts).

-- 1. Variants first, while the guard would still accept them. It is switched off for these two
--    statements only: neither is an edit by a person, and the second must not send an approved
--    variant back to draft for losing a condition that is now always true.
alter table public.questions disable trigger questions_variant_guard;

-- Worded for a status that can no longer be "no": never asked again.
update public.questions
   set approval_status = 'retired'
 where concept_key is not null
   and applies_when ->> 'fact' in
     ('operations_started', 'has_existing_customers', 'has_completed_transactions', 'has_regular_suppliers')
   and (applies_when ->> 'value')::boolean = false;

-- Worded for "yes": now the wording for every company.
update public.questions
   set applies_when = null
 where concept_key is not null
   and applies_when ->> 'fact' in
     ('operations_started', 'has_existing_customers', 'has_completed_transactions', 'has_regular_suppliers')
   and (applies_when ->> 'value')::boolean = true;

alter table public.questions enable trigger questions_variant_guard;

-- 2. Examples of real customers was an interview question only, so no variant points at it.
delete from public.evaluation_concepts where key = 'customer_examples';

-- 3. Main customers stays quiz question 14 and leaves the interview.
update public.evaluation_concepts
   set interview_slot = null, interview_match = null
 where key = 'main_clients';

-- 4. The interview closes up to 1–11.
update public.evaluation_concepts set interview_slot = 10 where key = 'customer_profile';
update public.evaluation_concepts set interview_slot = 11 where key = 'transaction_details';

-- 5. The company status is always yes: only the learner's own shareholding still turns wording.
update public.evaluation_concepts set alternate_when = '{}' where key <> 'learner_shareholding';

alter table public.evaluation_concepts
  drop constraint evaluation_concepts_interview_slot_check,
  add constraint evaluation_concepts_interview_slot_check check (interview_slot between 1 and 11);
