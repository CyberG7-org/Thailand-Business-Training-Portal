-- P17e: the Business Knowledge Quiz (spec 2026-09-30 §8, D71, D72, D100).
-- An attempt asks one bank variant for each of the 30 MCQ concepts, marks each answer at once
-- and ends in pass, retest or fail.

-- 1. A third result.
alter table public.assessment_attempts
  drop constraint assessment_attempts_result_check,
  add constraint assessment_attempts_result_check
    check (result = any (array['pass'::text, 'retest'::text, 'fail'::text]));

-- 2. The rule an attempt is judged by, frozen when it starts (thresholds and critical concepts).
alter table public.assessment_attempts add column rule_snapshot jsonb;
comment on column public.assessment_attempts.rule_snapshot is
  'P17e: {"passScore": 27, "retestScore": 23, "criticalKeys": [...]}; null on earlier attempts.';

-- 3. The concept each answer row stands for; null on earlier attempts and in the practice round.
alter table public.assessment_answers
  add column concept_key text references public.evaluation_concepts(key);

-- 4. What the server keeps to itself about a question until it is answered: which presented
--    option is correct, and the question as rendered for this learner in each language (with its
--    explanation), so an answered attempt reads the same whatever is edited afterwards. A learner
--    reads their own answer rows; this table has no policy, so only the service role reads it.
create table public.assessment_answer_keys (
  answer_id uuid primary key references public.assessment_answers (id) on delete cascade,
  correct_key text not null check (correct_key in ('A', 'B', 'C', 'D')),
  localized jsonb not null check (jsonb_typeof(localized) = 'object' and localized ? 'th')
);
comment on table public.assessment_answer_keys is
  'P17e: the correct presented option and the rendered th/en/zh text of a bank question in an attempt. Service role only.';

alter table public.assessment_answer_keys enable row level security;
revoke all on public.assessment_answer_keys from anon, authenticated;

-- 5. The thresholds, as settings the Owner can see (D71).
insert into public.policy_config (key, value) values
  ('mcq_pass_score', '27'::jsonb),
  ('mcq_retest_score', '23'::jsonb)
on conflict (key) do nothing;
